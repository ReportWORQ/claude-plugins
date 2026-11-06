import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Key, Status } from '../types'

// rw-env's strip above the message box and its panel (lab ADR-0030). The keys themselves reach each session through
// rw-env.sh, the command hook beside this file; this only shows what is there and offers the next step.
//
// What it may do is what the computer's token may do: read names, where each comes from and test results, and test one of
// this person's own keys. It never reads, keeps or draws a value: from the cache it takes the name and source columns only.
// Adding or changing a key opens the Environment page, behind Google sign-in, because a text box here can't hide what is
// typed and a laptop's file should not be able to change anyone's keys.

const LAB = 'https://lab.reportworq.com/env'
const PANE = 'rw-env'
const BLANK: Status = {
  state: 'none', isOnline: false, keys: [], missing: [], savedAt: 0, code: '', version: '', note: '', isBusy: false,
}
const status = atom({ plugin: 'rw-env', key: 'status' } as const, BLANK, { shape: 'status-1' })
const isHidden = atom({ plugin: 'rw-env', key: 'isHidden' } as const, false)
const NAME_OK = /^[A-Z][A-Z0-9_]{0,127}$/
const TOKEN_OK = /^rwenv_[A-Za-z0-9_-]+$/
const CODE_OK = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/
// ReportWORQ's own colours (the product's theme): its teal for headings and the mark's orange for the accent.
const TEAL = '#37A686'
const ORANGE = '#F55E31'
const RED = '#E5484D'
// The grid: every row of every group has the same columns, so names, results and buttons line up.
const COL = { name: 28, result: 24, test: 8, link: 12 } as const
let mark = ''          // the ReportWORQ mark as base64 PNG, read once from the plugin's own assets

const LABEL: Record<string, string> = { ok: 'Works', bad: 'Rejected', unknown: "Couldn't test", format: 'Looks right' }
type Result = 'ok' | 'bad' | 'unknown' | 'format'
const RESULTS: readonly string[] = ['ok', 'bad', 'unknown', 'format']

async function readText($: EngineInterface, path: string): Promise<string> {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  } catch {
    return ''
  }
}

function dir(): string {
  return '.config/rw-env'
}

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
}

// What this computer has saved: the token, a pending sign-in, and the names in the cache (never the values).
async function local($: EngineInterface) {
  const base = `${await home($)}/${dir()}`
  const token = (await readText($, `${base}/token`)).trim()
  const pending = (await readText($, `${base}/pending`)).split('\n')[1]?.trim() ?? ''
  const cache = await readText($, `${base}/cache`)
  const keys: Key[] = cache.split('\n').filter(Boolean).map(line => {
    const cols = line.split('\t')
    return { name: cols[0] ?? '', source: (cols[2] ?? '').slice(0, 32) }      // cols[1], the value, is never kept
  }).filter(k => NAME_OK.test(k.name))
  let savedAt = 0
  try {
    if (cache) savedAt = (await $.fs.stat(`${base}/cache`)).mtimeMs
  } catch {
    savedAt = 0
  }
  let version = ''
  try {
    version = String(JSON.parse(String(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))).version ?? '')
  } catch {
    version = ''
  }
  return { token: TOKEN_OK.test(token) ? token : '', code: CODE_OK.test(pending) ? pending : '', keys, savedAt, version }
}

function cleanKeys(raw: unknown): Key[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(k => k && typeof k.name === 'string' && NAME_OK.test(k.name)).map(k => ({
    name: k.name, source: String(k.source ?? '').slice(0, 32), checkable: !!k.checkable,
    testedWith: typeof k.testedWith === 'string' && NAME_OK.test(k.testedWith) ? k.testedWith : null,
    check: k.check && RESULTS.includes(k.check.result)
      ? { result: k.check.result as Result, detail: String(k.check.detail ?? '').slice(0, 80), at: Number(k.check.at) || 0 } : null,
  }))
}

// Look again: the files first, then the lab for test results and keys still to add. Offline, the saved names stand.
async function look($: EngineInterface, note?: string) {
  const mine = await local($)
  let isOnline = false
  let keys = mine.keys
  let missing: string[] = []
  if (mine.token) {
    try {
      const r = await $.http.fetch(`${LAB}/status`, { headers: { Authorization: `Bearer ${mine.token}` } })
      if (r.ok) {
        const doc = JSON.parse(r.text)
        isOnline = true
        keys = cleanKeys(doc.keys)
        missing = Array.isArray(doc.missing) ? doc.missing.filter((n: unknown) => typeof n === 'string' && NAME_OK.test(n)) : []
      }
    } catch {
      isOnline = false
    }
  }
  const state: Status['state'] = mine.token ? 'connected' : mine.code ? 'waiting' : 'none'
  await update($, status, old => ({
    state, isOnline, keys, missing, savedAt: mine.savedAt, code: mine.code, version: mine.version,
    note: note ?? old.note, isBusy: false,
  }))
}

// The hook's own refresh: it finishes or starts a sign-in, fetches, and puts the keys in place for this session.
async function refresh($: EngineInterface) {
  await update($, status, old => ({ ...old, isBusy: true, note: '' }))
  let said = ''
  try {
    const r = await $.process.run(['bash', `${$.plugin.root}/hooks/rw-env.sh`, 'refresh'], { timeoutMs: 30000 })
    said = r.stdout.split('\n').filter(Boolean).map(l => l.replace(/^rw-env: /, '')).pop() ?? ''
  } catch {
    said = "Couldn't run the refresh."
  }
  // The hook's lines are written for Claude; the panel shows them only when they are short and plain.
  await look($, said.length < 160 && !/https?:/.test(said) ? said : '')
}

async function test($: EngineInterface, name: string) {
  const { token } = await local($)
  if (!token) return
  await update($, status, old => ({ ...old, isBusy: true }))
  let note = ''
  try {
    const r = await $.http.fetch(`${LAB}/test`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) note = `${name}: ${String(JSON.parse(r.text || '{}').error ?? 'the test did not run').slice(0, 120)}`
  } catch {
    note = `${name}: couldn't reach the lab`
  }
  await look($, note)
}

function where(source: string): string {
  return source === 'mine' ? 'Mine' : source === 'common' ? 'Shared with everyone' : `Shared with ${source}`
}

function clock(ms: number): string {
  if (!ms) return 'never'
  const d = new Date(ms)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return new Date().toDateString() === d.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function summary(s: Status): string {
  if (s.state === 'none') return 'rw-env · Not connected'
  if (s.state === 'waiting') return 'rw-env · Waiting for you to press Allow'
  const bits = [`${s.keys.length} keys`, `saved ${clock(s.savedAt)}`]
  const bad = s.keys.filter(k => k.check?.result === 'bad').length
  if (bad) bits.push(`${bad} rejected`)
  if (s.missing.length) bits.push(`${s.missing.length} to add`)
  if (!s.isOnline) bits.push('lab not reachable')
  return `rw-env · ${bits.join(' · ')}`
}

async function loadMark($: EngineInterface) {
  try {
    const got = await $.fs.read(`${$.plugin.root}/assets/rw-mark.png`, { as: 'bytes' })
    const b64 = typeof got === 'object' && got && 'base64' in got ? String(got.base64) : ''
    // A PNG that isn't one would make the engine refuse the whole pane; draw the title alone instead.
    // The PNG signature then its IHDR chunk, which the engine checks for.
    mark = b64.startsWith('iVBORw0KGgoAAAANSUhEUg') && b64.length < 200_000 ? b64 : ''
  } catch {
    mark = ''
  }
}

function resultColor(r: string | undefined): string | undefined {
  return r === 'ok' ? TEAL : r === 'bad' ? RED : undefined
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'ReportWORQ keys' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: 'keys', description: 'Show your ReportWORQ keys and their status' })
    void loadMark($)
    void look($)        // not awaited: an unreachable lab must not hold up the session
    return ran
  })

  on('command.run', { command: 'keys' }, async $ => {
    void look($)
    const { isPlaced } = await openPane($)
    return { text: isPlaced ? 'Opened your ReportWORQ keys.' : 'This app has nowhere to show the keys panel.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const s = await read($, status)
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const needs = s.state !== 'connected' || s.keys.some(k => k.check?.result === 'bad') || s.missing.length > 0
    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        <Text color={ORANGE} weight="semibold">rw-env</Text>
        <Text color={needs ? undefined : TEAL} dimColor={!needs}>{summary(s).replace(/^rw-env · /, '')}</Text>
        {s.isBusy && <Text dimColor>working…</Text>}
        {s.state === 'none' && <Button key="connect" variant="primary" onPress={() => { void refresh($) }}>Connect</Button>}
        {s.state === 'waiting' && <Link href={`${LAB}/device?code=${s.code}`}>Open the sign-in page</Link>}
        {s.state === 'waiting' && <Button key="done" variant="primary" onPress={() => { void refresh($) }}>I pressed Allow</Button>}
        {s.state === 'connected' && <Button key="keys" onPress={() => { void openPane($) }}>Keys</Button>}
        {s.state === 'connected' && <Button key="refresh" onPress={() => { void refresh($) }}>Refresh</Button>}
        <Button key="hide" dimColor onPress={() => { void update($, isHidden, () => true) }}>Hide</Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await read($, status)
    const els = $.ui.resolve(e)
    const { Box, Button, Link, Text } = els
    // Only some surfaces draw images; elsewhere the title stands alone.
    const Image = 'Image' in els ? els.Image : undefined
    const groups = new Map<string, Key[]>()
    for (const k of s.keys) groups.set(k.source, [...(groups.get(k.source) ?? []), k])
    const order = [...groups.keys()].sort((a, b) => (a === 'mine' ? -1 : b === 'mine' ? 1 : a === 'common' ? -1 : b === 'common' ? 1 : a.localeCompare(b)))

    const cell = (width: number, child: RenderChildren, end = false) => (
      <Box width={width} flexShrink={0} justifyContent={end ? 'flex-end' : 'flex-start'}>{child}</Box>
    )
    const row = (k: Key) => (
      <Box key={`row-${k.name}`} flexDirection="row" alignItems="center">
        {cell(COL.name, <Text mono wrap="truncate-end">{k.name}</Text>)}
        {cell(COL.result, k.check
          ? <Text color={resultColor(k.check.result)} dimColor={k.check.result !== 'ok' && k.check.result !== 'bad'} wrap="truncate-end">
              {LABEL[k.check.result] ?? k.check.result}{k.check.detail ? ` (${k.check.detail})` : ''}</Text>
          : <Text dimColor wrap="truncate-end">{k.testedWith ? `with ${k.testedWith.replace(/_.*$/, '')}` : k.checkable ? 'Not tested yet' : 'No test'}</Text>)}
        {cell(COL.test, k.checkable && s.isOnline
          ? <Button key={`test-${k.name}`} onPress={() => { void test($, k.name) }}>Test</Button> : <Text> </Text>, true)}
        {cell(COL.link, <Link href={`${LAB}/#key=${k.name}`}>{k.source === 'mine' ? 'Change' : 'Use my own'}</Link>, true)}
      </Box>
    )
    const card = (title: string, count: string, body: RenderChildren) => (
      <Box flexDirection="column" borderStyle="round" borderColor={TEAL} paddingX={1} marginTop={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text color={TEAL} weight="semibold">{title}</Text>
          <Text dimColor>{count}</Text>
        </Box>
        {body}
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {mark !== '' && Image && <Image key="mark" source={{ png: mark }} columns={4} rows={2} alt="ReportWORQ" />}
          <Box flexDirection="column">
            <Text size="heading" weight="semibold">ReportWORQ keys</Text>
            <Text dimColor size="caption">{summary(s).replace(/^rw-env · /, '')}{s.version ? `  ·  rw-env ${s.version}` : ''}{s.isBusy ? '  ·  working…' : ''}</Text>
          </Box>
        </Box>
        {s.note !== '' && <Text dimColor size="caption">{s.note}</Text>}

        {s.state === 'none' && card('Connect this computer', '', (
          <Box flexDirection="column" rowGap={1}>
            <Text>This computer isn't connected to the ReportWORQ lab yet.</Text>
            <Box><Button key="connect" variant="primary" onPress={() => { void refresh($) }}>Connect</Button></Box>
          </Box>
        ))}
        {s.state === 'waiting' && card('Almost there', '', (
          <Box flexDirection="column" rowGap={1}>
            <Text>Open the sign-in page, sign in with Google and press Allow. Then come back here.</Text>
            <Link href={`${LAB}/device?code=${s.code}`}>Open the sign-in page (code {s.code})</Link>
            <Box><Button key="done" variant="primary" onPress={() => { void refresh($) }}>I pressed Allow</Button></Box>
          </Box>
        ))}

        {order.map(src => card(where(src), `${(groups.get(src) ?? []).length}`, (
          <Box flexDirection="column">{(groups.get(src) ?? []).map(row)}</Box>
        )))}

        {s.missing.length > 0 && card('To add', `${s.missing.length}`, (
          <Box flexDirection="column">
            {s.missing.map(n => (
              <Box key={`add-${n}`} flexDirection="row" alignItems="center">
                {cell(COL.name, <Text mono wrap="truncate-end">{n}</Text>)}
                {cell(COL.result, <Text color={ORANGE}>Not set yet</Text>)}
                {cell(COL.test, <Text> </Text>)}
                {cell(COL.link, <Link href={`${LAB}/#key=${n}`}>Add</Link>, true)}
              </Box>
            ))}
          </Box>
        ))}

        <Box flexDirection="row" alignItems="center" columnGap={2} marginTop={1}>
          {s.state === 'connected' && <Button key="refresh" variant="primary" onPress={() => { void refresh($) }}>Refresh</Button>}
          <Link href={`${LAB}/#add`}>Add a key of my own</Link>
          <Link href={`${LAB}/`}>Environment page</Link>
        </Box>
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Text dimColor size="caption">Values are never shown here. Changes open the Environment page.</Text>
          <Button key="strip" plain dimColor onPress={() => { void update($, isHidden, h => !h) }}>Toggle the bar</Button>
        </Box>
      </Box>
    )
  })
}

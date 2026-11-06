import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Key, Status } from '../types'

// Shows what rw-env (lab ADR-0030) has put on this computer: connected or not, the plugin's version, when the keys were
// last saved and each key's name and where it comes from. rw-env's cache holds the values too; this reads only the name
// and source columns and keeps nothing else, so no value is ever drawn, stored or handed to Claude.

const PANE = 'rw-env-status'
const PAGE = 'https://lab.reportworq.com/env/'
const EMPTY: Status = { state: 'missing', keys: [], syncedAt: 0, version: '', note: '', surface: '' }
const status = atom({ plugin: 'rw-env-status', key: 'status' } as const, EMPTY, { shape: 'status-1' })

type Found = { status: Omit<Status, 'note' | 'surface'>; hook: string }

function newest(versions: string[]): string {
  const parts = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
  return [...versions].sort((a, b) => {
    const x = parts(a), y = parts(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  }).pop() ?? ''
}

function label(source: string): string {
  return source === 'mine' ? 'Mine' : source === 'common' ? 'Shared with everyone' : `Shared with ${source}`
}

function clock(ms: number): string {
  if (!ms) return 'never'
  const d = new Date(ms)
  const same = new Date().toDateString() === d.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return same ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

async function look($: EngineInterface): Promise<Found> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  const dir = `${home}/.config/rw-env`
  const plugins = `${home}/.claude/plugins/cache/reportworq/rw-env`
  let version = ''
  try {
    version = newest((await $.fs.list(plugins)).filter(e => e.kind === 'dir').map(e => e.name))
  } catch {
    version = ''
  }
  const hook = version ? `${plugins}/${version}/hooks/rw-env.sh` : ''
  const has = async (p: string) => { try { return await $.fs.exists(p) } catch { return false } }
  let keys: Key[] = []
  let syncedAt = 0
  if (await has(`${dir}/cache`)) {
    const text = await $.fs.read(`${dir}/cache`)
    keys = String(text).split('\n').filter(Boolean).map(line => {
      const cols = line.split('\t')
      return { name: cols[0] ?? '', source: cols[2] ?? '' }      // cols[1], the value, is never kept
    }).filter(k => /^[A-Z][A-Z0-9_]*$/.test(k.name))
    syncedAt = (await $.fs.stat(`${dir}/cache`)).mtimeMs
  }
  const state: Status['state'] = !version ? 'missing'
    : (await has(`${dir}/token`)) ? 'connected'
    : (await has(`${dir}/pending`)) ? 'waiting' : 'none'
  return { status: { state, keys, syncedAt, version }, hook }
}

function line(s: Status): string {
  if (s.state === 'missing') return 'rw-env: not installed'
  if (s.state === 'waiting') return 'rw-env: waiting for you to press Allow'
  if (s.state === 'none') return 'rw-env: not connected'
  return `rw-env ${s.version} · ${s.keys.length} keys · saved ${clock(s.syncedAt)}`
}

async function reload($: EngineInterface, note?: string, surface?: string) {
  const found = await look($)
  const next = await update($, status, old => ({
    ...found.status, note: note ?? old.note, surface: surface ?? old.surface,
  }))
  $.ui.status(line(next ?? { ...EMPTY, ...found.status }))
  return found
}

async function refresh($: EngineInterface) {
  const found = await look($)
  if (!found.hook) return
  await update($, status, old => ({ ...old, note: 'Refreshing…' }))
  const r = await $.process.run(['bash', found.hook, 'refresh'], { timeoutMs: 20000 })
  const said = r.stdout.split('\n').filter(Boolean).pop() ?? ''
  await reload($, said.replace(/^rw-env: /, '').slice(0, 200))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: 'keys', description: 'Show your ReportWORQ lab connection and key names' })
    await reload($, undefined, (e as { surface?: string }).surface ?? '')
    // The test opens the pane by itself, so it shows whether a pane is drawn at all; the real one would wait to be asked.
    void $.ui.open({ id: PANE, title: 'ReportWORQ keys' })
    return ran
  })

  on('command.run', { command: 'keys' }, async $ => {
    await reload($)
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'ReportWORQ keys' })
    return { text: isPlaced ? 'Opened the ReportWORQ keys pane.' : 'This app has nowhere to show the pane.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const s = await read($, status)
    const press = () => { void refresh($) }
    const groups = new Map<string, string[]>()
    for (const k of s.keys) groups.set(k.source, [...(groups.get(k.source) ?? []), k.name])
    const order = [...groups.keys()].sort((a, b) => (a === 'mine' ? -1 : b === 'mine' ? 1 : a.localeCompare(b)))
    return (
      <Box flexDirection="column">
        <Text bold>{line(s)}</Text>
        {s.state === 'missing' && <Text dimColor>Add the rw-env plugin from the reportworq marketplace.</Text>}
        {s.state === 'waiting' && <Text dimColor>Open the link Claude gave you, press Allow, then press Refresh.</Text>}
        {s.state === 'none' && <Text dimColor>Start a new session to get a sign-in link.</Text>}
        {order.map(src => (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold>{label(src)}</Text>
            {(groups.get(src) ?? []).map(n => <Text>  {n}</Text>)}
          </Box>
        ))}
        <Text> </Text>
        {s.note !== '' && <Text dimColor>{s.note}</Text>}
        <Box flexDirection="row">
          {s.state !== 'missing' && <Button key="refresh" onPress={press}>Refresh</Button>}
          <Text>  </Text>
          <Link href={PAGE}>Environment page</Link>
        </Box>
        <Text dimColor>Test build · drawn on {e.surface} · values are never shown</Text>
      </Box>
    )
  })
}

import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'rw-env', component: 'Pane', requestId: 'rw-env',
  props: { title: 'ReportWORQ keys', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const STRIP = { plugin: 'rw-env', component: 'AbovePrompt', props: { hasSurvey: false } } as const

const HOME = '/home/pat'
const D = `${HOME}/.config/rw-env`
const SECRET = 'U0VDUkVUVkFMVUU='        // "SECRETVALUE"
const CACHE = `TEAMCITY_TOKEN\t${SECRET}\tmine\nVIMEO_ACCESS_TOKEN\t${SECRET}\tcommon\nRW_PASSWORD\t${SECRET}\tqa\n`
const STATUS = {
  keys: [
    { name: 'TEAMCITY_TOKEN', source: 'mine', checkable: true, check: { result: 'bad', detail: '', at: 1 } },
    { name: 'VIMEO_ACCESS_TOKEN', source: 'common', checkable: true, check: { result: 'ok', detail: 'ReportWORQ', at: 1 } },
    { name: 'RW_PASSWORD', source: 'qa', checkable: false, check: null },
  ],
  missing: ['ZENDESK_EMAIL'],
}

type Seen = { fetches: { url: string; init: any }[]; runs: string[][] }

function computer(on: any, files: Record<string, string>, lab: { status?: number; down?: boolean; text?: string } = {}): Seen {
  const seen: Seen = { fetches: [], runs: [] }
  on('env.get', (_: unknown, e: any) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.exists', (_: unknown, e: any) => ({ value: String(e.path) in files }))
  on('fs.read', (_: unknown, e: any) => {
    const p = String(e.path)
    if (p.endsWith('/.claude-plugin/plugin.json')) return { value: '{"version":"0.3.0"}' }
    return { value: files[p] ?? '' }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false } }))
  on('http.fetch', (_: unknown, e: any) => {
    seen.fetches.push({ url: e.url, init: e.init ?? e })
    if (lab.down) throw new Error('offline')
    const isTest = String(e.url).endsWith('/test')
    return { value: { status: lab.status ?? 200, ok: (lab.status ?? 200) < 300, headers: {}, text: isTest ? '{"result":"ok"}' : (lab.text ?? JSON.stringify(STATUS)) } }
  })
  on('process.run', (_: unknown, e: any) => { seen.runs.push(e.argv ?? e); return { value: { exitCode: 0, stdout: 'rw-env: already up to date.\n', stderr: '' } } })
  on('command.register', () => ({ value: { command: 'keys' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  return seen
}

const CONNECTED = { [`${D}/cache`]: CACHE, [`${D}/token`]: 'rwenv_abc\n' }
const settle = () => new Promise(r => setTimeout(r, 30))

test('connected: the strip counts, the panel groups names with results, and no value is drawn', async ($, on) => {
  const seen = computer(on, CONNECTED)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  expect(seen.fetches[0]?.url).toBe('https://lab.reportworq.com/env/status')
  const strip = await $.ui.mount({ ...STRIP, surface: 'desktop' })
  expect(await strip.find({ type: 'Text', text: /3 keys .* 1 rejected .* 1 to add/ })).toBeDefined()
  await strip.unmount()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const t of [/^Mine$/, /Shared with everyone/, /Shared with qa/, /^To add$/, /Rejected/, /Works \(ReportWORQ\)/, /ZENDESK_EMAIL/]) {
      expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /SECRETVALUE|U0VDUkVU/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('Test asks the lab with the token and nothing else', async ($, on) => {
  const seen = computer(on, CONNECTED)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'test-TEAMCITY_TOKEN' })
  await settle()
  const t = seen.fetches.find(f => f.url.endsWith('/test'))
  expect(t?.init.body).toBe('{"name":"TEAMCITY_TOKEN"}')
  expect(t?.init.headers.Authorization).toBe('Bearer rwenv_abc')
  await ui.unmount()
})

test('offline: the saved names still show, and say the lab is not reachable', async ($, on) => {
  computer(on, CONNECTED, { down: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /lab not reachable/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TEAMCITY_TOKEN/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /SECRETVALUE|U0VDUkVU/ })).toBeUndefined()
  await ui.unmount()
})

test('not connected: Connect runs the hook, and waiting shows the sign-in code', async ($, on) => {
  const files: Record<string, string> = {}
  const seen = computer(on, files)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const strip = await $.ui.mount({ ...STRIP, surface: 'desktop' })
  expect(await strip.find({ type: 'Text', text: /Not connected/ })).toBeDefined()
  files[`${D}/pending`] = 'devicecode\nABCD-EFGH\n'
  await strip.press({ key: 'connect' })
  await settle()
  expect(seen.runs[0]?.[2]).toBe('refresh')
  expect(seen.fetches.length).toBe(0)
  await strip.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Link', text: /code ABCD-EFGH/ })).toBeDefined()
  await ui.unmount()
})

test('a malformed pending code or token is not used', async ($, on) => {
  const seen = computer(on, { [`${D}/token`]: 'not a token; rm -rf', [`${D}/pending`]: 'x\nnot-a-code"><\n' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  expect(seen.fetches.length).toBe(0)
  const ui = await $.ui.mount({ ...STRIP, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Not connected/ })).toBeDefined()
  await ui.unmount()
})

test('a hostile lab answer cannot break the panel', async ($, on) => {
  computer(on, CONNECTED, { text: JSON.stringify({
    keys: [{ name: 'A_KEY', source: 'mine', checkable: true, testedWith: 'x y"><', check: { result: 'constructor', detail: 'x', at: 1 } },
           { name: 'bad name', source: 'mine' }],
    missing: ['B_KEY', 'not ok'],
  }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /A_KEY/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /not tested yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bad name|not ok|constructor|x y/ })).toBeUndefined()
  await ui.unmount()
})

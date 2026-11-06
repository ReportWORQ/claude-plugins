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

function computer(on: any, files: Record<string, string>, lab: { status?: number; down?: boolean; text?: string; mark?: string } = {}): Seen {
  const seen: Seen = { fetches: [], runs: [] }
  on('env.get', (_: unknown, e: any) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.exists', (_: unknown, e: any) => ({ value: String(e.path) in files }))
  on('fs.read', (_: unknown, e: any) => {
    const p = String(e.path)
    if (p.endsWith('/.claude-plugin/plugin.json')) return { value: '{"version":"0.3.0"}' }
    if (p.endsWith('/assets/rw-mark.png')) return { value: { base64: lab.mark ?? MARK } }
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
// The real mark: the engine checks a PNG's header, so a stand-in would be refused.
const MARK = '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'
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
  expect(await ui.find({ type: 'Text', text: /not tested yet/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bad name|not ok|constructor|x y/ })).toBeUndefined()
  await ui.unmount()
})

test('the mark is a PNG the engine accepts', async ($, on) => {
  // The engine refuses a whole pane over an Image it can't read, so a mount that succeeds proves the mark passed.
  computer(on, CONNECTED)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^ReportWORQ keys$/ })).toBeDefined()
  await ui.unmount()
})

test('a damaged mark file does not cost the pane', async ($, on) => {
  computer(on, { ...CONNECTED }, { mark: 'iVBORw0KGgo=' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^ReportWORQ keys$/ })).toBeDefined()
  await ui.unmount()
})

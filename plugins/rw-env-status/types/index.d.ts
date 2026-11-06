export type Key = { name: string; source: string }

export type Status = {
  /** connected: has a token; waiting: a sign-in link is out; none: neither; missing: rw-env isn't installed */
  state: 'connected' | 'waiting' | 'none' | 'missing'
  keys: Key[]
  /** when the keys on this computer were last saved, epoch ms; 0 when never */
  syncedAt: number
  /** the installed rw-env plugin's version, or '' */
  version: string
  /** the last refresh's words, for the pane */
  note: string
  /** what this session's surface is, for the test report */
  surface: string
}

declare module 'claude-code' {
  interface PluginState {
    'rw-env-status': { status: Shaped<Status> }
  }
}

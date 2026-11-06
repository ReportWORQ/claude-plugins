export type Check = { result: 'ok' | 'bad' | 'unknown' | 'format'; detail: string; at: number }

export type Key = {
  name: string
  /** mine, common, or a group's name */
  source: string
  checkable?: boolean
  testedWith?: string | null
  check?: Check | null
}

export type Status = {
  /** connected: has a token; waiting: a sign-in link is out; none: neither */
  state: 'connected' | 'waiting' | 'none'
  /** false when the lab couldn't be reached, and the names come from what this computer saved */
  isOnline: boolean
  keys: Key[]
  /** keys the admins ask everyone to add, still not added */
  missing: string[]
  /** when this computer last saved its keys, epoch ms; 0 when never */
  savedAt: number
  /** the sign-in code while waiting for Allow */
  code: string
  version: string
  /** the last action's words */
  note: string
  isBusy: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'rw-env': { status: Shaped<Status>; isHidden: boolean }
  }
}

export type Badge = {
  role: string
  task: string
  history: string[]
}

export type Meta = {
  model: string
  folder: string
  seed: number
}

export type Palette = {
  colors: string[]
  dark: string
  warn: string
  alert: string
  track: string
  blush: string
}

export type Usage = {
  context?: number
  filled?: number
  window?: number
  fiveHour?: number
  fiveHourResets?: string
  sevenDay?: number
  sevenDayResets?: string
  usd?: number
  now?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-badge': { badge: Badge; meta: Meta; palette: Palette; usage: Usage }
  }
}

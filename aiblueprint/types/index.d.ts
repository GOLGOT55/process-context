export type Limit = { percent: number; pace?: number; resetsInMs?: number }

export type Usage = {
  cost: number
  context?: { percent: number; tokens?: number; window: number }
  session?: Limit
  week?: Limit
  durationMs?: number
}

export type GaugeStyle = 'line' | 'segments' | 'ring' | 'none'
export type NumberStyle = 'both' | 'tokens' | 'percent'
export type Density = 'compact' | 'comfort'
export type Background = 'card' | 'none'

// The band's look, kept by the mod itself in $.store so a press shows at once and survives restarts.
export type Prefs = {
  showContext: boolean
  showCostTime: boolean
  showFiveHour: boolean
  showWeek: boolean
  showPace: boolean
  showReset: boolean
  gauge: GaugeStyle
  accent: string
  numbers: NumberStyle
  density: Density
  background: Background
}

declare module 'claude-code' {
  interface PluginState {
    aiblueprint: { usage: Usage | null; settingsOpen: boolean; prefs: Prefs | null }
  }
}

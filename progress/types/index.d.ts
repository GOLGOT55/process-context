export type Call = {
  id: string
  tool: string
  category: string
  label: string
  detail: string[]
  estMs: number
  startedAt: number
  endedAt?: number
  failed?: boolean
}

export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }

export type View = { hidden: boolean; folded: string[]; opened: string[]; settings: boolean }

// Un fichier modifié pendant la conversation : lignes ajoutées/retirées, nombre de modifs, dernier aperçu.
export type FileTouch = { path: string; added: number; removed: number; edits: number; last: string[]; written?: boolean }

// Réglages de la fenêtre, gardés d'une session à l'autre (copiés dans $.store).
export type Prefs = { accent: string; width: number; showPlan: boolean; showHistory: boolean; showTimes: boolean; showSummary?: boolean; background: string; checkColor?: string; timeColor?: string; gauge?: string; showFiles?: boolean }

declare module 'claude-code' {
  interface PluginState {
    progress: {
      calls: Shaped<Call[]>
      plan: Shaped<Step[]>
      view: Shaped<View>
      prefs: Shaped<Prefs>
      now: number
      files: Shaped<FileTouch[]>
    }
  }
}

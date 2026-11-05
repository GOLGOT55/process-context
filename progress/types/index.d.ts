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
// whole = fichier écrit en entier (Write).
export type FileChange = { old: string; new: string; whole?: boolean }
export type FileTouch = { path: string; added: number; removed: number; edits: number; last: string[]; changes: FileChange[]; written?: boolean }

// L'éditeur dans Progress : fichiers ouverts en onglets (open), celui affiché (path) et sa vue.
export type FileView = { path: string; tab: 'code' | 'diff'; inline?: boolean; open: string[] }

// Une fenêtre à part : son id de panneau, son fichier, sa vue.
export type PoppedFile = { id: string; path: string; tab: 'code' | 'diff' }

// Une commande risquée vue par le garde-fou, et ce qui en a été décidé.
export type GuardEntry = { at: number; command: string; reason: string; decision: 'autorisée' | 'refusée' | 'bloquée' }

// Réglages de la fenêtre, gardés d'une session à l'autre (copiés dans $.store).
export type Prefs = { accent: string; width: number; showPlan: boolean; showHistory: boolean; showTimes: boolean; showSummary?: boolean; background: string; checkColor?: string; timeColor?: string; gauge?: string; showFiles?: boolean; guard?: boolean }

declare module 'claude-code' {
  interface PluginState {
    progress: {
      calls: Shaped<Call[]>
      plan: Shaped<Step[]>
      view: Shaped<View>
      prefs: Shaped<Prefs>
      now: number
      files: Shaped<FileTouch[]>
      guard: Shaped<GuardEntry[]>
      fileView: Shaped<FileView>
      popped: Shaped<PoppedFile[]>
    }
  }
}

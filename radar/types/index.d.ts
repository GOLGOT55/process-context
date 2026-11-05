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
  stopped?: boolean // arrêtée par l'utilisateur (bouton stop)
}

export type Step = { title: string; status: 'pending' | 'in_progress' | 'completed' }

// unfolded = catégories ouvertes (fermées par défaut : on n'y voit que l'action en cours).
export type View = { hidden: boolean; unfolded: string[]; opened: string[]; settings: boolean; cardsClosed?: string[] }

// Un fichier modifié pendant la conversation : lignes ajoutées/retirées, nombre de modifs, dernier aperçu.
// whole = fichier écrit en entier (Write).
export type FileChange = { old: string; new: string; whole?: boolean }
export type FileTouch = { path: string; added: number; removed: number; edits: number; last: string[]; changes: FileChange[]; written?: boolean }

// L'éditeur dans Radar : fichiers ouverts en onglets (open), celui affiché (path) et sa vue.
export type FileView = { path: string; tab: 'code' | 'diff'; inline?: boolean; open: string[] }

// Une fenêtre à part : son id de panneau, son fichier, sa vue.
export type PoppedFile = { id: string; path: string; tab: 'code' | 'diff' }

// Une modification en cours dans l'éditeur : texte tapé, texte du fichier au départ, erreur à l'écriture.
export type EditDraft = { path: string; draft: string; original: string; error?: string }

// Une commande risquée vue par le garde-fou, et ce qui en a été décidé.
export type GuardEntry = { at: number; command: string; reason: string; decision: 'autorisée' | 'refusée' | 'bloquée' }

// Réglages de la fenêtre, gardés d'une session à l'autre (copiés dans $.store).
export type Prefs = { accent: string; width: number; showPlan: boolean; showHistory: boolean; showTimes: boolean; showSummary?: boolean; background: string; checkColor?: string; timeColor?: string; gauge?: string; showFiles?: boolean; guard?: boolean; econome?: boolean; hiddenCats?: string[]; compactAt?: number; actionsGauge?: 'Toujours' | 'En cours' }

// ----- Carte Contexte (au-dessus de la saisie) -----
export type CtxLimit = { percent: number; pace?: number; resetsInMs?: number }
export type CtxUsage = { cost: number; context?: { percent: number; tokens?: number; window: number }; session?: CtxLimit; week?: CtxLimit; durationMs?: number }
export type CtxGaugeStyle = 'line' | 'segments' | 'ring' | 'none'
export type CtxNumberStyle = 'both' | 'tokens' | 'percent'
export type CtxDensity = 'compact' | 'comfort'
export type CtxBackground = 'card' | 'none'
// Réglages de la carte, gardés dans $.store (clé ctxPrefs).
export type CtxPrefs = { showContext: boolean; showCostTime: boolean; showFiveHour: boolean; showWeek: boolean; showPace: boolean; showReset: boolean; showEconomy: boolean; gauge: CtxGaugeStyle; accent: string; numbers: CtxNumberStyle; density: CtxDensity; background: CtxBackground }

declare module 'claude-code' {
  interface PluginState {
    radar: {
      calls: Shaped<Call[]>
      plan: Shaped<Step[]>
      view: Shaped<View>
      prefs: Shaped<Prefs>
      now: number
      files: Shaped<FileTouch[]>
      guard: Shaped<GuardEntry[]>
      fileView: Shaped<FileView>
      popped: Shaped<PoppedFile[]>
      editing: Shaped<EditDraft[]>
      ctxUsage: CtxUsage | null
      ctxSettingsOpen: boolean
      ctxPrefs: CtxPrefs | null
      ctxOutTokens: number
    }
  }
}

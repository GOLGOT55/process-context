import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput, SessionUsage } from 'claude-code'

import type { CtxBackground as Background, CtxDensity as Density, CtxGaugeStyle as GaugeStyle, CtxLimit as Limit, CtxNumberStyle as NumberStyle, CtxPrefs as Prefs, CtxUsage as Usage } from '../types'
import { savedTokens } from './econome.js'
import { econome, isEconome, setEconome } from './register.js'

const SESSION_MS = 5 * 3600 * 1000
const WEEK_MS = 7 * 24 * 3600 * 1000
let limitsCache: Promise<string | undefined> | undefined
// The status line script's cache under $HOME/.claude; undefined when HOME cannot be read.
function limitsCachePath($: EngineInterface) {
  return (limitsCache ??= $.process
    .run(['printenv', 'HOME'])
    .then(({ stdout }) => stdout.trim() ? `${stdout.trim()}/.claude/scripts/statusline/data/usage-limits-cache.json` : undefined)
    .catch(() => undefined))
}

// ---------- Look ----------

const ACCENTS = [
  { value: '#2dd4bf', label: 'Turquoise' },
  { value: '#60a5fa', label: 'Bleu' },
  { value: '#f472b6', label: 'Rose' },
  { value: '#fb923c', label: 'Orange' },
  { value: '#a3e635', label: 'Citron' },
  { value: '#e5e7eb', label: 'Blanc' },
] as const

const GREEN = '#4ade80'
const YELLOW = '#facc15'
const ORANGE = '#fb923c'
const RED = '#f87171'
const TRACK = '#2a303a'
const CARD_BG = '#121419'
const CARD_BORDER = '#232833'
const DIVIDER = '#3a414d'
const ECO = '#4ade80' // vert de l'économie

const GAUGES: readonly { value: GaugeStyle; label: string }[] = [
  { value: 'line', label: 'Ligne' },
  { value: 'segments', label: 'Segments' },
  { value: 'ring', label: 'Anneau' },
  { value: 'none', label: 'Aucune' },
]
const NUMBERS: readonly { value: NumberStyle; label: string }[] = [
  { value: 'both', label: 'Tokens + %' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'percent', label: '%' },
]
const DENSITIES: readonly { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfort', label: 'Confort' },
]
const BACKGROUNDS: readonly { value: Background; label: string }[] = [
  { value: 'card', label: 'Carte' },
  { value: 'none', label: 'Transparent' },
]

// The show/hide switches of the ⚙ panel, in order.
const TOGGLES = [
  { field: 'showContext', label: 'Contexte' },
  { field: 'showCostTime', label: 'Coût & temps' },
  { field: 'showFiveHour', label: '5h' },
  { field: 'showWeek', label: 'Semaine' },
  { field: 'showPace', label: 'Rythme' },
  { field: 'showReset', label: 'Reset' },
  { field: 'showEconomy', label: 'Économie' },
] as const

const usageAtom = atom({ plugin: 'radar', key: 'ctxUsage' } as const, null)
// Tokens de réponse écrits pendant que le mode économe était actif, sur cette session.
const outAtom = atom({ plugin: 'radar', key: 'ctxOutTokens' } as const, 0)
const settingsOpenAtom = atom({ plugin: 'radar', key: 'ctxSettingsOpen' } as const, false)
const prefsAtom = atom({ plugin: 'radar', key: 'ctxPrefs' } as const, null)
const PREFS_STORE_KEY = 'ctxPrefs'

type Options = {
  showSession: boolean
  showFiveHour: boolean
  showWeek: boolean
  showBars: boolean
  showPace: boolean
  showReset: boolean
  sessionLabel: string
  fiveHourLabel: string
  weekLabel: string
  refreshSeconds: number
}

const DEFAULTS: Options = {
  showSession: true,
  showFiveHour: true,
  showWeek: true,
  showBars: true,
  showPace: true,
  showReset: true,
  sessionLabel: 'S',
  fiveHourLabel: '5h',
  weekLabel: 'Week',
  refreshSeconds: 30,
}

let isRunning = false
let isPending = false

// ---------- Formatting ----------

function statusColor(percent: number, accent: string) {
  if (percent < 60) return accent
  if (percent < 75) return YELLOW
  if (percent < 90) return ORANGE
  return RED
}

// Pace > 0: under the window's pace (budget left), < 0: burning faster than time passes.
function paceColor(pace: number) {
  if (pace >= 0) return GREEN
  if (pace > -10) return YELLOW
  return RED
}

const formatPace = (pace: number) => `${pace >= 0 ? '+' : ''}${pace.toFixed(0)}%`
const formatCost = (cost: number) => `$${cost < 10 ? cost.toFixed(2) : cost.toFixed(1)}`
const clampPct = (percent: number) => Math.max(0, Math.min(100, percent))

// One unit only, the biggest that fits: 6j, 13h, 45m.
// Durée de la session : « 42 min », « 1h05 ».
export function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function formatResetsIn(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}j`
}

// Tokens économisés : « 4.1K », « 1.2M ».
export function formatEco(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : `${count}`
}

function formatTokens(count: number) {
  if (count >= 1_000_000) return `${+(count / 1_000_000).toFixed(1)}M`
  return count >= 1000 ? `${Math.round(count / 1000)}k` : `${count}`
}

const contextTokens = (context: NonNullable<Usage['context']>) =>
  context.tokens ?? Math.round((context.percent / 100) * context.window)

// ---------- Gauges (SVG for desktop, glyphs for terminal) ----------

function lineSvg(percent: number, color: string, width: number) {
  const h = 6
  const filled = Math.max(h, Math.round((clampPct(percent) / 100) * width))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h + 4}" viewBox="0 0 ${width} ${h + 4}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}"/></linearGradient><filter id="f" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.6"/></filter></defs><rect y="2" width="${width}" height="${h}" rx="${h / 2}" fill="${TRACK}"/><rect y="2" width="${filled}" height="${h}" rx="${h / 2}" fill="url(#g)"/><circle cx="${filled - h / 2}" cy="${2 + h / 2}" r="${h / 2 + 1}" fill="${color}" opacity="0.55" filter="url(#f)"/><circle cx="${filled - h / 2}" cy="${2 + h / 2}" r="${h / 2 - 0.5}" fill="#ffffff" opacity="0.9"/></svg>`
}

function segmentsSvg(percent: number, color: string, count: number) {
  const w = 6, gap = 2.5, h = 10
  const lit = Math.round((clampPct(percent) / 100) * count)
  const width = count * w + (count - 1) * gap
  const rects = Array.from({ length: count }, (_, i) =>
    `<rect x="${(i * (w + gap)).toFixed(1)}" width="${w}" height="${h}" rx="2" fill="${i < lit ? color : TRACK}" fill-opacity="${i < lit ? (0.45 + (0.55 * (i + 1)) / Math.max(1, lit)).toFixed(2) : 1}"/>`).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${rects}</svg>`, width, height: h }
}

function ringSvg(percent: number, color: string, size: number) {
  const stroke = size >= 20 ? 3 : 2.6
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const dash = (clampPct(percent) / 100) * c
  const m = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${stroke}"/><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${m} ${m})"/></svg>`
}

function gaugeText(percent: number, style: GaugeStyle) {
  if (style === 'none') return ''
  if (style === 'ring') return ['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round(clampPct(percent) / 25))] ?? '○'
  const n = 12
  const lit = Math.round((clampPct(percent) / 100) * n)
  return style === 'segments' ? `${'▰'.repeat(lit)}${'▱'.repeat(n - lit)}` : `${'━'.repeat(lit)}${'─'.repeat(n - lit)}`
}

// ---------- Usage ----------

// The same windows as the Plan usage limits panel: Session = the 5-hour limit, Week = the 7-day limit.
function limitOf(usage: SessionUsage, kind: string, windowMs: number, now: number): Limit | undefined {
  const limit = usage.rateLimits.find(item => item.kind === kind)
  if (!limit) return undefined
  const resetsInMs = limit.resetsAt ? new Date(limit.resetsAt).getTime() - now : undefined
  // Valeur gardée d'une session d'avant dont la fenêtre est déjà remise à zéro.
  if (resetsInMs !== undefined && resetsInMs <= 0) return { percent: 0 }
  const elapsedPercent = resetsInMs !== undefined ? ((windowMs - resetsInMs) / windowMs) * 100 : undefined
  return {
    percent: limit.percentUsed,
    pace: elapsedPercent !== undefined ? elapsedPercent - limit.percentUsed : undefined,
    resetsInMs,
  }
}

function contextOf(usage: SessionUsage): Usage['context'] {
  const { tokens, window, percent } = usage.context
  const value = percent ?? (tokens !== undefined && window > 0 ? (tokens / window) * 100 : undefined)
  return value === undefined ? undefined : { percent: value, tokens, window }
}

// Dernières limites 5h/semaine connues : le moteur ne les a qu'après la première réponse de la conversation,
// donc on les garde ($.store) pour les afficher dès l'ouverture.
const LIMITS_STORE_KEY = 'limits'
let lastLimits: SessionUsage['rateLimits'] | undefined

// Alerte une seule fois par fenêtre de 5 h quand la limite passe 80 %.
const ALERT_AT = 80
async function alertFiveHour($: EngineInterface, usage: Usage) {
  const s = usage.session
  if (!s || s.percent < ALERT_AT) return
  // La fenêtre est identifiée par son heure de remise à zéro, arrondie à la minute.
  const now = await $.clock.now()
  const windowKey = s.resetsInMs !== undefined ? String(Math.round((now + s.resetsInMs) / 60_000)) : 'inconnue'
  const done = await $.store.get('alerted5h').catch(() => undefined)
  if (done === windowKey) return
  await $.store.set('alerted5h', windowKey).catch(() => undefined)
  const reset = s.resetsInMs !== undefined ? ` · remise à zéro dans ${formatResetsIn(s.resetsInMs)}` : ''
  $.ui.toast(`⚠ Limite 5h à ${Math.round(s.percent)} %${reset}`)
}

async function rememberLimits($: EngineInterface, usage: SessionUsage) {
  if (usage.rateLimits.length > 0) {
    lastLimits = usage.rateLimits
    await $.store.set(LIMITS_STORE_KEY, usage.rateLimits).catch(() => undefined)
  } else if (lastLimits === undefined) {
    const saved = await $.store.get(LIMITS_STORE_KEY).catch(() => undefined)
    lastLimits = Array.isArray(saved) ? (saved as SessionUsage['rateLimits']) : []
  }
}

function compute(raw: SessionUsage, now: number): Usage {
  const usage = raw.rateLimits.length > 0 || !lastLimits?.length ? raw : { ...raw, rateLimits: lastLimits }
  return {
    cost: usage.cost?.usd ?? 0,
    context: contextOf(usage) ?? { percent: 0, tokens: 0, window: usage.context.window },
    session: limitOf(usage, 'five_hour', SESSION_MS, now),
    week: limitOf(usage, 'seven_day', WEEK_MS, now),
    ...(usage.startedAt ? { durationMs: Math.max(0, now - usage.startedAt) } : {}),
  }
}

// Keeps the terminal status line script on the engine's own readings, so it never calls the usage API.
async function seedLimitsCache($: EngineInterface, usage: SessionUsage, now: number) {
  const window = (kind: string) => {
    const limit = usage.rateLimits.find(item => item.kind === kind)
    return limit ? { utilization: limit.percentUsed, resets_at: limit.resetsAt ?? null } : null
  }
  const sevenDay = window('seven_day')
  if (!sevenDay) return
  const path = await limitsCachePath($)
  if (!path) return
  await $.fs
    .write(path, JSON.stringify({ data: { five_hour: window('five_hour'), seven_day: sevenDay }, timestamp: now }, null, 2))
    .catch(() => undefined)
}

async function refresh($: EngineInterface): Promise<void> {
  if (isRunning) {
    isPending = true
    return
  }
  isRunning = true
  try {
    if ((await read($, prefsAtom)) === null) await loadPrefs($)
    const [usage, now] = await Promise.all([$.session.usage(), $.clock.now()])
    await rememberLimits($, usage)
    await restoreOut($, usage.startedAt)
    const next = compute(usage, now)
    await update($, usageAtom, () => next)
    await alertFiveHour($, next)
    await seedLimitsCache($, usage, now)
  } catch {
    // keep the last band
  } finally {
    isRunning = false
  }
  if (isPending) {
    isPending = false
    await refresh($)
  }
}

// ---------- Prefs ----------

function basePrefs(options: Options): Prefs {
  return {
    showContext: true,
    showCostTime: options.showSession,
    showFiveHour: options.showFiveHour,
    showWeek: options.showWeek,
    showPace: options.showPace,
    showReset: options.showReset,
    showEconomy: true,
    gauge: options.showBars ? 'line' : 'none',
    accent: ACCENTS[0].value,
    numbers: 'both',
    density: 'comfort',
    background: 'card',
  }
}

const oneOf = <T extends string>(value: unknown, allowed: readonly { value: T }[], fallback: T): T =>
  allowed.some(item => item.value === value) ? (value as T) : fallback

// Reads what any earlier version stored, keeping only valid fields.
function asPrefs(value: unknown, base: Prefs): Prefs {
  if (!value || typeof value !== 'object') return base
  const s = value as Record<string, unknown>
  const bool = (key: keyof Prefs) => (typeof s[key] === 'boolean' ? (s[key] as boolean) : (base[key] as boolean))
  return {
    showContext: bool('showContext'),
    showCostTime: bool('showCostTime'), // nouveau nom : l'ancien « Coût » masqué revient avec la durée
    showFiveHour: bool('showFiveHour'),
    showWeek: bool('showWeek'),
    showPace: bool('showPace'),
    showReset: bool('showReset'),
    showEconomy: bool('showEconomy'),
    gauge: oneOf(s.gauge, GAUGES, typeof s.showBars === 'boolean' && !s.showBars ? 'none' : base.gauge),
    accent: oneOf(s.accent, ACCENTS, base.accent),
    numbers: oneOf(s.numbers, NUMBERS, base.numbers),
    density: oneOf(s.density, DENSITIES, base.density),
    background: oneOf(s.background, BACKGROUNDS, base.background),
  }
}

async function savePrefs($: EngineInterface, change: (prefs: Prefs) => Prefs, base: Prefs) {
  await update($, prefsAtom, prefs => change(prefs ?? base))
  const saved = await read($, prefsAtom)
  await $.store.set(PREFS_STORE_KEY, saved ?? base).catch(() => undefined)
}

// A reading taken while drawing, before the first refresh landed; a fresh session reads $0 and an empty context.
async function liveUsage($: EngineInterface): Promise<Usage> {
  try {
    const [usage, now] = await Promise.all([$.session.usage(), $.clock.now()])
    return compute(usage, now)
  } catch {
    return { cost: 0 }
  }
}

// Set by register: the defaults the saved prefs are merged over.
let basePrefsForLoad: Prefs | undefined

async function loadPrefs($: EngineInterface) {
  if (!basePrefsForLoad) return
  const base = basePrefsForLoad
  const stored = await $.store.get(PREFS_STORE_KEY).catch(() => undefined)
  await update($, prefsAtom, prefs => prefs ?? asPrefs(stored, base))
}

// The timer starts once, from session.start, session.measure or turn.complete (never while drawing;
// a module loaded after its session started never sees session.start).
let refreshMs = 30_000
let isTicking = false
function ensureTicking($: EngineInterface) {
  if (isTicking) return
  try {
    $.clock.every(refreshMs, () => refresh($))
    isTicking = true
  } catch {
    // try again at the next event
  }
  void refresh($)
}

// ---------- Tokens économisés : gardés par session, même après fermeture de l'app ----------

// Clé = début de la session : le même quand on rouvre (reprise) la conversation.
const ECO_KEY = 'ecoSessions'
let restoredFor: number | undefined
type EcoSessions = Record<string, number>

async function restoreOut($: EngineInterface, startedAt: number) {
  if (restoredFor === startedAt) return
  restoredFor = startedAt
  const all = ((await $.store.get(ECO_KEY).catch(() => undefined)) ?? {}) as EcoSessions
  const saved = all[String(startedAt)]
  if (typeof saved === 'number') await update($, outAtom, n => Math.max(n, saved))
}

async function addOut($: EngineInterface, out: number) {
  const startedAt = (await $.session.usage().catch(() => undefined))?.startedAt
  if (startedAt !== undefined) await restoreOut($, startedAt) // avant d'ajouter, pour ne pas écraser l'ancien total
  const total = await update($, outAtom, n => n + out)
  if (startedAt === undefined) return
  const all = ((await $.store.get(ECO_KEY).catch(() => undefined)) ?? {}) as EcoSessions
  all[String(startedAt)] = total
  // On garde les 50 sessions les plus récentes.
  const kept = Object.fromEntries(Object.entries(all).sort(([a], [b]) => Number(b) - Number(a)).slice(0, 50))
  await $.store.set(ECO_KEY, kept).catch(() => undefined)
}

// ---------- Register ----------


// Carte Contexte au-dessus de la saisie : contexte, coût, limites 5 h et semaine, tokens économisés.
// Un mod n'a qu'un hook par événement : Radar appelle ces fonctions depuis les siens.
let base: Prefs = basePrefs(DEFAULTS)
let fiveHourLabel = DEFAULTS.fiveHourLabel
let weekLabel = 'Semaine'

export function setupContext(rawOptions: unknown) {
  const options: Options = { ...DEFAULTS, ...(rawOptions as Partial<Options>) }
  refreshMs = Math.max(5, options.refreshSeconds) * 1000
  base = basePrefs(options)
  basePrefsForLoad = base
  fiveHourLabel = options.fiveHourLabel
  weekLabel = options.weekLabel === 'Week' ? 'Semaine' : options.weekLabel
}

export async function contextStart($: EngineInterface) {
  $.ui.status(undefined)
  await loadPrefs($)
  ensureTicking($)
}

// Mesure de la session, ou outil fini : la carte se met à jour sans attendre la fin de la réponse.
export function contextRefresh($: EngineInterface) {
  ensureTicking($)
  void refresh($)
}

export async function contextAfterTurn($: EngineInterface, out: number) {
  if (out > 0 && (await isEconome($))) await addOut($, out)
  contextRefresh($)
}

// La carte (fonction du haut du fichier : le moteur l'exige pour lui passer $). undefined = rien à dessiner.
export async function contextRender($: EngineInterface, e: RenderInput<'AbovePrompt'>) {
  const [storedUsage, isSettingsOpen, storedPrefs, outTokens] = await Promise.all([read($, usageAtom), read($, settingsOpenAtom), read($, prefsAtom), read($, outAtom)])
  // Same rule as the original 0.7 that draws reliably: nothing until the first reading, and only reads while drawing.
  if (e.props.hasSurvey) return undefined
  // Drawn from the very first frame: before the first timed reading, read the session's usage here (a read only).
  const usage: Usage = storedUsage ?? (await liveUsage($))
  const prefs = storedPrefs ?? base
  const isEco = await econome($)
  const accent = prefs.accent
  const isCompact = prefs.density === 'compact'
  // Pas encore de valeur (début de session, remise à zéro) : on affiche 0 % au lieu de cacher.
  const ZERO: Limit = { percent: 0 }
  const hasLimits = usage.session !== undefined || usage.week !== undefined

  const limits = [
    { key: 'five-hour', label: fiveHourLabel, limit: prefs.showFiveHour ? usage.session ?? ZERO : undefined },
    { key: 'week', label: weekLabel, limit: prefs.showWeek ? usage.week ?? ZERO : undefined },
  ].filter((item): item is { key: string; label: string; limit: Limit } => item.limit !== undefined)
  const context = prefs.showContext ? usage.context ?? { percent: 0, tokens: 0, window: 0 } : undefined

  const { Box, Text, Button } = $.ui.resolve(e)
  const set = <K extends keyof Prefs>(field: K, value: Prefs[K]) => savePrefs($, prefs => ({ ...prefs, [field]: value }), base)
  const reset = () => savePrefs($, () => base, base)
  const toggleSettings = () => update($, settingsOpenAtom, isOpen => !isOpen)

  // Case à cocher : active ou coupe le mode économe (gardé pour toutes les sessions).
  const ecoBox = (
    <Button key="eco-toggle" plain dimColor={!isEco} label={isEco ? '☑ actif' : '☐ inactif'} onPress={() => setEconome($, !isEco)} />
  )
  const gear = (
    <Button key="gear" label={isSettingsOpen ? '✕' : '⚙'} plain dimColor={!isSettingsOpen} onPress={toggleSettings} />
  )

  // ----- ⚙ panel: built from Buttons only, so it works the same on every surface -----
  const chip = (key: string, label: string, isOn: boolean, onPress: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={onPress} />
  )
  const segmented = <T extends string>(field: 'gauge' | 'numbers' | 'density' | 'background', items: readonly { value: T; label: string }[]) =>
    items.map(item => chip(`${field}-${item.value}`, item.label, prefs[field] === item.value, () => set(field, item.value as never)))
  const section = (key: string, title: string, children: RenderChildren) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
      <Box width={11}><Text dimColor>{title}</Text></Box>
      {children}
    </Box>
  )
  const swatches = ACCENTS.map(({ value, label }) => (
    <Button key={`accent-${label}`} label={`${prefs.accent === value ? '◉' : '●'} ${label}`} variant={prefs.accent === value ? 'primary' : 'secondary'} onPress={() => set('accent', value)}>
      <Text color={value}>{prefs.accent === value ? '◉' : '●'}</Text>
      <Text dimColor={prefs.accent !== value}> {label}</Text>
    </Button>
  ))
  const settingsBody = [
    section('s-show', 'Afficher', TOGGLES.map(({ field, label }) =>
      chip(`toggle-${field}`, `${prefs[field] ? '✓' : '+'} ${label}`, prefs[field], () => set(field, !prefs[field])))),
    section('s-gauge', 'Jauge', segmented('gauge', GAUGES)),
    section('s-accent', 'Couleur', swatches),
    section('s-numbers', 'Chiffres', segmented('numbers', NUMBERS)),
    section('s-density', 'Taille', segmented('density', DENSITIES)),
    section('s-bg', 'Fond', segmented('background', BACKGROUNDS)),
    !hasLimits && <Text key="hint" dimColor>5h et Semaine : ton compte ne renvoie pas encore de limites, elles apparaîtront dès qu'il y en a.</Text>,
  ]

  // ----- Terminal -----
  if (e.surface === 'terminal') {
    const ctxText = (c: NonNullable<Usage['context']>) =>
      prefs.numbers === 'percent' ? `${Math.round(c.percent)}%`
        : prefs.numbers === 'tokens' ? `${formatTokens(contextTokens(c))}/${formatTokens(c.window)}`
          : `${formatTokens(contextTokens(c))}/${formatTokens(c.window)} ${Math.round(c.percent)}%`
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={3}>
          {context !== undefined && (
            <Text key="context">
              <Text dimColor>ctx </Text>
              {prefs.gauge !== 'none' && <Text color={statusColor(context.percent, accent)}>{gaugeText(context.percent, prefs.gauge)} </Text>}
              <Text bold>{ctxText(context)}</Text>
            </Text>
          )}
          {prefs.showCostTime && <Text key="cost" bold color={accent}>{formatCost(usage.cost)}{usage.durationMs !== undefined ? ` · ${formatDuration(usage.durationMs)}` : ''}</Text>}
          {prefs.showEconomy && (
            <Box key="eco" flexDirection="row" gap={1}>
              <Text><Text dimColor>éco </Text><Text bold color={isEco ? ECO : 'gray'}>~{formatEco(savedTokens(outTokens))}</Text></Text>
              {ecoBox}
            </Box>
          )}
          {limits.map(({ key, label, limit }) => (
            <Text key={key}>
              <Text dimColor>{label} </Text>
              {prefs.gauge !== 'none' && <Text color={statusColor(limit.percent, accent)}>{gaugeText(limit.percent, prefs.gauge)} </Text>}
              <Text bold>{Math.round(limit.percent)}%</Text>
              {prefs.showPace && limit.pace !== undefined && <Text color={paceColor(limit.pace)}> {formatPace(limit.pace)}</Text>}
              {prefs.showReset && limit.resetsInMs !== undefined && <Text dimColor> ↻{formatResetsIn(limit.resetsInMs)}</Text>}
            </Text>
          ))}
          {gear}
        </Box>
        {isSettingsOpen && (
          <Box key="settings" flexDirection="column">
            {settingsBody}
            <Button key="reset" label="↺ Réinitialiser" plain dimColor onPress={reset} />
          </Box>
        )}
      </Box>
    )
  }

  // ----- Desktop / editor / mobile -----
  const { Svg } = $.ui.resolve(e)
  const lineWidth = isCompact ? 100 : 150
  const ringSize = isCompact ? 16 : 22
  const segCount = isCompact ? 11 : 17

  const gauge = (key: string, percent: number, color: string, alt: string) => {
    if (prefs.gauge === 'none') return null
    if (prefs.gauge === 'ring') return <Svg key={key} source={ringSvg(percent, color, ringSize)} alt={alt} width={ringSize} height={ringSize} />
    if (prefs.gauge === 'segments') {
      const seg = segmentsSvg(percent, color, segCount)
      return <Svg key={key} source={seg.svg} alt={alt} width={seg.width} height={seg.height} />
    }
    return <Svg key={key} source={lineSvg(percent, color, lineWidth)} alt={alt} width={lineWidth} height={10} />
  }

  // A metric: small caps label + numbers on one line, gauge under it (or beside it for a ring).
  const metric = (key: string, title: string, numbers: RenderChildren, gaugeEl: RenderChildren) => {
    const head = (
      <Box key="head" flexDirection="column" gap={0}>
        <Text size="caption" dimColor weight="medium">{title.toUpperCase()}</Text>
        <Box flexDirection="row" alignItems="center" gap={1}>{numbers}</Box>
      </Box>
    )
    if (prefs.gauge === 'ring') {
      return <Box key={key} flexDirection="row" alignItems="center" gap="sm">{gaugeEl}{head}</Box>
    }
    return (
      <Box key={key} flexDirection="column" gap={0}>
        {head}
        {gaugeEl}
      </Box>
    )
  }

  const ctxColor = context ? statusColor(context.percent, accent) : accent
  const segments = [
    context !== undefined && metric(
      'context',
      'Contexte',
      [
        prefs.numbers !== 'percent' && <Text key="t" weight="semibold">{formatTokens(contextTokens(context))}</Text>,
        prefs.numbers !== 'percent' && <Text key="w" size="footnote" dimColor>/ {formatTokens(context.window)}</Text>,
        prefs.numbers !== 'tokens' && <Text key="p" size="footnote" weight="semibold" color={ctxColor}>{Math.round(context.percent)}%</Text>,
      ],
      gauge('g-context', context.percent, ctxColor, `Contexte ${Math.round(context.percent)}%`),
    ),
    prefs.showCostTime && (
      <Box key="cost" flexDirection="column" gap={0}>
        <Text size="caption" dimColor weight="medium">SESSION</Text>
        <Text weight="semibold" color={accent}>{formatCost(usage.cost)}{usage.durationMs !== undefined && <Text size="footnote" dimColor> · {formatDuration(usage.durationMs)}</Text>}</Text>
      </Box>
    ),
    prefs.showEconomy && (
      <Box key="eco" flexDirection="column" gap={0}>
        <Text size="caption" dimColor weight="medium">ÉCONOMIE</Text>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text weight="semibold" color={isEco ? ECO : 'gray'} dimColor={!isEco}>~{formatEco(savedTokens(outTokens))}</Text>
          <Text size="footnote" dimColor>tokens</Text>
          {ecoBox}
        </Box>
      </Box>
    ),
    ...limits.map(({ key, label, limit }) => {
      const color = statusColor(limit.percent, accent)
      return metric(
        key,
        label,
        [
          <Text key="p" weight="semibold">{key === 'five-hour' && limit.percent >= ALERT_AT ? '⚠ ' : ''}{Math.round(limit.percent)}%</Text>,
          prefs.showPace && limit.pace !== undefined && <Text key="pace" size="footnote" color={paceColor(limit.pace)}>{formatPace(limit.pace)}</Text>,
          prefs.showReset && limit.resetsInMs !== undefined && <Text key="reset" size="footnote" dimColor>↻ {formatResetsIn(limit.resetsInMs)}</Text>,
        ],
        gauge(`g-${key}`, limit.percent, color, `${label} ${Math.round(limit.percent)}%`),
      )
    }),
  ].filter(Boolean)

  const row: RenderChildren[] = []
  segments.forEach((segment, index) => {
    if (index > 0) row.push(<Text key={`div-${index}`} color={DIVIDER}>│</Text>)
    row.push(segment)
  })

  const isCard = prefs.background === 'card'
  const card = (key: string, children: RenderChildren, column = false) => (
    <Box
      key={key}
      flexDirection={column ? 'column' : 'row'}
      alignItems={column ? 'stretch' : 'center'}
      gap={column ? 'sm' : isCompact ? 'sm' : 'md'}
      alignSelf="flex-start"
      // No undefined props: the engine refuses a tree that holds one, and skips the whole band.
      {...(isCard
        ? { paddingX: isCompact ? 'sm' : 'md', paddingY: isCompact ? 'xs' : 'sm', borderStyle: 'round', borderColor: CARD_BORDER, backgroundColor: CARD_BG }
        : {})}
    >
      {children}
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {card('band', [
        ...row,
        segments.length === 0 && <Text key="empty" dimColor>Tout est masqué</Text>,
        gear,
      ])}
      {isSettingsOpen && card('settings', [
        <Box key="title" flexDirection="row" alignItems="center" justifyContent="space-between" gap={3}>
          <Text weight="semibold">Personnaliser le bandeau</Text>
          <Button key="reset" label="↺ Réinitialiser" plain dimColor onPress={reset} />
        </Box>,
        ...settingsBody,
      ], true)}
    </Box>
  )
}

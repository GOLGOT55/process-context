import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderInput, Timer } from 'claude-code'

import type { Call, Prefs, Step, View } from '../types'

const PANE = 'progress'
export const COLORS: Record<string, string> = {
  Bleu: '#60a5fa', Vert: '#4ade80', Violet: '#c084fc', Orange: '#fb923c', Rose: '#f472b6', Gris: '#a1a1aa',
}
export const WIDTHS: Record<string, number> = { Étroite: 34, Normale: 46, Large: 62 }
// Fond des cartes : null = transparent (ni fond ni bordure).
export const BACKGROUNDS: Record<string, { bg: string; border: string } | null> = {
  Carte: { bg: '#121419', border: '#232833' },
  Noir: { bg: '#07080a', border: '#1a1d24' },
  Ardoise: { bg: '#1b2030', border: '#2c3447' },
  Transparent: null,
}
const DEFAULT_PREFS: Prefs = { accent: COLORS.Bleu!, width: WIDTHS.Normale!, showPlan: true, showHistory: true, showTimes: true, background: 'Carte' }
const prefs = atom({ plugin: 'progress', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-2' })
const calls = atom({ plugin: 'progress', key: 'calls' } as const, [], { shape: 'calls-2' })
const plan = atom({ plugin: 'progress', key: 'plan' } as const, [], { shape: 'plan-1' })
const view = atom(
  { plugin: 'progress', key: 'view' } as const,
  { hidden: false, folded: [], opened: [], settings: false },
  { shape: 'view-2' },
)
const now = atom({ plugin: 'progress', key: 'now' } as const, 0)

const PLAN_TOOLS = ['mcp__ccd_turn__update_plan', 'TodoWrite']
// Durées de départ (ms) tant qu'aucune moyenne réelle n'est enregistrée.
const DEFAULT_MS: Record<string, number> = {
  Read: 2000, Grep: 2500, Glob: 1500, Edit: 3000, Write: 4000,
  Bash: 8000, PowerShell: 8000, WebSearch: 6000, WebFetch: 8000, Agent: 60000,
}
const ORDER = ['Lecture', 'Recherche', 'Web', 'Modifications', 'Commandes', 'Agents', 'Autre']
// Outils internes de l'app (plan, récap, chapitres) : du bruit, on ne les liste pas.
const HIDDEN_TOOLS = /^mcp__ccd_/

type Args = Record<string, unknown>
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '')
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const firstLines = (s: string, n: number) => s.split('\n').filter(l => l.trim()).slice(0, n).map(l => clip(l, 140))
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return clip(u, 40) } }
const pretty = (tool: string) => {
  const name = (tool.split('__').pop() ?? tool).replace(/[_-]+/g, ' ')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function describe(tool: string, a: Args): Pick<Call, 'category' | 'label' | 'detail'> {
  const file = str(a, 'file_path') || str(a, 'notebook_path')
  const where = str(a, 'path')
  switch (tool) {
    case 'Read': {
      const range = a.offset ? `Lignes   ${a.offset} → ${Number(a.offset) + Number(a.limit ?? 2000)}` : 'Lignes   fichier entier'
      return { category: 'Lecture', label: base(file), detail: [`Fichier  ${file}`, range] }
    }
    case 'Grep':
      return {
        category: 'Recherche',
        label: `« ${clip(str(a, 'pattern'), 32)} »${where ? ' dans ' + base(where) : ''}`,
        detail: [`Motif    ${str(a, 'pattern')}`, `Dossier  ${where || 'projet'}`, ...(str(a, 'glob') ? [`Filtre   ${str(a, 'glob')}`] : [])],
      }
    case 'Glob':
      return { category: 'Recherche', label: `Fichiers ${clip(str(a, 'pattern'), 36)}`, detail: [`Motif    ${str(a, 'pattern')}`, `Dossier  ${where || 'projet'}`] }
    case 'Edit':
      return {
        category: 'Modifications',
        label: base(file),
        detail: [`Fichier  ${file}`, ...firstLines(str(a, 'old_string'), 4).map(l => '−  ' + l), ...firstLines(str(a, 'new_string'), 4).map(l => '+  ' + l)],
      }
    case 'Write':
      return { category: 'Modifications', label: `${base(file)} (nouveau)`, detail: [`Fichier  ${file}`, `Taille   ${str(a, 'content').split('\n').length} lignes`] }
    case 'NotebookEdit':
      return { category: 'Modifications', label: base(file), detail: [`Fichier  ${file}`] }
    case 'Bash':
    case 'PowerShell':
      return {
        category: 'Commandes',
        label: clip(str(a, 'description') || str(a, 'command').split('\n')[0] || tool, 48),
        detail: [`Shell    ${tool}`, ...firstLines(str(a, 'command'), 6).map(l => '›  ' + l)],
      }
    case 'WebSearch':
      return { category: 'Web', label: `« ${clip(str(a, 'query'), 40)} »`, detail: [`Requête  ${str(a, 'query')}`] }
    case 'WebFetch':
      return { category: 'Web', label: host(str(a, 'url')), detail: [`Page     ${str(a, 'url')}`, ...(str(a, 'prompt') ? [`But      ${clip(str(a, 'prompt'), 140)}`] : [])] }
    case 'Agent':
      return { category: 'Agents', label: clip(str(a, 'description') || 'Sous-agent', 48), detail: firstLines(str(a, 'prompt'), 6) }
    case 'Skill':
      return { category: 'Autre', label: `Skill ${str(a, 'skill')}`, detail: [`Skill    ${str(a, 'skill')}`] }
    case 'ToolSearch':
      return { category: 'Autre', label: 'Charge des outils', detail: [`Requête  ${str(a, 'query')}`] }
  }
  if (/codegraph/.test(tool)) {
    return { category: 'Recherche', label: `« ${clip(str(a, 'query'), 40)} »`, detail: [`Requête  ${str(a, 'query')}`, `Outil    CodeGraph`] }
  }
  if (/Browser|chrome|playwright/.test(tool)) {
    const url = str(a, 'url')
    const target = url ? host(url) : str(a, 'query') || str(a, 'action_summary') || str(a, 'action')
    return { category: 'Web', label: clip(target || pretty(tool), 48), detail: [`Action   ${pretty(tool)}`, ...(url ? [`Page     ${url}`] : [])] }
  }
  return {
    category: 'Autre',
    label: pretty(tool),
    detail: Object.entries(a).filter(([k]) => k !== 'tool' && k !== 'tool_use_id').slice(0, 6).map(([k, v]) => `${k.padEnd(8)} ${clip(typeof v === 'string' ? v : JSON.stringify(v), 120)}`),
  }
}

// Fin lisible du résultat d'un outil (texte brut, pas du JSON échappé).
export function resultTail(result: unknown): string[] {
  const r = result as Record<string, unknown> | string | undefined
  const text = typeof r === 'string' ? r
    : r && typeof r === 'object' ? String(r.stdout ?? r.text ?? r.content ?? r.output ?? '') || JSON.stringify(r)
    : ''
  return text.split('\n').map(l => l.trim()).filter(l => l && l !== '{}' && l !== '""').slice(-3).map(l => '=  ' + clip(l, 140))
}

// Applique un appel d'outil de plan (liste complète, ou avance d'une étape).
export function nextPlan(steps: Step[], a: Args): Step[] {
  const list = (a.items ?? a.todos) as { content?: string; status?: Step['status'] }[] | undefined
  if (Array.isArray(list)) return list.map(s => ({ title: s.content ?? '', status: s.status ?? 'pending' }))
  const out = steps.map(s => ({ ...s }))
  const done = Array.isArray(a.done) ? (a.done as number[]) : []
  done.forEach(n => out[n - 1] && (out[n - 1]!.status = 'completed'))
  if (a.advance) {
    const cur = out.find(s => s.status === 'in_progress')
    if (cur) cur.status = 'completed'
    const nxt = out.find(s => s.status === 'pending')
    if (nxt) nxt.status = 'in_progress'
  }
  const started = typeof a.start === 'number' ? out[a.start - 1] : undefined
  if (started) {
    out.forEach(s => s.status === 'in_progress' && (s.status = 'pending'))
    started.status = 'in_progress'
  }
  return out
}

export const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${s}s`
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter(k => k !== key) : [...list, key])

// Le panneau (à droite) s'ouvre dès la première demande (un mod chargé en cours de session ne voit pas session.start).
let isOpened = false
async function ensureOpen($: EngineInterface, isAsked = false) {
  if (isOpened && !isAsked) return
  isOpened = true
  const saved = (await $.store.get('prefs')) as Partial<Prefs> | undefined
  const p = await update($, prefs, x => ({ ...x, ...saved }))
  // La personnalisation reste masquée tant qu'on ne clique pas sur ⚙.
  await update($, view, x => ({ ...x, settings: false }))
  try {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Progress', columns: p.width })
    if (!isPlaced) isOpened = false // pas encore affiché : on réessaie au prochain événement
  } catch (err) {
    isOpened = false // pas encore d'écran attaché (début de session) : on réessaie au prochain événement
    throw err
  }
}

// Change un réglage, le garde pour les prochaines sessions, et ajuste la largeur.
async function setPrefs($: EngineInterface, fn: (p: Prefs) => Prefs) {
  const p = await update($, prefs, fn)
  await $.store.set('prefs', p)
  await $.ui.open({ id: PANE, title: 'Progress', columns: p.width })
}

export const register: Register = on => {
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'progress', description: 'Ouvrir le panneau Progress à droite' })
    void ensureOpen($).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'progress' }, async $ => {
    await ensureOpen($, true)
    return { text: 'Panneau Progress ouvert (⚙ pour le personnaliser).' }
  })

  // Toute commande (/...) fait aussi apparaître la carte.
  on('command.run', async ($, e, next) => {
    await ensureOpen($).catch(() => {}) // ne bloque jamais outils ni messages
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await ensureOpen($).catch(() => {}) // ne bloque jamais outils ni messages
    // Rappels automatiques (tâches de fond, déclencheurs, autres sessions) : pas une nouvelle demande.
    if (!['composer', 'bridge', 'sdk'].includes(e.origin.kind)) return next(e)
    // Nouvelle demande : on repart de zéro (on garde seulement ce qui tourne encore).
    const left = await update($, calls, l => l.filter(c => c.endedAt === undefined))
    if (left.length === 0) await update($, plan, () => [])
    await update($, view, x => ({ ...x, opened: [], folded: [] }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await ensureOpen($).catch(() => {}) // ne bloque jamais outils ni messages
    const a = e as unknown as Args
    if (PLAN_TOOLS.includes(e.tool)) {
      await update($, plan, steps => nextPlan(steps, a))
      return next(e)
    }
    // wrap_up coche tout le plan dans l'app : pareil ici.
    if (e.tool === 'mcp__ccd_turn__wrap_up') await update($, plan, steps => steps.map(s => ({ ...s, status: 'completed' as const })))
    if (HIDDEN_TOOLS.test(e.tool)) return next(e)
    const avg = ((await $.store.get('avg')) ?? {}) as Record<string, { n: number; ms: number }>
    const startedAt = await $.clock.now()
    const call: Call = {
      id: e.tool_use_id,
      tool: e.tool,
      ...describe(e.tool, a),
      estMs: avg[e.tool]?.ms ?? DEFAULT_MS[e.tool] ?? 3000,
      startedAt,
    }
    await update($, now, () => startedAt)
    await update($, calls, list => [...list, call].slice(-300))
    ticker ??= $.clock.every(1000, () => void $.clock.now().then(t => update($, now, () => t)))

    const ran = await next(e)

    const endedAt = await $.clock.now()
    const tail = resultTail((ran as { result?: unknown }).result)
    const failed = 'deny' in ran || (ran as { isError?: boolean }).isError === true
    const list = await update($, calls, l =>
      l.map(c => (c.id === call.id ? { ...c, endedAt, ...(failed ? { failed } : {}), detail: [...c.detail, ...tail] } : c)),
    )
    const prev = avg[e.tool] ?? { n: 0, ms: 0 }
    const n = Math.min(prev.n + 1, 20) // moyenne glissante sur ~20 appels
    await $.store.set('avg', { ...avg, [e.tool]: { n, ms: prev.ms + (endedAt - startedAt - prev.ms) / n } })
    if (!list.some(c => c.endedAt === undefined)) {
      ticker?.cancel()
      ticker = undefined
    }
    return ran
  })

  // Panneau à droite de la conversation (plus sous la carte Contexte).
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => body($, e))

}

const ICON: Record<string, string> = {
  Lecture: '≡', Recherche: '⌕', Web: '◍', Modifications: '✎', Commandes: '›_', Agents: '◇', Autre: '·',
}

// Mêmes teintes que la carte Contexte.
const TRACK = '#2a303a'
const GREEN = '#4ade80'
const RED = '#f87171'

// Barre texte (terminal) qui se remplit à mesure que le temps estimé s'écoule.
const bar = (ratio: number, width = 12) => {
  const full = Math.round(Math.min(1, Math.max(0, ratio)) * width)
  return '━'.repeat(full) + '╌'.repeat(width - full)
}

// Jauge en dégradé avec point lumineux, comme la carte Contexte.
export function lineSvg(ratio: number, color: string, width: number) {
  const h = 6
  const filled = Math.max(h, Math.round(Math.min(1, Math.max(0, ratio)) * width))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h + 4}" viewBox="0 0 ${width} ${h + 4}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}"/></linearGradient><filter id="f" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.6"/></filter></defs><rect y="2" width="${width}" height="${h}" rx="${h / 2}" fill="${TRACK}"/><rect y="2" width="${filled}" height="${h}" rx="${h / 2}" fill="url(#g)"/><circle cx="${filled - h / 2}" cy="${2 + h / 2}" r="${h / 2 + 1}" fill="${color}" opacity="0.55" filter="url(#f)"/><circle cx="${filled - h / 2}" cy="${2 + h / 2}" r="${h / 2 - 0.5}" fill="#ffffff" opacity="0.9"/></svg>`
}

// Styles de jauge, comme la carte Contexte.
export const GAUGES = ['Ligne', 'Segments', 'Anneau', 'Aucune'] as const
const clamp01 = (r: number) => Math.min(1, Math.max(0, r))

export function segmentsSvg(ratio: number, color: string, count: number) {
  const w = 6, gap = 2.5, h = 10
  const lit = Math.round(clamp01(ratio) * count)
  const width = count * w + (count - 1) * gap
  const rects = Array.from({ length: count }, (_, i) =>
    `<rect x="${(i * (w + gap)).toFixed(1)}" width="${w}" height="${h}" rx="2" fill="${i < lit ? color : TRACK}" fill-opacity="${i < lit ? (0.45 + (0.55 * (i + 1)) / Math.max(1, lit)).toFixed(2) : 1}"/>`).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${rects}</svg>`, width, height: h }
}

export function ringSvg(ratio: number, color: string, size: number) {
  const stroke = 2.6
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const m = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${stroke}"/><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(clamp01(ratio) * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${m} ${m})"/></svg>`
}

// Version texte pour le terminal (pas de Svg).
export function gaugeText(ratio: number, style: string) {
  if (style === 'Anneau') return ['○', '◔', '◑', '◕', '●'][Math.round(clamp01(ratio) * 4)]!
  if (style === 'Segments') { const lit = Math.round(clamp01(ratio) * 10); return '▰'.repeat(lit) + '▱'.repeat(10 - lit) }
  return bar(ratio)
}

// Le contenu du panneau (fonction du haut du fichier : le moteur l'exige pour lui passer $).
async function body($: EngineInterface, e: RenderInput<'Pane'>) {
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Svg = 'Svg' in els ? els.Svg : undefined // pas de Svg dans le terminal
  const [list, steps, v, t, p] = [await read($, calls), await read($, plan), await read($, view), await read($, now), await read($, prefs)]
  const ACCENT = p.accent
  const CHECK = p.checkColor ?? GREEN // couleur des ✓ validées
  const TIME = p.timeColor ?? ACCENT // couleur des temps qui défilent
  const isTerminal = e.surface === 'terminal'
  const set = (fn: (v: View) => View) => void update($, view, fn)
  const pick = (fn: (p: Prefs) => Prefs) => void setPrefs($, fn)
  const left = (c: Call) => c.estMs - (t - c.startedAt)
  const running = list.filter(c => c.endedAt === undefined)
  const total = running.reduce((s, c) => s + Math.max(0, left(c)), 0)
  const barWidth = Math.max(80, Math.min(220, (e.props.bodyColumns ?? 40) * 5))

  const style = p.gauge ?? 'Ligne'
  const gauge = (key: string, ratio: number) => {
    const pct = `${Math.round(clamp01(ratio) * 100)}%`
    if (style === 'Aucune') return false
    if (isTerminal || !Svg) return <Text key={key} color={ACCENT} dimColor>{gaugeText(ratio, style)}{style === 'Anneau' ? ' ' + pct : ''}</Text>
    if (style === 'Segments') {
      const s = segmentsSvg(ratio, ACCENT, Math.max(6, Math.floor((barWidth + 2.5) / 8.5)))
      return <Svg key={key} source={s.svg} alt={pct} width={s.width} height={s.height} />
    }
    if (style === 'Anneau') return (
      <Box key={key} flexDirection="row" alignItems="center" gap="sm">
        <Svg source={ringSvg(ratio, ACCENT, 16)} alt={pct} width={16} height={16} />
        <Text size="footnote" dimColor tabular>{pct}</Text>
      </Box>
    )
    return <Svg key={key} source={lineSvg(ratio, ACCENT, barWidth)} alt={pct} width={barWidth} height={10} />
  }

  const bg = p.background in BACKGROUNDS ? BACKGROUNDS[p.background] : BACKGROUNDS.Carte!
  const card = (key: string, children: RenderChildren) => (
    // Pas de prop undefined : le moteur refuserait tout l'arbre.
    <Box key={key} flexDirection="column" gap="sm" paddingX="md" paddingY="sm"
      {...(bg ? { borderStyle: 'round', borderColor: bg.border, backgroundColor: bg.bg } : {})}>
      {children}
    </Box>
  )
  // Ligne « libellé … temps » : le libellé se coupe avec « … », le temps garde une colonne fixe à droite.
  const line = (key: string, label: RenderChildren, time: RenderChildren) => (
    <Box key={key} flexDirection="row" alignItems="center" gap="sm">
      <Box flexGrow={1} flexShrink={1} minWidth={0}>{label}</Box>
      <Box flexShrink={0} width={7} justifyContent="flex-end">{time}</Box>
    </Box>
  )
  const caption = (key: string, text: string) => <Text key={key} size="caption" dimColor weight="medium">{text.toUpperCase()}</Text>

  // ----- En-tête : bilan étape par étape -----
  const ok = list.filter(c => c.endedAt !== undefined && !c.failed).length
  const ko = list.filter(c => c.failed).length
  const tally = (
    <Box key="tally" flexDirection="row" gap="sm">
      {ok > 0 && <Text size="footnote" color={CHECK} tabular>✓ {ok} validée{ok > 1 ? 's' : ''}</Text>}
      {running.length > 0 && <Text size="footnote" color={ACCENT} tabular>● {running.length} en cours</Text>}
      {ko > 0 && <Text size="footnote" color={RED} tabular>✕ {ko} échec{ko > 1 ? 's' : ''}</Text>}
    </Box>
  )
  const buttons = (
    <Box key="btns" flexDirection="row" gap="sm" alignItems="center">
      <Button key="gear" plain dimColor={!v.settings} label={v.settings ? '✕' : '⚙'} onPress={() => set(x => ({ ...x, settings: !x.settings }))} />
      <Button key="eye" plain dimColor label={v.hidden ? '◌' : '◉'} onPress={() => set(x => ({ ...x, hidden: !x.hidden }))} />
    </Box>
  )
  // Résumé masqué : il ne reste que les boutons, discrets, en haut à droite.
  const header = p.showSummary === false
    ? <Box key="head" flexDirection="row" justifyContent="flex-end">{buttons}</Box>
    : card('head', [
    <Box key="row" flexDirection="row" justifyContent="space-between" alignItems="center">
      <Box flexDirection="column" gap={0}>
        {caption('cap', 'Progress')}
        {running.length > 0
          ? <Text weight="semibold" color={ACCENT} tabular>{running.length} en cours · <Text color={TIME}>~{fmt(total)}</Text></Text>
          : <Text weight="semibold">{list.length ? `Terminé · ${list.length} action${list.length > 1 ? 's' : ''}` : 'Prêt'}</Text>}
        {list.length > 0 && tally}
      </Box>
      {buttons}
    </Box>,
    running.length > 0 && gauge('g-total', 1 - total / Math.max(1, running.reduce((s, c) => s + c.estMs, 0))),
  ])

  // ----- Réglages : uniquement des boutons, pareil sur toutes les surfaces -----
  const chip = (key: string, label: string, isOn: boolean, onPress: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={onPress} />
  )
  const section = (key: string, title: string, children: RenderChildren) => (
    <Box key={key} flexDirection="column" gap="xs">
      {caption('t', title)}
      <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">{children}</Box>
    </Box>
  )
  // Pastilles de couleur pour un réglage (couleur principale, ✓, temps).
  const swatches = (prefix: string, current: string, choose: (c: string) => (x: Prefs) => Prefs, palette = COLORS) =>
    Object.entries(palette).map(([name, c]) => (
      <Button key={prefix + ':' + name} label={`${current === c ? '◉' : '●'} ${name}`} variant={current === c ? 'primary' : 'secondary'} onPress={() => pick(choose(c))}>
        <Text color={c}>{current === c ? '◉' : '●'}</Text>
        <Text dimColor={current !== c}> {name}</Text>
      </Button>
    ))
  const toggleChip = (key: 'showSummary' | 'showPlan' | 'showHistory' | 'showTimes', label: string) => {
    const isOn = p[key] !== false
    return chip('opt:' + key, `${isOn ? '✓' : '+'} ${label}`, isOn, () => pick(x => ({ ...x, [key]: x[key] === false })))
  }
  const settings = v.settings && card('settings', [
    <Box key="title" flexDirection="row" alignItems="center" justifyContent="space-between" gap={2}>
      <Text weight="semibold">Personnaliser</Text>
      <Box flexDirection="row" gap="sm">
        <Button key="reset" label="↺ Défaut" plain dimColor onPress={() => pick(() => DEFAULT_PREFS)} />
        <Button key="close-settings" label="Masquer" plain dimColor onPress={() => set(x => ({ ...x, settings: false }))} />
      </Box>
    </Box>,
    section('s-color', 'Couleur', swatches('color', p.accent, c => x => ({ ...x, accent: c }))),
    section('s-check', 'Validations ✓', swatches('check', CHECK, c => x => ({ ...x, checkColor: c }), { Vert: GREEN, ...COLORS })),
    section('s-time', 'Temps', swatches('time', TIME, c => x => ({ ...x, timeColor: c }), { Blanc: '#e5e7eb', ...COLORS })),
    section('s-gauge', 'Jauge', GAUGES.map(name => chip('gauge:' + name, name, style === name, () => pick(x => ({ ...x, gauge: name }))))),
    section('s-bg', 'Fond', Object.keys(BACKGROUNDS).map(name => chip('bg:' + name, name, p.background === name, () => pick(x => ({ ...x, background: name }))))),
    section('s-width', 'Largeur', Object.entries(WIDTHS).map(([name, w]) => chip('width:' + name, name, p.width === w, () => pick(x => ({ ...x, width: w }))))),
    section('s-show', 'Afficher', [toggleChip('showSummary', 'Résumé'), toggleChip('showPlan', 'Plan'), toggleChip('showHistory', 'Historique'), toggleChip('showTimes', 'Temps')]),
  ])
  if (v.hidden) return <Box flexDirection="column" gap="sm">{header}{settings}</Box>

  // ----- Plan -----
  const doneSteps = steps.filter(s => s.status === 'completed').length
  const planCard = p.showPlan && steps.length > 0 && card('plan', [
    <Box key="top" flexDirection="row" justifyContent="space-between" alignItems="center">
      {caption('cap', 'Plan')}
      <Text size="footnote" dimColor tabular>{doneSteps}/{steps.length}</Text>
    </Box>,
    gauge('g-plan', doneSteps / steps.length),
    ...steps.map((s, i) => (
      <Text key={'step' + i} wrap="truncate-end">
        <Text color={s.status === 'completed' ? CHECK : s.status === 'in_progress' ? ACCENT : 'gray'} dimColor={s.status === 'pending'}>{s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'}</Text>
        <Text color={s.status === 'in_progress' ? ACCENT : 'gray'} dimColor={s.status !== 'in_progress'}>  {s.title}</Text>
      </Text>
    )),
  ])

  // ----- Actions -----
  const row = (c: Call, isNow: boolean) => {
    const isDone = c.endedAt !== undefined
    const isDetail = v.opened.includes(c.id)
    // ✓ validée · ✕ échec · ● en cours · ○ en attente
    const mark = c.failed ? '✕' : isDone ? '✓' : isNow ? '●' : '○'
    const markColor = c.failed ? RED : isDone ? CHECK : isNow ? ACCENT : 'gray'
    // Le temps ne s'affiche que pendant que l'action tourne ; finie, il ne reste que le ✓.
    const time = c.failed ? <Text size="footnote" color={RED}>échec</Text>
      : isNow && !isDone ? <Text size="footnote" color={TIME} tabular>{fmt(left(c))}</Text>
      : false
    return (
      <Box key={'row:' + c.id} flexDirection="column" gap="xs" paddingLeft={1}>
        {line('l',
          <Button key={'call:' + c.id} plain dimColor={isDone || !isNow} onPress={() => set(x => ({ ...x, opened: toggle(x.opened, c.id) }))}>
            <Text wrap="truncate-end"><Text dimColor>{isDetail ? '▾' : '▸'}</Text> <Text color={markColor} dimColor={!isDone && !isNow}>{mark}</Text> {c.label}</Text>
          </Button>,
          p.showTimes && time,
        )}
        {isNow && !isDone && gauge('g-' + c.id, 1 - left(c) / c.estMs)}
        {isDetail && (
          <Box flexDirection="column" paddingLeft={2} paddingY="xs">
            {c.detail.filter(Boolean).map(line => (
              <Text dimColor mono size="footnote" wrap="truncate-middle">{line}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  }

  const shown = p.showHistory ? list : running
  const groups = ORDER.map(cat => ({ cat, items: shown.filter(c => c.category === cat) })).filter(g => g.items.length)
  // Temps total de toutes les actions : restant pendant le travail, passé une fois tout fini.
  const spent = shown.reduce((s, c) => s + (c.endedAt !== undefined ? c.endedAt - c.startedAt : 0), 0)
  const actionsCard = card('actions', [
    line('cap', caption('t', 'Actions'), p.showTimes && shown.length > 0 && (running.length
      ? <Text size="footnote" weight="semibold" color={TIME} tabular>~{fmt(total)}</Text>
      : <Text size="footnote" weight="semibold" color={CHECK} tabular>✓ {fmt(spent)}</Text>)),
    shown.length === 0 && <Text key="empty" dimColor>Rien pour l'instant. Les actions de Claude apparaîtront ici.</Text>,
    ...groups.map(({ cat, items }) => {
      const active = items.filter(c => c.endedAt === undefined)
      const done = items.filter(c => c.endedAt !== undefined)
      const first = active[0]
      const isOpen = !v.folded.includes(cat)
      // En cours : estimation du temps restant avant la fin de tout dans la catégorie. Fini : temps total passé.
      const catLeft = active.reduce((s, c) => s + Math.max(0, left(c)), 0)
      const catSpent = done.reduce((s, c) => s + ((c.endedAt ?? 0) - c.startedAt), 0)
      return (
        <Box key={'grp:' + cat} flexDirection="column" gap="xs">
          {line('h',
            <Button key={'cat:' + cat} plain dimColor={active.length === 0} onPress={() => set(x => ({ ...x, folded: toggle(x.folded, cat) }))}>
              <Text wrap="truncate-end">{isOpen ? '▾' : '▸'} <Text color={active.length ? ACCENT : 'gray'}>{ICON[cat] ?? '·'}</Text> {cat} <Text dimColor>({items.length})</Text></Text>
            </Button>,
            p.showTimes && <Text size="footnote" color={active.length ? TIME : CHECK} tabular>{active.length ? '~' + fmt(catLeft) : '✓ ' + fmt(catSpent)}</Text>,
          )}
          {/* Étape par étape, dans l'ordre où Claude les lance. */}
          {isOpen && items.map(c => row(c, c === first))}
        </Box>
      )
    }),
  ])

  return (
    <Box flexDirection="column" gap="sm">
      {header}
      {settings}
      {planCard}
      {actionsCard}
    </Box>
  )
}

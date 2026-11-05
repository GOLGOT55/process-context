import { expect, mock, test } from 'claude-code/testing'

import { guardCheck } from '../hooks/register.js'

const PANE = {
  plugin: 'radar',
  component: 'Pane',
  requestId: 'radar',
  props: { title: 'Radar', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const opened: unknown[] = []
// false = l'app refuse les fenêtres à part (seul Radar s'affiche).
let placed = true
// Laisse finir ce qui a été lancé en arrière-plan (ouverture du panneau).
const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 20))
// true = l'app a fermé les panneaux (ex. après un arrêt).
let closedAll = false
// true = l'app refuse d'afficher le panneau (avec une raison).
let refuseOpen = false
const stored: Record<string, unknown> = {}
const engine = (on: any) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_: unknown, e: unknown) => e)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { stored[e.key] = e.value; return { value: undefined } })
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.open', (_: unknown, e: { id: string }) => { opened.push(e); return { value: refuseOpen ? { isPlaced: false, reason: 'too narrow' } : { isPlaced: e.id === 'radar' || placed } } })
  // Panneaux ouverts (vides tant que rien n'est ouvert ; closedAll simule l'app qui ferme tout).
  on('ui.panes', () => ({ value: closedAll ? [] : opened.map(o => ({ id: (o as { id: string }).id, title: '', isShown: true, isFocused: false, isPlaced: true })) }))
  on('turn.complete', () => ({ text: '' }))
}

test('le panneau à droite suit les actions et se personnalise', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Lire', status: 'in_progress' }, { content: 'Écrire', status: 'pending' }] })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true })
  await $.tool.call({ tool: 'Read', file_path: '/src/app/main.tsx' })
  expect(opened.length).toBeGreaterThan(0)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const one = await $.ui.mount({ ...PANE, surface })
    expect(await one.find({ type: 'Text', text: /^RADAR$/ })).toBeDefined()
    expect(await one.find({ type: 'Button', text: /Lecture/ })).toBeDefined()
    expect((await one.find({ type: 'Text', text: /Écrire/ }))?.text).toContain('●')
    await one.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'gear' })
  expect(await ui.find({ type: 'Text', text: /^Personnaliser$/ })).toBeDefined()
  await ui.press({ key: 'opt:showPlan' })
  expect(await ui.find({ type: 'Text', text: /Écrire/ })).toBeUndefined()
  await ui.press({ key: 'bg:Transparent' })
  expect((stored.prefs as { background: string }).background).toBe('Transparent')
  await ui.press({ key: 'width:Large' })
  expect((stored.prefs as { width: number }).width).toBe(62)
  await ui.press({ key: 'opt:showSummary' })
  expect(await ui.find({ type: 'Text', text: /^RADAR$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Effacer/ })).toBeUndefined()
  await ui.press({ key: 'eye' })
  expect(await ui.find({ type: 'Button', key: 'cat:Lecture' })).toBeUndefined()
  await ui.unmount()
})

test('chaque étape finie est cochée, une nouvelle demande vide l’historique', async ($, on) => {
  for (const k in stored) delete stored[k] // réglages par défaut (le test d'avant masque le résumé)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/src/b.ts' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Catégorie fermée par défaut : les actions finies sont cachées, un clic l'ouvre.
  expect(await ui.find({ type: 'Button', text: /a\.ts/ })).toBeUndefined()
  await ui.press({ key: 'cat:Lecture' })
  expect((await ui.find({ type: 'Button', text: /a\.ts/ }))?.text).toContain('✓')
  expect(await ui.find({ type: 'Text', text: /validée/ })).toBeDefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'nouvelle demande', wait: false, origin: { kind: 'composer' } })
  const fresh = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await fresh.find({ type: 'Button', text: /a\.ts/ })).toBeUndefined()
  expect(await fresh.find({ type: 'Text', text: /Rien pour l'instant/ })).toBeDefined()
  await fresh.unmount()
})

// shortcut: le cas « action en cours visible dans une catégorie fermée » n'est pas testé ici :
// l'outil de test attend la fin de l'appel avant d'afficher ; à vérifier dans l'app.
test('catégorie fermée et finie : ✓ sur la catégorie, ses actions rangées', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'npm install', description: 'Installe' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Lance les tests' })
  await $.tool.call({ tool: 'Skill', skill: 'caveman' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'cat:Commandes' }))?.text).toContain('✓')
  expect(await ui.find({ type: 'Button', text: /Lance les tests/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'cat:Skills' })).toBeDefined()
  await ui.press({ key: 'cat:Commandes' })
  expect((await ui.find({ type: 'Button', text: /Lance les tests/ }))?.text).toContain('✓')

  // Réduire toute la carte Actions : il ne reste que son titre.
  await ui.press({ key: 'fold:actions' })
  expect(await ui.find({ type: 'Button', key: 'cat:Commandes' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'fold:actions' }))?.text).toContain('▸')
  await ui.press({ key: 'fold:actions' })
  expect(await ui.find({ type: 'Button', key: 'cat:Commandes' })).toBeDefined()
  await ui.unmount()
})

test('sous-actions finies : ✓ sans temps ; total sur Actions ; couleurs des ✓ et du temps', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Read', file_path: '/src/c.ts' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'cat:Lecture' })
  expect((await ui.find({ type: 'Button', text: /c\.ts/ }))?.text).toContain('✓')
  // Durée seulement sur le total (Actions) et la catégorie, pas sur la sous-action.
  const times = await ui.findAll({ type: 'Text', text: /^✓ \d+s$/ })
  expect(times.length).toBe(2)
  await ui.press({ key: 'gear' })
  await ui.press({ key: 'check:Rose' })
  expect((stored.prefs as { checkColor: string }).checkColor).toBe('#f472b6')
  await ui.press({ key: 'time:Blanc' })
  expect((stored.prefs as { timeColor: string }).timeColor).toBe('#e5e7eb')
  await ui.unmount()
})

test('style de jauge : ligne, segments, anneau ou aucune', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Un', status: 'completed' }, { content: 'Deux', status: 'pending' }] })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'gear' })
  for (const name of ['Segments', 'Anneau', 'Aucune', 'Ligne']) {
    await ui.press({ key: 'gauge:' + name })
    expect((stored.prefs as { gauge: string }).gauge).toBe(name)
    const svg = await ui.find({ type: 'Svg' })
    if (name === 'Aucune') expect(svg).toBeUndefined()
    else expect(svg).toBeDefined()
  }
  await ui.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /━/ })).toBeDefined()
  await term.unmount()
})

test('fichiers touchés : +/− par fichier, détail au clic, gardés d’une demande à l’autre', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'a\nb', new_string: 'a\nb\nc' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Write', file_path: '/src/new.ts', content: '1\n2\n3\n4' })
  await $.prompt.submit({ text: 'suite', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Fichiers touchés · 2/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+4$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^−3$/ })).toBeDefined()
  await ui.press({ key: 'fx:/src/app.ts' })
  expect(await ui.find({ type: 'Text', text: /Modifs\s+2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+  y$/ })).toBeDefined()
  await ui.press({ key: 'gear' })
  await ui.press({ key: 'opt:showFiles' })
  expect(await ui.find({ type: 'Text', text: /Fichiers touchés/i })).toBeUndefined()
  await ui.unmount()
})

test('garde-fou : confirmation, refus, blocage direct, carte et interrupteur', async ($, on) => {
  for (const k in stored) delete stored[k]
  const answers = ['Refuser', 'Autoriser']
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_: unknown, e: { questions: { question: string }[] }) => {
    const q = e.questions[0]!.question
    asked.push(q)
    return { result: { questions: e.questions, answers: { [q]: answers.shift() } } }
  })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const refused = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect('deny' in refused).toBe(true)
  const allowed = await $.tool.call({ tool: 'Bash', command: 'rm -rf ./build' })
  expect('deny' in allowed).toBe(false)
  const blocked = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect('deny' in blocked).toBe(true)
  const safe = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect('deny' in safe).toBe(false)
  expect(asked.length).toBe(2) // le blocage direct ne demande rien

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Garde-fou · 3/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /refusée/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /autorisée/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bloquée/ })).toBeDefined()
  await ui.press({ key: 'gear' })
  await ui.press({ key: 'guard:toggle' })
  expect((stored.prefs as { guard: boolean }).guard).toBe(false)
  await ui.unmount()

  // Désactivé : plus aucune question, la commande passe.
  const off = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
  expect('deny' in off).toBe(false)
  expect(asked.length).toBe(2)
})

test('garde-fou : seulement là où une commande commence, pas dans du texte', async () => {
  expect(guardCheck('rm -rf ./build')).toBeDefined()
  expect(guardCheck('cd x && rm -rf ./build')).toBeDefined()
  expect(guardCheck("git status; git push --force origin main")).toBeDefined()
  expect(guardCheck('Remove-Item "C:\\Users\\ruben\\Cerveau\\note.md"')).toBeDefined()
  expect(guardCheck('rm -rf /')?.block).toBe(true)
  // Du texte qui contient juste les mots : pas d'alerte.
  expect(guardCheck(`echo "ne lance pas rm -rf ./build"`)).toBeUndefined()
  expect(guardCheck(`cat >> test.tsx <<'X'\n  await call({ command: 'rm -rf ./build' })\nX`)).toBeUndefined()
  expect(guardCheck('git commit -m "pas de git push --force ici"')).toBeUndefined()
  expect(guardCheck('ls -la')).toBeUndefined()
})

test('éditeur : clic sur un fichier = sa propre fenêtre, contenu numéroté et onglet Changements', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  placed = true
  engine(on)
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: e.path.endsWith('a.ts') ? 'fichier A\n' : 'const a = 1\nconst b = 2\nconst c = 3\n' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'const b = 0', new_string: 'const b = 2' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'x', new_string: 'fichier A' })

  // Un clic par fichier : une fenêtre chacun, Radar reste tel quel.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f:/src/app.ts' })
  await ui.press({ key: 'f:/src/a.ts' })
  expect(await ui.find({ type: 'Text', text: /Fichiers touchés/i })).toBeDefined()
  await ui.unmount()
  const ids = opened.map(o => (o as { id: string }).id).filter(id => id.startsWith('pf-'))
  expect(new Set(ids).size).toBe(2)

  const w = await $.ui.mount({ ...PANE, requestId: ids[0]!, props: { ...PANE.props, bodyColumns: 90 }, surface: 'desktop' })
  expect(await w.find({ type: 'Text', text: /^1\s+const a = 1$/ })).toBeDefined()
  expect(await w.find({ type: 'Text', text: /^2 \+ const b = 2$/ })).toBeDefined()
  await w.press({ key: 'tab:diff' })
  // Numéro réel de la ligne dans le fichier (2), pas 1 à chaque modification.
  expect(await w.find({ type: 'Text', text: /LIGNE 2/ })).toBeDefined()
  expect(await w.find({ type: 'Text', text: /^\s*2 − const b = 0$/ })).toBeDefined()
  expect(await w.find({ type: 'Text', text: /^\s*2 \+ const b = 2$/ })).toBeDefined()
  await w.unmount()
  const w2 = await $.ui.mount({ ...PANE, requestId: ids[1]!, props: { ...PANE.props, bodyColumns: 90 }, surface: 'desktop' })
  expect(await w2.find({ type: 'Text', text: /fichier A/ })).toBeDefined()
  await w2.unmount()
})

test('éditeur : si l’app refuse les fenêtres, les fichiers s’ouvrent en onglets dans Radar', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  placed = false
  engine(on)
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: e.path.endsWith('a.ts') ? 'fichier A\n' : 'fichier B\n' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'x', new_string: 'fichier A' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/b.ts', old_string: 'y', new_string: 'fichier B' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f:/src/a.ts' })
  expect(await ui.find({ type: 'Text', text: /fichier A/ })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'f:/src/b.ts' })
  expect(await ui.find({ type: 'Button', key: 'ft:/src/a.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /fichier B/ })).toBeDefined()
  await ui.press({ key: 'ft:/src/a.ts' })
  expect(await ui.find({ type: 'Text', text: /fichier A/ })).toBeDefined()
  await ui.press({ key: 'fc:/src/b.ts' })
  expect(await ui.find({ type: 'Button', key: 'ft:/src/b.ts' })).toBeUndefined()
  await ui.unmount()
  placed = true
})

test('⚙ Catégories : masquer une catégorie, puis la remettre', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts' })
  await $.tool.call({ tool: 'Grep', pattern: 'x', path: '/src' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'cat:Lecture' })).toBeDefined()
  await ui.press({ key: 'gear' })
  await ui.press({ key: 'cat-show:Lecture' })
  expect(await ui.find({ type: 'Button', key: 'cat:Lecture' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'cat:Recherche' })).toBeDefined()
  expect((stored.prefs as { hiddenCats: string[] }).hiddenCats).toEqual(['Lecture'])
  await ui.press({ key: 'cat-show:Lecture' })
  expect(await ui.find({ type: 'Button', key: 'cat:Lecture' })).toBeDefined()
  await ui.unmount()
})

test('commande stoppée : l’action finit « arrêtée », le minuteur s’arrête, le panneau reste ou revient', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  closedAll = false
  on('tool.call', { tool: 'Bash' }, () => { throw new Error('interrompu') })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'npm run long', description: 'Longue commande' }).catch(() => {})
  await $.turn.complete({ answer: '', reason: 'aborted', durationMs: 1, isAborted: true, turnId: 't' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'cat:Commandes' })
  expect((await ui.find({ type: 'Button', text: /Longue commande/ }))?.text).toContain('■')
  expect(await ui.find({ type: 'Text', text: /^arrêtée$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /en cours/ })).toBeUndefined()
  await ui.unmount()

  // L'app a fermé le panneau : la prochaine demande le rouvre.
  const before = opened.filter(o => (o as { id: string }).id === 'radar').length
  closedAll = true
  await $.prompt.submit({ text: 'encore', wait: false, origin: { kind: 'composer' } })
  closedAll = false
  expect(opened.filter(o => (o as { id: string }).id === 'radar').length).toBe(before + 1)
})

test('ouverture dès le début de la session (sans attendre une demande) et commande /radar', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const ids: string[] = []
  let attached = false // l'écran de l'app s'attache un peu après le démarrage
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: attached ? ids.map(id => ({ id, title: '', isShown: true, isFocused: false, isPlaced: true })) : [] }))
  on('ui.open', (_: unknown, e: { id: string }) => { if (attached) ids.push(e.id); return { value: attached ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await clock.advance(2_100) // pas encore d'écran : il réessaie
  expect(ids.length).toBe(0)
  attached = true
  await clock.advance(2_100) // écran prêt : le panneau s'ouvre tout seul
  expect(ids).toEqual(['radar'])
  await clock.advance(10_000) // ouvert : il arrête de réessayer
  expect(ids.length).toBe(1)

  const r = await $.command.run({ command: 'radar', args: '' } as never)
  expect((r as { text: string }).text).toContain('Radar')
  expect(ids.length).toBe(2)

  // Fin de limite / relance : l'écran revient sans le panneau, il se rouvre tout seul en ≤ 3 s.
  ids.length = 0
  attached = false
  await clock.advance(3_100)
  expect(ids.length).toBe(0) // pas d'écran : rien à faire
  attached = true
  await clock.advance(3_100)
  expect(ids).toEqual(['radar'])
})

test('l’app se reconnecte (redémarrage, bouton stop) : le panneau se rouvre tout de suite, raison gardée sinon', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  closedAll = false
  placed = true
  on('session.attach', (_: unknown, e: { clientId: string }) => ({ clientId: e.clientId }))
  engine(on)
  // Refusé une fois : la raison est gardée pour comprendre.
  refuseOpen = true
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  await settle()
  expect((stored.openTrace as { reason: string }[]).at(-1)?.reason).toBe('too narrow')
  // L'app se reconnecte : rouvert sans attendre une demande.
  refuseOpen = false
  const before = opened.length
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  await settle()
  expect(opened.length).toBeGreaterThan(before)
})

test('chaque réglage de ⚙ : appliqué, gardé, et l’affichage ne casse pas', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Un', status: 'completed' }] })
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'x', new_string: 'y' })
  const prefs = () => stored.prefs as Record<string, unknown>
  const COLORS: Record<string, string> = { Bleu: '#60a5fa', Vert: '#4ade80', Violet: '#c084fc', Orange: '#fb923c', Rose: '#f472b6', Gris: '#a1a1aa' }

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'gear' })
    for (const [name, hex] of Object.entries(COLORS)) {
      await ui.press({ key: 'color:' + name }); expect(prefs().accent).toBe(hex)
      await ui.press({ key: 'check:' + name }); expect(prefs().checkColor).toBe(hex)
      await ui.press({ key: 'time:' + name }); expect(prefs().timeColor).toBe(hex)
    }
    for (const g of ['Segments', 'Anneau', 'Aucune', 'Ligne']) { await ui.press({ key: 'gauge:' + g }); expect(prefs().gauge).toBe(g) }
    for (const b of ['Noir', 'Ardoise', 'Transparent', 'Carte']) { await ui.press({ key: 'bg:' + b }); expect(prefs().background).toBe(b) }
    for (const [w, n] of [['Étroite', 34], ['Large', 62], ['Normale', 46]] as const) { await ui.press({ key: 'width:' + w }); expect(prefs().width).toBe(n) }
    for (const opt of ['showSummary', 'showPlan', 'showHistory', 'showTimes', 'showFiles']) {
      await ui.press({ key: 'opt:' + opt }); expect(prefs()[opt]).toBe(false)
      await ui.press({ key: 'opt:' + opt }); expect(prefs()[opt]).toBe(true)
    }
    for (const cat of ['Lecture', 'Recherche', 'Web', 'Modifications', 'Commandes', 'Agents', 'Skills', 'Autre']) {
      await ui.press({ key: 'cat-show:' + cat }); expect(prefs().hiddenCats).toContain(cat)
      await ui.press({ key: 'cat-show:' + cat }); expect(prefs().hiddenCats).not.toContain(cat)
    }
    await ui.press({ key: 'guard:toggle' }); expect(prefs().guard).toBe(false)
    await ui.press({ key: 'guard:toggle' }); expect(prefs().guard).toBe(true)
    // ↺ Défaut remet tout ; Masquer ferme la personnalisation.
    await ui.press({ key: 'reset' }); expect(prefs().accent).toBe('#a1a1aa') // défaut = gris (réglage de Ruben)
    await ui.press({ key: 'close-settings' })
    expect(await ui.find({ type: 'Text', text: /^Personnaliser$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'cat:Lecture' })).toBeDefined() // l'affichage est toujours là
    await ui.unmount()
  }
})

test('jauge à droite du titre Plan : toujours visible quand la carte est réduite', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Un', status: 'completed' }, { content: 'Deux', status: 'pending' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
  await ui.press({ key: 'fold:plan' })
  expect(await ui.find({ type: 'Text', text: /Deux/ })).toBeUndefined() // étapes cachées
  expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0) // jauge toujours là
  await ui.unmount()
})

test('éditeur : ✎ Modifier, taper, ✓ Confirmer écrit le fichier ; ✕ Annuler et fichier changé n’écrivent rien', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  placed = false // fenêtres refusées : le fichier s'ouvre dans Radar
  engine(on)
  const disk: Record<string, string> = { '/src/app.ts': 'const a = 1\n' }
  const writes: { path: string; text: string }[] = []
  // Le moteur peut donner le chemin résolu (lecteur, antislashs) : on compare la fin.
  const at = (p: string) => Object.keys(disk).find(k => p.replace(/\\/g, '/').endsWith(k)) ?? p
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: disk[at(e.path)] }))
  on('fs.write', (_: unknown, e: { path: string; text: string }) => { writes.push({ path: at(e.path), text: e.text }); disk[at(e.path)] = e.text; return { value: undefined } })
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'x', new_string: 'const a = 1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f:/src/app.ts' })
  await ui.press({ key: 'edit' })
  await settle()
  expect(await ui.find({ type: 'Button', key: 'edit-ok' })).toBeDefined()
  await ui.input({ key: 'edit-field', text: 'const a = 2\n', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /non enregistré/ })).toBeDefined()
  expect(writes.length).toBe(0) // rien d'écrit avant la confirmation
  await ui.press({ key: 'edit-ok' })
  await settle()
  expect(writes).toEqual([{ path: '/src/app.ts', text: 'const a = 2\n' }])
  expect(await ui.find({ type: 'Button', key: 'edit' })).toBeDefined() // retour à la lecture

  // Annuler : rien d'écrit.
  await ui.press({ key: 'edit' })
  await settle()
  await ui.input({ key: 'edit-field', text: 'perdu', kind: 'change' })
  await ui.press({ key: 'edit-cancel' })
  await settle()
  expect(writes.length).toBe(1)

  // Fichier changé sur le disque pendant l'édition : refus, message, rien d'écrasé.
  await ui.press({ key: 'edit' })
  await settle()
  await ui.input({ key: 'edit-field', text: 'ma version', kind: 'change' })
  disk['/src/app.ts'] = 'changé par Claude\n'
  await ui.press({ key: 'edit-ok' })
  await settle()
  expect(writes.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /a changé sur le disque/ })).toBeDefined()
  await ui.unmount()

  // Mobile : pas de champ texte, donc pas de bouton Modifier.
  const m = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await m.find({ type: 'Button', key: 'edit' })).toBeUndefined()
  await m.unmount()
  placed = true
})

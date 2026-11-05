import { expect, test } from 'claude-code/testing'

import { guardCheck } from '../hooks/register.js'

const PANE = {
  plugin: 'progress',
  component: 'Pane',
  requestId: 'progress',
  props: { title: 'Progress', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const opened: unknown[] = []
const stored: Record<string, unknown> = {}
const engine = (on: any) => {
  on('command.register', () => ({ value: { command: 'progress' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_: unknown, e: unknown) => e)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { stored[e.key] = e.value; return { value: undefined } })
  on('clock.now', () => ({ value: 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.open', (_: unknown, e: unknown) => { opened.push(e); return { value: { isPlaced: true } } })
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
    expect(await one.find({ type: 'Text', text: /^PROGRESS$/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /^PROGRESS$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Effacer/ })).toBeUndefined()
  await ui.press({ key: 'eye' })
  expect(await ui.find({ type: 'Button', text: /Lecture/ })).toBeUndefined()
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
test('catégorie fermée : actions finies cachées, la catégorie et son ✓ restent', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Lance les tests' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', text: /Commandes/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Lance les tests/ })).toBeUndefined()
  await ui.press({ key: 'cat:Commandes' })
  expect(await ui.find({ type: 'Button', text: /Lance les tests/ })).toBeDefined()
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

test('éditeur : clic sur un fichier touché, contenu numéroté avec lignes changées, onglet Changements', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  engine(on)
  on('fs.read', () => ({ value: 'const a = 1\nconst b = 2\nconst c = 3\n' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/app.ts', old_string: 'const b = 0', new_string: 'const b = 2' })

  // Clic sur le nom : l'éditeur s'affiche dans Progress.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f:/src/app.ts' })
  expect(await ui.find({ type: 'Text', text: /^1\s+const a = 1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2 \+ const b = 2$/ })).toBeDefined()
  await ui.press({ key: 'tab:diff' })
  expect(await ui.find({ type: 'Text', text: /MODIFICATION 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /− const b = 0/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: /Fichiers touchés/i })).toBeDefined()
  await ui.unmount()
})

test('éditeur : plusieurs fichiers en onglets, et une fenêtre à part par fichier', async ($, on) => {
  for (const k in stored) delete stored[k]
  opened.length = 0
  engine(on)
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: e.path.endsWith('a.ts') ? 'fichier A\n' : 'fichier B\n' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'x', new_string: 'fichier A' })
  await $.tool.call({ tool: 'Edit', file_path: '/src/b.ts', old_string: 'y', new_string: 'fichier B' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f:/src/a.ts' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'f:/src/b.ts' })
  // Deux onglets ouverts, B affiché ; clic sur l'onglet A.
  expect(await ui.find({ type: 'Button', key: 'ft:/src/a.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /fichier B/ })).toBeDefined()
  await ui.press({ key: 'ft:/src/a.ts' })
  expect(await ui.find({ type: 'Text', text: /fichier A/ })).toBeDefined()

  // Une fenêtre à part pour A, puis une autre pour B : deux fenêtres différentes.
  await ui.press({ key: 'pop' })
  await ui.press({ key: 'ft:/src/b.ts' })
  await ui.press({ key: 'pop' })
  const ids = opened.map(o => (o as { id: string }).id).filter(id => id.startsWith('pf-'))
  expect(new Set(ids).size).toBe(2)

  // ✕ ferme l'onglet B ; A reste.
  await ui.press({ key: 'fc:/src/b.ts' })
  expect(await ui.find({ type: 'Button', key: 'ft:/src/b.ts' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /fichier A/ })).toBeDefined()
  await ui.unmount()

  // Chaque fenêtre montre son propre fichier.
  for (const [id, text] of [[ids[0], /fichier A/], [ids[1], /fichier B/]] as const) {
    const w = await $.ui.mount({ ...PANE, requestId: id!, props: { ...PANE.props, bodyColumns: 90 }, surface: 'desktop' })
    expect(await w.find({ type: 'Text', text })).toBeDefined()
    await w.unmount()
  }
})

import { expect, test } from 'claude-code/testing'

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
  expect((await ui.find({ type: 'Button', text: /a\.ts/ }))?.text).toContain('✓')
  expect(await ui.find({ type: 'Text', text: /validée/ })).toBeDefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'nouvelle demande', wait: false, origin: { kind: 'composer' } })
  const fresh = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await fresh.find({ type: 'Button', text: /a\.ts/ })).toBeUndefined()
  expect(await fresh.find({ type: 'Text', text: /Rien pour l'instant/ })).toBeDefined()
  await fresh.unmount()
})

test('sous-actions finies : ✓ sans temps ; total sur Actions ; couleurs des ✓ et du temps', async ($, on) => {
  for (const k in stored) delete stored[k]
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Read', file_path: '/src/c.ts' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
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
  await ui.press({ key: 'f:/src/app.ts' })
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

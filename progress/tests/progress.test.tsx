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

import { expect, test } from 'claude-code/testing'

const stored: Record<string, unknown> = {}
const engine = (on: any) => {
  on('command.register', () => ({ value: { command: 'econome' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { stored[e.key] = e.value; return { value: undefined } })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
}
const compose = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never

test('règles ajoutées au prompt système, /econome off les retire, /econome on les remet', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const on1 = await $.prompt.compose(compose)
  expect(on1.sections.map(s => s.id)).toEqual(['intro', 'econome:rules'])
  expect(on1.sections[1]!.text).toContain('Answer first')
  expect(on1.sections[1]!.text).toContain('Smallest complete change')

  await $.command.run({ command: 'econome', args: 'off' } as never)
  expect((await $.prompt.compose(compose)).sections.map(s => s.id)).toEqual(['intro'])

  await $.command.run({ command: 'econome', args: 'on' } as never)
  expect((await $.prompt.compose(compose)).sections.map(s => s.id)).toEqual(['intro', 'econome:rules'])
})

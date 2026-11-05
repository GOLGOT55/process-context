import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-05T01:00:00Z')

const USAGE = {
  startedAt: NOW - 60_000,
  context: { tokens: 166_000, window: 1_000_000, percent: 16.6 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 7, resetsAt: '2026-10-05T03:01:00Z' },
    { kind: 'seven_day', percentUsed: 6, resetsAt: '2026-10-11T09:00:00Z' },
  ],
  cost: { usd: 3.484 },
}

async function seed($: any, on: any) {
  const clock = mock.clock(on, { now: NOW })
  on('fs.write', () => undefined)
  on('session.usage', () => ({ value: USAGE }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)
}

const mountBand = ($: any, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'aiblueprint', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10 } } as never)

test('the band draws context, cost and both limits', async ($, on) => {
  await seed($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect(await ui.find({ type: 'Text', text: /\$3\.48/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^5h ?$/i })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Semaine ?$/i })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^7%$/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /166k\/1M/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a toggle in the ⚙ panel hides its chip at once and reset brings it back', async ($, on) => {
  await seed($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    await ui.press({ key: 'gear' })
    await ui.press({ key: 'toggle-showWeek' })
    expect(await ui.find({ type: 'Text', text: /^Semaine ?$/i })).toBeUndefined()
    await ui.press({ key: 'reset' })
    expect(await ui.find({ type: 'Text', text: /^Semaine ?$/i })).toBeDefined()
    await ui.press({ key: 'gear' })
    await ui.unmount()
  }
})

test('the band draws at once, before any measure or message', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('fs.write', () => undefined)
  on('session.usage', () => ({ value: USAGE }) as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect(await ui.find({ type: 'Text', text: /\$3\.48/ })).toBeDefined()
    await ui.unmount()
  }
})

test('5h et Semaine s’affichent dès l’ouverture, avec les dernières limites gardées', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: e.key === 'limits' ? USAGE.rateLimits : undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  // Nouvelle conversation : le moteur n'a pas encore de limites.
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)
  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /^5h ?$/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Semaine ?$/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^7%$/ })).toBeDefined()
  await ui.unmount()
})

test('coût et durée de la session, et alerte unique quand la limite 5h passe 80 %', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const toasts: string[] = []
  const kept: Record<string, unknown> = {}
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('ui.toast', (_: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } as never })
  const HIGH = { ...USAGE, startedAt: NOW - 42 * 60_000, rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-05T03:01:00Z' }, USAGE.rateLimits[1]] }
  on('session.usage', () => ({ value: HIGH }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)

  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /\$3\.48.*42 min/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⚠ 85%/ })).toBeDefined()
  await ui.unmount()
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('85')
})

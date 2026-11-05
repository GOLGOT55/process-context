import { expect, mock, test } from 'claude-code/testing'

import { buildSkillIndex, categorize, parseSkill } from '../hooks/econome.js'

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

test('rien de mesuré encore : Contexte, 5h et Semaine affichés à 0 %', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('fs.write', () => undefined)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }) as never)
  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /^5h ?$/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Semaine ?$/i })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /^0%$/ })).length).toBeGreaterThanOrEqual(3)
  await ui.unmount()
})

test('mode économe : actif par défaut, estimation des tokens économisés, case pour le couper', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept: Record<string, unknown> = {}
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('session.usage', () => ({ value: USAGE }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }) as never)
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)
  const compose = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never

  // Actif sans rien régler : les règles sont dans le prompt système.
  const ids = async () => (await $.prompt.compose(compose)).sections.map((x: { id: string }) => x.id)
  expect(await ids()).toEqual(['intro', 'aiblueprint:econome'])

  // 6000 tokens de réponse écrits avec les règles ≈ 4000 économisés (taux 40 %).
  await $.turn.complete({ answer: 'ok', reason: 'completed', durationMs: 1, isAborted: false, turnId: 't', usage: { input_tokens: 0, output_tokens: 6000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never)
  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /^ÉCONOMIE$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~4\.0K/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'eco-toggle' }))?.text).toContain('☑')

  // Case décochée : mode coupé, règles retirées, choix gardé.
  await ui.press({ key: 'eco-toggle' })
  expect((await ui.find({ type: 'Button', key: 'eco-toggle' }))?.text).toContain('☐')
  expect((kept.prefs as { economy: boolean }).economy).toBe(false)
  expect(await ids()).toEqual(['intro'])
  await ui.unmount()
})

test('mode économe : compactage automatique à 400k tokens de contexte, une seule fois', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let compacts = 0
  on('fs.write', () => undefined)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { ...USAGE, context: { tokens: 450_000, window: 1_000_000, percent: 45 } } }) as never)
  on('session.compact', () => { compacts++; return { skip: 'test' } as never })
  on('turn.complete', () => ({ text: 'ok' }) as never)
  const done = { answer: 'ok', reason: 'completed', durationMs: 1, isAborted: false, turnId: 't' } as never
  await $.turn.complete(done)
  await $.turn.complete(done) // déjà en cours : pas de second compactage
  await clock.advance(2_100)
  await clock.advance(2_100)
  expect(compacts).toBe(1)
})

test('tokens économisés gardés pour la session après fermeture et réouverture de l’app', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const START = NOW - 3_600_000 // session reprise : même début qu'avant la fermeture
  const kept: Record<string, unknown> = { ecoSessions: { [String(START)]: 6000, '123': 99 } }
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('session.usage', () => ({ value: { ...USAGE, startedAt: START } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)

  // Réouverture : le total d'avant revient (6000 écrits ≈ 4k économisés).
  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Text', text: /~4\.0K/ })).toBeDefined()
  await ui.unmount()

  // Et continue de monter : 6000 + 3000 = 9000 gardés pour cette session, les autres intactes.
  await $.turn.complete({ answer: 'ok', reason: 'completed', durationMs: 1, isAborted: false, turnId: 't', usage: { input_tokens: 0, output_tokens: 3000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never)
  expect((kept.ecoSessions as Record<string, number>)[String(START)]).toBe(9000)
  expect((kept.ecoSessions as Record<string, number>)['123']).toBe(99)
})

test('skills : en-tête lu, rangés par catégorie, routeurs à part', () => {
  const multi = parseSkill('---\nname: caveman\ndescription: >\n  Terse voice,\n  fewer tokens.\n---\n# x', 'x')
  expect(multi).toEqual({ name: 'caveman', description: 'Terse voice, fewer tokens.' })
  expect(parseSkill('# pas d’en-tête', 'dossier').name).toBe('dossier')
  expect(categorize({ name: 'roblox-debugging', description: 'Debug Roblox games' })).toBe('Jeux')
  expect(categorize({ name: 'montage', description: 'Monte une vidéo YouTube' })).toBe('Vidéo')
  expect(categorize({ name: 'pdf', description: 'Read or create PDF documents' })).toBe('Documents')
  const index = buildSkillIndex([
    { name: 'cat-jeux', description: 'routeur' },
    { name: 'roblox-debugging', description: 'Debug Roblox games' },
    { name: 'pdf', description: 'PDF documents' },
  ])
  expect(index).toContain('router first: cat-jeux')
  expect(index).toContain('- Jeux: roblox-debugging')
  expect(index).toContain('- Documents: pdf')
  expect(index).toContain('Not for a quick question')
})

test('skills : la liste arrive dans le prompt système et se met à jour quand un skill est ajouté', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept: Record<string, unknown> = {}
  let dirs = ['pdf']
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }) as never)
  on('fs.list', () => ({ value: dirs.map(name => ({ name, kind: 'dir' })) }) as never)
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: `---\nname: ${e.path.split(/[\\/]/).slice(-2)[0]}\ndescription: ${e.path.includes('roblox') ? 'Debug Roblox games' : 'PDF documents'}\n---` }) as never)
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('session.usage', () => ({ value: USAGE }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }) as never)
  const compose = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never
  const rules = async () => (await $.prompt.compose(compose)).sections.find((x: { id: string }) => x.id === 'aiblueprint:econome')?.text ?? ''

  await clock.advance(11 * 60_000)
  expect(await rules()).toContain('- Documents: pdf')
  dirs = ['pdf', 'roblox-debugging'] // nouveau skill installé
  await clock.advance(11 * 60_000)
  expect(await rules()).toContain('- Jeux: roblox-debugging')
})

test('terminal : économie affichée en 4.1K avec sa case, styles de jauge', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept: Record<string, unknown> = { ecoSessions: { [String(NOW - 7_200_000)]: 6150 } }
  on('fs.write', () => undefined)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('session.usage', () => ({ value: { ...USAGE, startedAt: NOW - 7_200_000 } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  await $.session.measure({ context: USAGE.context, rateLimits: [] } as never)
  await clock.advance(1_000)
  const ui = await mountBand($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /~4\.1K/ })).toBeDefined() // 6150 écrits ≈ 4100 économisés
  expect((await ui.find({ type: 'Button', key: 'eco-toggle' }))?.text).toContain('☑')
  await ui.press({ key: 'gear' })
  for (const g of ['segments', 'ring', 'none', 'line']) await ui.press({ key: `gauge-${g}` })
  expect((kept.prefs as { gauge: string }).gauge).toBe('line')
  await ui.unmount()
})

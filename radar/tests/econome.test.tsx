import { expect, mock, test } from 'claude-code/testing'

import { buildSkillIndex, categorize, parseSkill } from '../hooks/econome.js'

const NOW = Date.parse('2026-10-05T01:00:00Z')
const USAGE = { startedAt: NOW - 60_000, context: { tokens: 166_000, window: 1_000_000, percent: 16.6 }, rateLimits: [], cost: { usd: 1 } }
const compose = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never
const done = { answer: 'ok', reason: 'completed', durationMs: 1, isAborted: false, turnId: 't' } as never

const base = (on: any, kept: Record<string, unknown>) => {
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[e.key] }) as never)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { kept[e.key] = e.value; return { value: undefined } as never })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }) as never)
}

test('compactage automatique à 400k tokens de contexte, une seule fois', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let compacts = 0
  base(on, {})
  // Après un compactage, le contexte redescend (50k).
  on('session.usage', () => ({ value: { ...USAGE, context: compacts ? { tokens: 50_000, window: 1_000_000, percent: 5 } : { tokens: 450_000, window: 1_000_000, percent: 45 } } }) as never)
  on('session.compact', () => { compacts++; return { skip: 'test' } as never })
  await $.turn.complete(done)
  await $.turn.complete(done) // contexte redescendu : pas de second compactage
  await clock.advance(2_100)
  expect(compacts).toBe(1)
})

test('compactage aussi quand le contexte n’est donné qu’en pourcentage (561k)', async ($, on) => {
  mock.clock(on, { now: NOW })
  let compacts = 0
  base(on, {})
  on('session.usage', () => ({ value: { ...USAGE, context: { window: 1_000_000, percent: 56.1 } } }) as never)
  on('session.compact', () => { compacts++; return { skip: 'test' } as never })
  await $.turn.complete(done)
  expect(compacts).toBe(1)
})

test('mode économe désactivé dans ⚙ : ni compactage ni règles dans le prompt', async ($, on) => {
  mock.clock(on, { now: NOW })
  let compacts = 0
  base(on, { prefs: { econome: false } })
  on('session.usage', () => ({ value: { ...USAGE, context: { tokens: 900_000, window: 1_000_000, percent: 90 } } }) as never)
  on('session.compact', () => { compacts++; return { skip: 'test' } as never })
  await $.turn.complete(done)
  expect(compacts).toBe(0)
  expect((await $.prompt.compose(compose)).sections.map((x: { id: string }) => x.id)).toEqual(['intro'])
})

test('skills : en-tête lu, rangés par catégorie, routeurs à part', () => {
  const multi = parseSkill('---\nname: caveman\ndescription: >\n  Terse voice,\n  fewer tokens.\n---\n# x', 'x')
  expect(multi).toEqual({ name: 'caveman', description: 'Terse voice, fewer tokens.' })
  expect(parseSkill('# pas d’en-tête', 'dossier').name).toBe('dossier')
  expect(categorize({ name: 'roblox-debugging', description: 'Debug Roblox games' })).toBe('Jeux')
  expect(categorize({ name: 'montage', description: 'Monte une vidéo YouTube' })).toBe('Vidéo')
  const index = buildSkillIndex([
    { name: 'cat-jeux', description: 'routeur' },
    { name: 'roblox-debugging', description: 'Debug Roblox games' },
    { name: 'pdf', description: 'PDF documents' },
  ])
  expect(index).toContain('router first: cat-jeux')
  expect(index).toContain('- Jeux: roblox-debugging')
  expect(index).toContain('- Documents: pdf')
})

test('skills : la liste arrive dans le prompt système et se met à jour quand un skill est ajouté', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let dirs = ['pdf']
  base(on, {})
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/test' : undefined }) as never)
  on('fs.list', () => ({ value: dirs.map(name => ({ name, kind: 'dir' })) }) as never)
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: `---\nname: ${e.path.split(/[\\/]/).slice(-2)[0]}\ndescription: ${e.path.includes('roblox') ? 'Debug Roblox games' : 'PDF documents'}\n---` }) as never)
  const rules = async () => (await $.prompt.compose(compose)).sections.find((x: { id: string }) => x.id === 'radar:econome')?.text ?? ''
  await clock.advance(11 * 60_000)
  expect(await rules()).toContain('Econome mode')
  expect(await rules()).toContain('- Documents: pdf')
  dirs = ['pdf', 'roblox-debugging'] // nouveau skill installé
  await clock.advance(11 * 60_000)
  expect(await rules()).toContain('- Jeux: roblox-debugging')
})

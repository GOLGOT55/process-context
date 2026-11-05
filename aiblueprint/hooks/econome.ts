// Règles caveman (réponses) + ponytail (code), ajoutées au prompt système de chaque requête.
// En anglais : moins de tokens pour le même sens ; la langue de réponse reste celle de l'utilisateur.
export const RULES = `# Econome mode (always on): terse answers, minimal code

## Answers (caveman)
- Answer first, then reason, then next step. No greeting, hedging, recap, closer, "Sure", "Let me", "Hope this helps".
- Short words, one idea per sentence (max ~20 words). Fragments fine. Never drop not/never/no/only/except. Numbers exact.
- Code, commands, paths, errors verbatim. In chat show only changed lines plus 1-2 lines of context, not whole files.
- During tool runs: no text between routine calls. One line before a multi-step run, one per phase change, one with the result.
- Final answer: only essentials, a few bullets: done, not done or not verified, problem and cause, what the user must do.
- Keep the user's language. No decorative tables or emoji.
- Use full clear sentences for: security warnings, irreversible actions, questions to the user, step order, a confused user, and anything written to files, commits, docs or messages.

## Code (ponytail)
- Best code is code never written. Smallest complete change: skip unrequested features, options, abstractions, wrappers, config.
- Reuse what exists: project helpers, then standard library, then installed dependencies. Never add a dependency for a few lines.
- Read before writing; reach every caller, test and fixture the change breaks. Fix bugs at the root, once.
- Comment only the why. Non-trivial new logic leaves one small test or self-check.
- Never cut validation at trust boundaries, data-loss handling, security, accessibility, or anything asked for.

## Tokens
- Read only the part of a file you need. Do not re-read files you just edited. Batch independent tool calls.
- Do not repeat the user's request or earlier answers. Do not narrate commands or their output unless needed.`

// Au-delà, le mode économe compacte la conversation tout seul (comme /compact) : chaque requête relit tout le contexte.
export const COMPACT_AT = 400_000

// Part des tokens de réponse que ces règles font gagner, d'après les mesures publiées par caveman et ponytail.
// shortcut: taux fixe (estimation), pas une mesure de cette session ; à remplacer par une mesure A/B si besoin.
export const SAVE_RATIO = 0.4

// Tokens économisés estimés : ce qui a été écrit avec les règles, comparé à la même chose sans elles.
export const savedTokens = (outTokens: number) => Math.round((outTokens * SAVE_RATIO) / (1 - SAVE_RATIO))

// ---------- Skills : liste rangée par catégorie, refaite quand un skill est ajouté ou retiré ----------

export type SkillInfo = { name: string; description: string }

// Lit le nom et la description dans l'en-tête d'un SKILL.md (description sur une ou plusieurs lignes).
export function parseSkill(md: string, fallbackName: string): SkillInfo {
  const head = md.startsWith('---') ? md.slice(3, md.indexOf('\n---', 3)) : ''
  const name = /^name:\s*(.+)$/m.exec(head)?.[1]?.trim().replace(/^["']|["']$/g, '') || fallbackName
  const m = /^description:\s*(.*)$/m.exec(head)
  let description = m?.[1]?.trim() ?? ''
  if (m && (description === '' || description === '>' || description === '|' || description === '>-')) {
    const rest = head.slice((m.index ?? 0) + m[0].length).split('\n').slice(1)
    description = rest.filter((l, i) => /^\s+\S/.test(l) && rest.slice(0, i).every(p => /^\s+\S/.test(p))).map(l => l.trim()).join(' ')
  }
  return { name, description: description.replace(/^["']|["']$/g, '') }
}

// Catégories et mots qui les reconnaissent (nom + description du skill).
const CATEGORIES: [string, RegExp][] = [
  ['Jeux', /roblox|luau|minecraft|\bjeux?\b|\bgames?\b|vfx|anim|hud|\bgui\b|mouvement|blender|mesh|\b3d\b|gameplay/g],
  ['Code', /\bcode|bug|debug|\btests?\b|refactor|review|architect|\bapi\b|deploy|sécur|secur|dette|debt|typescript|python/g],
  ['Web & design', /\bsites?\b|\bweb\b|landing|design|\bui\b|\bux\b|figma|tailwind|interface|\bcss\b|brand|banner|logo|icon/g],
  ['Vidéo', /vid[ée]o|montage|premiere|trailer|hyperframes|\bclips?\b|youtube|tiktok/g],
  ['Voix', /\bvoix\b|voice|\btts\b|doublage|narrat/g],
  ['Marketing', /marketing|\bseo\b|miniature|thumbnail|concurren|competit|\bprix\b|pricing|growth/g],
  ['Recherche', /搜|reach|recherche|research|search|scrap|fetch|browser|navigateur|crawl/g],
  ['Documents', /document|\bpdf\b|docx|\bword\b|excel|xlsx|pptx|slides|présentation|presentation|spreadsheet|sheets?\b/g],
  ['Apprendre', /apprend|\bcours\b|\bprof\b|learn|teach|exercice|explique/g],
  ['Organisation', /obsidian|cerveau|\bnotes?\b|routine|planifi|schedul|mémoire|memory|\btri\b|range|brief/g],
  ['Claude & config', /tokens|terse|concis|claude|\bskills?\b|hook|plugin|\bmods?\b|config|settings|permission|keybind/g],
]

export function categorize(s: SkillInfo): string {
  const text = `${s.name} ${s.name} ${s.name} ${s.description}`.toLowerCase() // le nom compte triple
  let best = 'Autre', score = 0
  for (const [cat, re] of CATEGORIES) {
    const n = text.match(re)?.length ?? 0
    if (n > score) { best = cat; score = n }
  }
  return best
}

// Le texte ajouté au prompt système : la règle d'usage, puis les skills rangés (noms seulement, peu de tokens).
export function buildSkillIndex(skills: SkillInfo[]): string {
  if (skills.length === 0) return ''
  const routers = skills.filter(s => /^(cat-|hub-)/.test(s.name)).map(s => s.name)
  const byCat = new Map<string, string[]>()
  for (const s of skills) {
    if (routers.includes(s.name)) continue
    const cat = categorize(s)
    byCat.set(cat, [...(byCat.get(cat) ?? []), s.name])
  }
  const lines = [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, names]) => `- ${cat}: ${names.sort().join(', ')}`)
  return `# Skills (use them smartly)
- Use a skill only for real work it matches. Not for a quick question, a one-line edit, or a single command.
- Pick the 1-2 most specific skills for the request from the list below, by category. Never load one "just in case".
${routers.length ? `- Category unclear? Use a router first: ${routers.sort().join(', ')}.\n` : ''}${lines.join('\n')}`
}

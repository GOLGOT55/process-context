import type { Register } from 'claude-code'

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

const SECTION_ID = 'econome:rules'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'econome', description: 'Mode économe (réponses courtes, code minimal) : /econome on | off' })
    return next(e)
  })

  // /econome on | off : gardé pour toutes les sessions.
  on('command.run', { command: 'econome' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOff = arg === 'off' ? true : arg === 'on' ? false : (await $.store.get('off')) !== true
    await $.store.set('off', isOff)
    return { text: isOff ? 'Mode économe désactivé.' : 'Mode économe activé : réponses courtes, code minimal.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await $.store.get('off')) === true) return composed
    return { sections: [...composed.sections.filter(s => s.id !== SECTION_ID), { id: SECTION_ID, text: RULES, scope: 'session' }] }
  })
}

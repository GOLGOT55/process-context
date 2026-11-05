# Radar

Two mods for **Claude Code** that show what is happening during a session:

| Mod | Where | What it shows |
| --- | --- | --- |
| **Radar** (`radar`) | Panel to the right of the conversation | Claude's actions live, step by step with ✓, estimated times, the details of each action, the files it touched, a safety guard and the economy mode |
| **Context** (`aiblueprint`) | Card above the prompt box | Context used, session cost and duration, 5-hour and weekly limits (alert at 80%), and tokens saved by the economy mode |

## Install

### Everything in one command

In a terminal (PowerShell, bash or zsh):

```bash
claude plugin install radar --marketplace GOLGOT55/process-context; claude plugin install aiblueprint --marketplace GOLGOT55/process-context
```

Then open a new Claude Code session: both mods are active.

### One at a time

At the prompt of a Claude Code session in a terminal:

```
/plugin install radar --marketplace GOLGOT55/process-context
/plugin install aiblueprint --marketplace GOLGOT55/process-context
```

Answer `y` to add the marketplace, then pick the scope (user = all your sessions).

In the Claude app (Code tab): **+** button next to the prompt box → **Plugins** → **Add marketplace** with `GOLGOT55/process-context`, then **Add plugin** for each mod.

## Radar

- Opens on its own on the right as soon as the session starts (at the latest on the first request); `/radar` reopens it.
- **Categories**: Read, Search, Web, Edits, Commands, Agents, Skills, Other. A finished category gets a ✓.
- **Collapsible cards**: click a title (▾ / ▸) — Plan, Actions, Files touched, Guard — to fold it.
- **Estimated time** counting down for each running action, learned from real durations and kept across sessions.
- **Details on click**: file and lines, search pattern and folder, web page or query, command, edit preview (−/+), end of the result.
- **Total time** on the Actions card: time left while working, then time spent (✓) once done.
- **Step by step**: each sub-action has a state — ✓ done, ● running (with countdown), ○ waiting, ✕ failed, ■ stopped.
- **Stop button**: a stopped command ends as "stopped", its timer stops and the panel stays open.
- **History**: finished actions stay visible; each new request starts from an empty panel.
- **Plan**: Claude's plan at the top (○ to do, ● in progress, ✓ done).
- **Files touched**: every file edited during the conversation, with +/− lines per file and in total. Clicking a name opens the file in **its own editor window** (one per file):
  - **Content** tab: numbered file, lines changed by Claude highlighted in green;
  - **Changes** tab: each edit with its real line number, removed lines in red (−), added lines in green (+);
  - **Direct editing**: ✎ Edit makes the text editable, ✓ Confirm writes the file, ✕ Cancel changes nothing. If the file changed on disk meanwhile, nothing is overwritten (not on mobile: no text field there);
  - if the app refuses separate windows, files open as **tabs** inside Radar.
- **Guard** (on/off in ⚙): before a risky command, a dialog asks Allow or Deny:
  - recursive delete (`rm -rf`, `Remove-Item -Recurse`, `rmdir /s`);
  - `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`.

  Only real commands count: text that merely contains these words triggers nothing. Wiping or formatting a whole drive is always denied. The Guard card lists each command with ✓ allowed, ✕ denied or ⛔ blocked.
- **Categories folded by default**: only the running action shows, with its timer; once done it folds away and the category shows ✓.

### Customize

**⚙** button:

- Color, color of ✓ checks, color of times
- Gauge: line, segments, ring or none — placed to the right of the titles, so it stays visible when a card is folded
- Background: card, black, slate, transparent
- Width: narrow, normal, wide
- Show or hide: summary, plan, history, times, files, and each category
- Guard and economy mode: on or off

Settings are kept for all sessions.

## Economy mode (in Radar and Context)

On by default. On every request it adds these rules to the system prompt:

- **caveman**: answer first, no pleasantries or recap, short sentences, code and errors copied verbatim;
- **ponytail**: smallest complete change, reuse what exists, nothing unrequested.

More reliable than a skill: the model rereads the rules on every message. About 435 tokens per request, cached by the API. With both mods installed, the rules are added only once.

- **Smart skill use**: at startup the mod reads your skills (`~/.claude/skills`), sorts them by category (Games, Code, Web & design, Video…) and gives Claude the list with a rule: use a skill only for real work it matches, and only the 1–2 most specific ones. New skills are picked up on their own (checked every 10 min). About 280 tokens.
- **Auto-compaction at 400k tokens**. To let Claude Code do it itself, even when the app restarts its process between messages, add to `~/.claude/settings.json`:
  `"env": { "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "40" }` (40% of a 1M window = 400k).
- **Tokens saved** (Context card): output tokens written with the mode × 40% ÷ 60% (an average rate, not an exact measure), shown as "~4.1K" and kept per session.
- Security warnings, questions and anything written to files stay in full sentences.

## Context

- Context used (tokens and percent), 5-hour and weekly limits with a gauge, pace (+/−) and reset time.
- **Cost & time**: session cost and how long it has been running.
- **80% alert**: one notification per window and a ⚠ when the 5-hour limit passes 80%.
- Limits show from the start of a conversation: the last known values are kept until the first reply.
- **⚙** button to choose what shows, gauge style, color, size and background. Options are also available in Claude Code settings (`pluginConfigs`).

## Limits

- A mod cannot draw in the app's Environment / Context / Connectors column: Radar opens in its own panel on the right.
- Times are estimates: Claude does not announce how long its actions will take.
- Mods only run while Claude Code is running. After stop, rewind, or when your usage limit is reached, the app does not start Claude Code until your next accepted message, so the panels disappear until then.

## Development

Each mod is a standalone folder (`.claude-plugin/plugin.json`, `hooks/register.tsx`, `types/index.d.ts`, `tests/`).

```bash
claude plugin validate ./radar
claude plugin test ./radar
claude --plugin-dir ./radar --plugin-dir ./aiblueprint
```

## License

[MIT](LICENSE) © GOLGOT55

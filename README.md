# Radar

One mod for **Claude Code** that shows what is happening during a session:

- **Radar panel** (right of the conversation): Claude's actions live, step by step with ✓, estimated times, the details of each action, the files it touched and a safety guard.
- **Context card** (above the prompt box): context used, session cost and duration, 5-hour and weekly limits (alert at 80%), tokens saved.
- **Economy mode**: short answers, minimal code, auto-compaction at 400k tokens and smart skill selection.

## Install

### Option 1 — one command

In a terminal (PowerShell, bash or zsh):

```bash
claude plugin install radar --marketplace GOLGOT55/radar --scope user
```

### Option 2 — add the marketplace, then install

Use this if option 1 is refused, or to see the marketplace in your list:

```bash
claude plugin marketplace add GOLGOT55/radar
claude plugin install radar@radar --scope user
```

Same thing from the prompt of a Claude Code session:

```
/plugin marketplace add GOLGOT55/radar
/plugin install radar@radar
```

In the Claude app (Code tab): **+** next to the prompt box → **Plugins** → **Add marketplace** `GOLGOT55/radar` → **Add plugin** → Radar.

Then open a new session: the panel and the card appear on their own. To update later: `claude plugin marketplace update radar`.

If you used the older mods (`progress`, `aiblueprint`), uninstall them first so nothing shows twice:

```bash
claude plugin uninstall progress; claude plugin uninstall aiblueprint
```

## Radar panel

- Opens on its own when the session starts; `/radar` reopens it.
- **Stays up**: after stop, rewind, or when your usage limit resets, it comes back on its own within 3 seconds once Claude Code is running again (your next accepted message). Closed by hand with ✕, it stays closed until your next message or `/radar`.
- **Categories**: Read, Search, Web, Edits, Commands, Agents, Skills, Other. A finished category gets a ✓. Categories are folded by default: only the running action shows, with its timer.
- **Collapsible cards**: click a title (▾ / ▸) — Plan, Actions, Files touched, Guard — to fold it.
- **Estimated time** counting down for each running action, learned from real durations and kept across sessions. Total time on the Actions card.
- **Details on click**: file and lines, search pattern, web page or query, command, edit preview (−/+), end of the result.
- **Step by step**: ✓ done, ● running, ○ waiting, ✕ failed, ■ stopped.
- **History**: finished actions stay visible; each new request starts from an empty panel.
- **Plan**: Claude's plan at the top (○ to do, ● in progress, ✓ done).
- **Files touched**: every file edited during the conversation, with +/− lines. Clicking a name opens the file in **its own editor window**:
  - **Content** tab: numbered file, lines changed by Claude in green;
  - **Changes** tab: each edit with its real line number, removed lines in red, added in green;
  - **Direct editing**: ✎ Edit, then ✓ Confirm writes the file, ✕ Cancel changes nothing. If the file changed on disk meanwhile, nothing is overwritten (not on mobile);
  - if the app refuses separate windows, files open as tabs inside Radar.
- **Guard** (on/off in ⚙): before a risky command (`rm -rf`, `Remove-Item -Recurse`, `rmdir /s`, `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`) a dialog asks Allow or Deny. Wiping or formatting a drive is always denied. Only real commands count, not text that mentions them.

**⚙** settings (defaults: gray, wide, transparent, segment gauges): color, color of ✓ and times, gauge (line, segments, ring, none — shown right of the titles, visible when folded), background, width, what to show, each category, guard, economy mode. Kept for all sessions.

## Context card

- Context used (tokens and percent), 5-hour and weekly limits with gauge, pace (+/−) and reset time.
- **Cost & time** of the session.
- **80% alert**: one notification per window and a ⚠ when the 5-hour limit passes 80%.
- Shows from the start of a conversation, with the last known limits; 0% when nothing is measured yet.
- **⚙** to choose what shows, gauge style, color, size and background (defaults: blue, compact, no background, cost & time and tokens saved shown). Also in Claude Code settings (`pluginConfigs`).

## Economy mode

On by default; the ☑ box on the Context card and ⚙ in Radar turn it on or off (same setting). On every request it adds to the system prompt:

- **caveman** rules: answer first, no pleasantries or recap, short sentences, code and errors verbatim;
- **ponytail** rules: smallest complete change, reuse what exists, nothing unrequested;
- **your skills, sorted by category** (Games, Code, Web & design, Video…), with a rule: only for real work they match, the 1–2 most specific. New skills are picked up within 10 minutes.

About 700 tokens per request, cached by the API. Security warnings, questions and anything written to files stay in full sentences.

- **Tokens saved** (Context card): output tokens written with the mode × 40% ÷ 60% (an average rate, not a measure), shown as "~4.1K" and kept per session.
- **Auto-compaction**: choose the threshold in ⚙ → *Compact at*: 200k, 300k, **400k (default, recommended)** or 500k tokens of context. Radar reads the context size whether Claude Code reports it in tokens or only as a percentage of the window. Picking a threshold also sets Claude Code's own auto-compaction (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` in `~/.claude/settings.json`, converted to a percentage, e.g. 400k of 1M = 40) so it follows the same choice between messages.

## Limits

- Mods only run while Claude Code runs. When your usage limit is reached, the app does not start Claude Code, so nothing can draw until a message is accepted again; Radar then comes back on its own.
- A mod cannot draw in the app's Environment / Context / Connectors column: Radar uses its own panel.
- Times are estimates: Claude does not announce how long its actions take.

## Development

```bash
claude plugin validate ./radar
claude plugin test ./radar
claude --plugin-dir ./radar
```

## License

[MIT](LICENSE) © GOLGOT55

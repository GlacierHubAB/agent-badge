# Agent Badge

A pinned band above the Claude Code prompt that tells you at a glance **who this agent is, what it's doing, what it did before, and how much room it has left**.

Switch tasks halfway through a session and Agent Badge notices: the new task takes the top line and the old one moves to an "earlier" trail, so you always know what this session has already worked on, even after hours away or a dozen tabs later.

```
 ▄██▄▄██▄  Fuzzy Koala  CODING AGENT
 ████████  ▸ Fix login redirect bug          ◜◝ Context        ◜◝ 5-hour limit   ◜◝ Weekly limit    Spent
 ████████  ↳ earlier: Set up CI              ◟◞ 38% used       ◟◞ 12% used       ◟◞ 92% used        $2.14
  ▀▀  ▀▀   Opus 5.5 · ~/site                    124k left         resets in 2h 10m  resets in 3d 4h  this session
```

## Features

- **Never lose track of a session's history.** Every time you switch context mid-session, Agent Badge spots it and keeps a trail of what the session worked on before (the last three tasks), right under the current one. Follow-ups, refinements and "thanks" don't count as switches, so the trail stays clean. Labels are saved per session, so `claude --resume` brings the trail back too.
- **A critter per session.** Each session gets its own procedurally generated 16×16 pixel-art creature and name (e.g. "Fuzzy Koala"), seeded from the session id, so a resumed session keeps the same one. It breathes and blinks when idle, and bounces and looks around while Claude is working.
- **Role and current task.** After each prompt you type, a small Haiku call labels the session's role (coding agent, copywriter, media editor, researcher…) and what it's working on now.
- **Model and folder** of the session.
- **Gauges.** Ring charts for the context window and, on subscription plans, the 5-hour and weekly usage limits, each with plain-language detail ("124k left", "resets in 2h 10m"), plus the session's spend. They switch to your theme's warning colour at 75% and alert colour at 90%.
- **Responsive.** Rings on wide terminals, slim bars on narrower ones, gauges hidden when space is tight.

## Requirements

- Claude Code **2.1.289 or newer**. Agent Badge is built on Claude Code's function-hooks plugin API, which is in early access and may change between releases.
- A terminal with the kitty graphics protocol (Ghostty, kitty) for the image avatar and ring gauges. Other terminals show text in their place. The desktop app gets bars and a text critter.

## Install

```
/plugin marketplace add GlacierHubAB/agent-badge
/plugin install agent-badge@agent-badge
```

Or load it from a local clone:

```
claude --plugin-dir /path/to/agent-badge
```

Collapse the band any time with `[-]` or `Ctrl+X` `Ctrl+A`.

## Theming

Colours are read from an [Omarchy](https://omarchy.org) theme at `~/.local/state/omarchy/current/theme/colors.toml` when present, and refresh when you switch themes. Only the theme's real hues are used for critters (greys are skipped), topped up from a built-in set of twelve soft colours so that at least ten are available and sessions stay easy to tell apart, even on a monochrome theme.

The critter's colour is picked by the session id. When [Den](https://github.com/GlacierHubAB/den) is running it hands out colours so that no two live sessions share one, and records them in `~/.local/state/den/colors.json`; the badge follows that file when it has an entry for the session.

## Hooks

Agent Badge hooks these Claude Code events. None of them changes what passes through; each passes its input on unchanged.

| Event | What it does |
| --- | --- |
| `prompt.submit` | Reads the text of a prompt **you typed** (not slash commands, not prompts from plugins or other agents) and queues it for role and task labelling. The prompt itself is passed on untouched, and labelling runs afterwards, so your prompt is never delayed. |
| `session.start` | Restores the session's saved labels, reads the model, folder, theme and usage, and starts the refresh and animation timers. |
| `session.measure` | Picks up new context, usage-limit and cost figures after each turn. |
| `turn.start` / `turn.complete` | Switches the critter between its idle and working animations, and refreshes the model shown. |
| `ui.render` (`AbovePrompt`) | Draws the band. It yields to Claude Code's own surveys and to subagent views. |

## Sharing with other tools

Agent Badge keeps two records per session in Claude Code's local plugin store: `badge:<session id>` (role, task, earlier tasks) and `usage:<session id>` (context, rate limits and spend, the same figures the gauges show). Other tools on the machine can read them to show the same identity; [Den](https://github.com/GlacierHubAB/den) does.

## Privacy and cost

To label the role and task, the text of each prompt you type (up to 4,000 characters), the current role and task, and the earlier tasks are sent to Claude Haiku through your own Claude Code session. That's one small request per prompt, billed like any other Claude Code usage. Slash commands are skipped. Nothing is sent anywhere else. The labels are stored in Claude Code's local plugin store so resumed sessions keep them. The full policy is in [PRIVACY.md](PRIVACY.md).

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT

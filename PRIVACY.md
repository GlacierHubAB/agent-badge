# Agent Badge privacy policy

Agent Badge runs entirely inside your Claude Code session. It has no server, no analytics and no telemetry, and its authors receive nothing.

## What it sends, and where

To label the session's role and current task, each prompt **you type** is sent to Claude Haiku **through your own Claude Code session**. Slash commands, and prompts from plugins or other agents, are skipped. Each request contains:

- the prompt's text, cut to its first 4,000 characters
- the session's current role and task labels
- up to three earlier task labels

That request goes to the same Claude API your session already uses, under your own account and its terms, and is billed like any other Claude Code usage. Agent Badge sends nothing anywhere else.

## What it reads

- The session's model, working folder, context usage, usage-limit figures and cost, from Claude Code.
- Your `HOME` environment variable, used only to show the folder as `~/…` and to locate the theme file below.
- `~/.local/state/omarchy/current/theme/colors.toml`, if present, for its colours.

## What it stores

The role, current task and earlier tasks for each session, in Claude Code's local plugin store on your machine, so a resumed session keeps its labels. Nothing is stored anywhere else. Uninstalling the plugin stops all of the above.

## Contact

Questions and issues: https://github.com/GlacierHubAB/agent-badge/issues

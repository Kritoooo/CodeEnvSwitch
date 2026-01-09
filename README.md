# code-env-switch

A tiny CLI to switch between Claude Code and Codex environment variables.

[中文说明](README_zh.md)

## Features

- Manage multiple profiles and switch by name or type
- `codenv use` prints shell commands for the current terminal
- Interactive profile creation and selection
- Optional cleanup via `removeFiles` and post-switch `commands`
- Config auto-discovery and type-based default `unset` keys

## Quick start

1) Install:

```bash
npm install -g @praeviso/code-env-switch
```

2) Add profiles interactively (this creates `~/.config/code-env/config.json` if missing):

```bash
codenv add
# run it again to add the second type
codenv add
```

Example session:

```text
$ codenv add
Select type (1=codex, 2=claude): 1
Profile name (default: default): primary
Base URL (required): https://api.example.com/v1
API key (required): YOUR_API_KEY
```

3) Set defaults per type:

```bash
codenv default codex primary
codenv default claude default
```

4) Enable auto-apply in your shell:

```bash
codenv init
```

Open a new terminal (or `source ~/.bashrc` / `source ~/.zshrc`) to auto-apply the defaults.

For local development install:

```bash
npm install -g .
# or
npm link
```

## Usage

> By default, `codenv use` only outputs shell commands. After running
> `codenv init`, the shell wrapper applies them automatically.
> The snippet also wraps `codex`/`claude` to bind sessions to profiles; use
> `command codex` / `command claude` to bypass.

### Common commands

```bash
codenv list
codenv show codex primary
codenv default codex primary
codenv remove codex primary
```

`codenv list` (or `codenv ls`) prints a table with `PROFILE`, `TYPE`, and `NOTE`. Default profiles are labeled in the `NOTE` column, and the active profile is shown in green.
If `profile.name` is set, it is shown in `PROFILE`. Otherwise the profile key is shown (with legacy `type-` prefixes stripped when possible).

### Add / update a profile

```bash
codenv add primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "Primary endpoint"
# with explicit type (codex/claude, claude also accepts cc)
codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

When `--type` is set, the profile name is kept as-is and `type` is stored separately.
Profiles are keyed by an internal id; the human-facing name lives in `profile.name`.

Interactive add (default):

```bash
codenv add
```

### Remove a profile

```bash
codenv remove primary
# or by type + name (recommended when names overlap)
codenv remove codex primary
# multiple at once
codenv remove codex primary claude default
# (legacy keys like codex-primary also work)
codenv remove codex-primary claude-default
# remove all
codenv remove --all
```

### Switch in the current shell (bash/zsh)

```bash
codenv use
# use up/down then Enter (q to exit)
codenv use primary
# or by type + name (also matches legacy keys like codex-primary)
codenv use codex primary
codenv use cc primary
```

First run `codenv init` once to install the shell wrapper:

```bash
codenv init
# or target a specific shell
codenv init --shell zsh
```

This wrapper makes `codenv use` and `codenv unset` apply automatically in the
current shell. To print the snippet without writing to rc, use
`codenv init --print`.

### Auto-apply default profiles (per type)

Set a default per type (codex/claude) and re-run `codenv init`:

```bash
codenv default codex primary
codenv default claude default
```

```json
{
  "defaultProfiles": {
    "codex": "primary",
    "claude": "default"
  }
}
```

On new terminal sessions, `codenv` will auto-apply all defaults via `codenv auto`.
To clear all defaults, run `codenv default --clear` (with confirmation).

One-off without init:

```bash
eval "$(codenv use codex primary)"
```

Note: the change takes effect in new terminals. To apply immediately, run:

```bash
source ~/.bashrc
# or for zsh
source ~/.zshrc
```

### Unset known keys

```bash
codenv unset
# or one-off without init
eval "$(codenv unset)"
```

### Fish shell

```fish
codenv use codex primary
# or one-off without init
codenv use codex primary | source
```

## Config lookup order

`codenv` searches in this order:

1) `--config <path>`
2) `CODE_ENV_CONFIG`
3) `~/.config/code-env/config.json`

Use `codenv config` to print the path selected for the current directory.

If nothing is found, `codenv add` writes to `~/.config/code-env/config.json`.

## Config format

```json
{
  "unset": [],
  "defaultProfiles": {
    "codex": "primary",
    "claude": "default"
  },
  "codexStatusline": {
    "command": ["codenv", "statusline", "--type", "codex", "--sync-usage"],
    "showHints": false,
    "updateIntervalMs": 300,
    "timeoutMs": 1000
  },
  "claudeStatusline": {
    "command": "codenv statusline --type claude --sync-usage",
    "type": "command",
    "padding": 0
  },
  "profiles": {
    "p_a1b2c3": {
      "name": "primary",
      "type": "codex",
      "note": "Primary endpoint",
      "env": {
        "OPENAI_BASE_URL": "https://api.example.com/v1",
        "OPENAI_API_KEY": "YOUR_API_KEY"
      },
      "removeFiles": ["$HOME/.config/example/auth.json"],
      "commands": ["echo \"Switched to codex primary\""]
    }
  }
}
```

Notes:
- `unset`: global keys to clear. Type-specific defaults are applied only for the active type and won't clear the other type.
- `defaultProfiles`: optional; map of `codex`/`claude` to profile name or key used by `codenv auto`.
- `codexStatusline`: optional; config to inject Codex TUI status line settings when launching `codex`.
  - `command`: string or string[]; command passed to Codex `tui.status_line.command`.
  - `showHints`: boolean; whether Codex footer hints are appended when the status line is active.
  - `updateIntervalMs`: number; update interval in ms for the status line command.
  - `timeoutMs`: number; timeout in ms for the status line command.
  - `configPath`: optional; override `~/.codex/config.toml` (also supports `CODE_ENV_CODEX_CONFIG_PATH`).
- `claudeStatusline`: optional; config to inject Claude Code statusLine settings when launching `claude`.
  - `command`: string (or string[]; arrays are joined into a single command string).
  - `type`: string; statusLine type (default: `command`).
  - `padding`: number; statusLine padding (default: 0).
  - `settingsPath`: optional; override `~/.claude/settings.json` (also supports `CODE_ENV_CLAUDE_SETTINGS_PATH`).
- `name`: human-facing profile name shown in `codenv list` and used by `codenv use <name>`.
- `type`: optional; `codex` or `claude` (alias `cc`) for `codenv use <type> <name>` matching.
- `note`: shown in `codenv list`.
- `removeFiles`: optional; `codenv use` emits `rm -f` for each path. Codex profiles also remove `~/.codex/auth.json`.
- `ANTHROPIC_AUTH_TOKEN`: when `ANTHROPIC_API_KEY` is set, `codenv use` also exports `ANTHROPIC_AUTH_TOKEN` with the same value.
- `commands`: optional; emitted as-is in the switch script.

## Security

Your config contains API keys. Keep it private and out of public repositories.

## Development

```bash
npm install
npm run build
```

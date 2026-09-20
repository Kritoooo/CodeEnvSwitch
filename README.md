# code-env-switch

A tiny CLI to switch between Claude Code and Codex profiles.

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
> When you switch profiles within the same session, usage tracking and cost
> display follow the most recently applied profile for subsequent tokens.

### Common commands

```bash
codenv list
codenv show codex primary
codenv default codex primary
codenv remove codex primary
```

`codenv list` (or `codenv ls`) prints a table with `PROFILE`, `TYPE`, and `NOTE`. Default profiles are labeled in the `NOTE` column, and the active profile is shown in green.
If `profile.name` is set, it is shown in `PROFILE`. Otherwise the profile key is shown (with legacy `type-` prefixes stripped when possible).

### Reset usage history

```bash
codenv usage-reset
# skip confirmation
codenv usage-reset --yes
```

This deletes usage history files (`usage.jsonl`, usage state, `profile-log.jsonl`, `statusline-debug.jsonl`) plus any backup variants in the config directory.

### Add / update a profile

```bash
codenv add primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "Primary endpoint"
# with explicit type (codex/claude, claude also accepts cc)
codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

When `--type` is set, the profile name is kept as-is and `type` is stored separately.
Profiles are keyed by an internal id; the human-facing name lives in `profile.name`.

Codex profiles store `OPENAI_BASE_URL` and `OPENAI_API_KEY` in the JSON config.
When a Codex profile is applied, `codenv` unsets those shell variables, points
`model_provider` in `~/.codex/config.toml` at a codenv-managed block, and writes
the key into the profile's own credential file (see Login profiles below).
Everything else in `config.toml` is left alone.

### Browsing and editing profiles

```bash
codenv         # profile browser: apply, edit, create, delete
codenv add     # jump straight to a blank profile form
```

`codenv use` with no arguments opens the same browser.

```
↑↓ move   Enter apply   e edit   n new   d delete   / filter   q quit
```

The editor is the only place that can remove an env key or drop a
`removeFiles` / `commands` entry — the `add` flags can add and overwrite, but
never delete. It also shows what an auth switch will do to the profile's stored
credential before you save.

Outside a TTY `codenv` prints help as before, and `codenv use <name>` plus the
`add` flags remain the scriptable path.

Applying a profile has to reach the current shell, so the browser only enables
it when invoked through the shell helper. **Upgrading from 0.2.x requires
re-running `codenv init`** so that a bare `codenv` is sourced; until then the
browser still opens, but tells you apply is unavailable.

### Login profiles and multiple accounts

Every profile owns its own credentials. They live under the config directory:

```
~/.config/code-env/accounts/<type>/<profileKey>/
```

The tool's own credential path (`~/.codex/auth.json`,
`~/.claude/.credentials.json`) becomes a symlink into the active profile's
directory, so a token refresh written by codex or Claude Code lands in that
profile's file and nothing is ever copied over another account's credentials.

```bash
codenv add --login --type codex work
codenv login codex work          # runs `codex login` for this profile
codenv add --login --type codex personal
codenv login codex personal      # a second, independent account
codenv use codex work            # switch between them freely
```

API profiles are isolated the same way: their credential file is derived from
the profile's configured key, so an API profile never sees an account login and
a login profile never sees an API key. This is the difference from earlier
versions, where both lived in the same `auth.json` and switching restored a
snapshot that could roll a refreshed token back.

`codenv list` shows which account each login profile currently holds, or
`not signed in` when its vault is still empty.

### Migrating from 0.1.x

Run this once. It moves the credential already on disk into the profile it
belongs to and removes the old provider backup file:

```bash
codenv migrate --dry-run   # print the plan, change nothing
codenv migrate
```

Attribution is automatic when a type has exactly one login profile, which is
all 0.1.x could represent on disk. With several, name the owner:

```bash
codenv migrate codex --login work
```

The other login profiles were aliases for that same account, so they start
empty — run `codenv login <type> <name>` for each to turn it into a real,
separate account. A copy of everything the migration overwrites is kept under
`accounts/migrate-backup-<timestamp>/` and is never deleted automatically.

Until you migrate, `codenv use` refuses to touch an existing credential file
rather than risk destroying a login. To capture it into a specific profile
yourself, use `codenv adopt <type> <name>`.

Note: if a tool writes its credential file by replacing it (tmp + rename)
instead of writing through the symlink, codenv detects that on the next
switch, files the orphaned credential back under the profile it belonged to,
and falls back to copying the file in and out. Nothing is lost; only the
live-refresh behaviour changes. macOS Claude Code stores OAuth credentials in
the Keychain rather than `.credentials.json`, where this layout does not apply.

Interactive `codenv add` asks `Select auth (1=API key, 2=account login)` and
skips the Base URL / API key prompts for login profiles.

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

For Codex profiles, the generated shell snippet keeps reading the legacy
`OPENAI_*` values from your `codenv` profile, but the applied runtime state now
comes from `~/.codex/config.toml` and `~/.codex/auth.json` instead of exported
`OPENAI_BASE_URL` / `OPENAI_API_KEY` variables.

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

For Codex, `codenv unset` also restores the previous `~/.codex/config.toml` and
`~/.codex/auth.json` state captured before the last `codenv`-managed switch.

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
    "items": ["model-with-reasoning", "context-remaining", "current-dir", "git-branch"]
  },
  "claudeStatusline": {
    "command": "codenv statusline --type claude --sync-usage",
    "type": "command",
    "padding": 0
  },
  "pricing": {
    "models": {
      "Claude Sonnet 4.5": {
        "input": 3.0,
        "output": 15.0,
        "cacheWrite": 3.75,
        "cacheRead": 0.3,
        "description": "Balanced performance and speed for daily use."
      }
    }
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
- `codexStatusline`: optional; config to inject official Codex TUI status line settings when launching `codex`.
  - `items`: string[]; ordered item IDs written to `tui.status_line` in `~/.codex/config.toml`.
  - Supported item IDs include: `model-name`, `model-with-reasoning`, `current-dir`, `project-root`, `git-branch`, `context-remaining`, `context-used`, `five-hour-limit`, `weekly-limit`, `codex-version`, `context-window-size`, `used-tokens`, `total-input-tokens`, `total-output-tokens`, `session-id`.
  - `configPath`: optional; override `~/.codex/config.toml` (also supports `CODE_ENV_CODEX_CONFIG_PATH`).
  - If `items` is unset, `codenv` leaves Codex status-line config unchanged (Codex defaults apply).
- `claudeStatusline`: optional; config to inject Claude Code statusLine settings when launching `claude`.
  - `command`: string (or string[]; arrays are joined into a single command string).
  - `type`: string; statusLine type (default: `command`).
  - `padding`: number; statusLine padding (default: 0).
  - `settingsPath`: optional; override `~/.claude/settings.json` (also supports `CODE_ENV_CLAUDE_SETTINGS_PATH`).
- `pricing`: optional; model pricing (USD per 1M tokens) used to convert token usage to dollar amounts in the status line.
  - `models`: map of model name to pricing. Keys are matched case/format-insensitively.
  - `input`/`output`/`cacheRead`/`cacheWrite`: token rates.
  - Cost display uses the profile pricing model if set; otherwise the status line model label. No breakdown => no cost.
- `name`: human-facing profile name shown in `codenv list` and used by `codenv use <name>`.
- `type`: optional; `codex` or `claude` (alias `cc`) for `codenv use <type> <name>` matching.
- `note`: shown in `codenv list`.
- `removeFiles`: optional; `codenv use` emits `rm -f` for each path. Codex profiles also remove `~/.codex/auth.json`.
- `pricing` (profile): optional; per-profile pricing override. Supports `model` plus `input`/`output`/`cacheRead`/`cacheWrite`.
  - `multiplier`: optional; scale pricing (number).
- `ANTHROPIC_AUTH_TOKEN`: when `ANTHROPIC_API_KEY` is set, `codenv use` also exports `ANTHROPIC_AUTH_TOKEN` with the same value.
- `commands`: optional; emitted as-is in the switch script.

## Security

Your config contains API keys. Keep it private and out of public repositories.

## Development

```bash
npm install
npm run build
```

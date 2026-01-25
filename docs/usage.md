# Usage tracking

Usage stats are derived from two sources (statusline input + session logs) and appended to `usage.jsonl`.

## Files and paths

- `usage.jsonl`: JSONL records with `ts`, `type`, `profileKey`/`profileName`, `model`, `sessionId`, and token breakdowns.
- `usage.jsonl.state.json`: per-session totals + per-session-file metadata (mtime/size) used to compute deltas and avoid double counting.
- `profile-log.jsonl`: profile usage + session binding log (`use` and `session` events).
- `statusline-debug.jsonl`: optional debug capture when `CODE_ENV_STATUSLINE_DEBUG` is enabled.
- Paths can be overridden via `usagePath`, `usageStatePath`, `profileLogPath`, `codexSessionsPath`, `claudeSessionsPath`.

## Session binding (profile -> session)

- `codenv init` installs a shell wrapper so `codex`/`claude` run via `codenv launch`.
- `codenv launch` logs profile usage and then finds the latest unbound session file (prefers matching `cwd`, within a small grace window) and records the binding in `profile-log.jsonl`.
- Sync uses these bindings to attribute session usage to a profile.

## Statusline sync (`codenv statusline --sync-usage`)

- Requires `sessionId`, model, and a profile (`profileKey` or `profileName`) to write usage.
- Reads stdin JSON for totals and computes a delta against the last stored totals in the state file.
- If totals decrease (session reset), the current totals are treated as fresh usage; otherwise negative sub-deltas are clamped to zero.
- If the token breakdown exceeds the reported total, the breakdown sum wins.
- Appends a delta record to `usage.jsonl` and updates the per-session totals in the state file.

## Session log sync (`--sync-usage` and `codenv list`)

- Scans Codex sessions under `CODEX_HOME/sessions` (or `~/.codex/sessions`) and Claude sessions under `CLAUDE_HOME/projects` (or `~/.claude/projects`).
- Codex: parses `event_msg` token_count records and uses max totals; cached input is recorded as cache read and subtracted from input when possible.
- Claude: sums `message.usage` input/output/cache tokens across the file.
- Deltas are computed against prior file metadata and per-session maxima in the state file; files without a resolved binding are skipped.

## Daily totals

- "Today" is computed in local time between 00:00 and the next 00:00.

## Cost calculation

- Uses pricing from the profile (or `pricing.models`, plus defaults) and requires token splits; if splits are missing, cost is omitted.

## Examples

### `usage.jsonl` record

Each line is a JSON object (fields may be null/omitted depending on the source):

```json
{"ts":"2026-01-25T12:34:56.789Z","type":"codex","profileKey":"p_a1b2c3","profileName":"primary","model":"gpt-5.1-codex","sessionId":"a6f9c4d8-1234-5678-9abc-def012345678","inputTokens":1200,"outputTokens":300,"cacheReadTokens":200,"cacheWriteTokens":0,"totalTokens":1700}
```

`totalTokens` is the max of the reported total and the breakdown sum, so it can be >= input + output + cache.

## Statusline input examples (Codex/Claude)

To see real payloads, set `CODE_ENV_STATUSLINE_DEBUG=1` and read the JSONL entries in
`statusline-debug.jsonl` (or the path from `CODE_ENV_STATUSLINE_DEBUG_PATH`).

### Codex (token_usage totals)

```json
{
  "type": "codex",
  "session_id": "a6f9c4d8-1234-5678-9abc-def012345678",
  "profile": { "key": "p_a1b2c3", "name": "primary", "type": "codex" },
  "model": "gpt-5.1-codex",
  "token_usage": {
    "total_token_usage": {
      "input_tokens": 1200,
      "output_tokens": 300,
      "cached_input_tokens": 200,
      "cache_creation_input_tokens": 50,
      "total_tokens": 1750
    },
    "last_token_usage": {
      "input_tokens": 100,
      "output_tokens": 20,
      "cached_input_tokens": 10,
      "cache_creation_input_tokens": 0,
      "total_tokens": 130
    }
  }
}
```

Accepted aliases (non-exhaustive):
- `token_usage.total_token_usage` or `token_usage.totalTokenUsage`
- `last_token_usage` or `lastTokenUsage`
- `input_tokens` / `inputTokens` / `input`
- `output_tokens` / `outputTokens` / `output` / `reasoning_output_tokens`
- `cached_input_tokens` / `cache_read_input_tokens`
- `cache_creation_input_tokens` / `cache_write_input_tokens`
- `total_tokens` / `totalTokens` / `total`

`token_usage` can also be a number, or the payload can provide `usage` directly.

### Claude (context_window totals)

```json
{
  "type": "claude",
  "session_id": "1f2e3d4c-5678-90ab-cdef-1234567890ab",
  "profile": { "key": "p_c3d4e5", "name": "default", "type": "claude" },
  "model": { "display_name": "Claude Sonnet 4.5" },
  "context_window": {
    "total_input_tokens": 800,
    "total_output_tokens": 250,
    "current_usage": {
      "cache_read_input_tokens": 100,
      "cache_creation_input_tokens": 40
    },
    "context_window_size": 200000
  }
}
```

Accepted aliases (non-exhaustive):
- `context_window` or `contextWindow`
- `current_usage` or `currentUsage`
- `total_input_tokens` / `totalInputTokens`
- `total_output_tokens` / `totalOutputTokens`
- `cache_read_input_tokens` / `cacheReadInputTokens`
- `cache_creation_input_tokens` / `cacheWriteInputTokens`

`usage` can also be provided directly with `todayTokens` / `totalTokens` / `inputTokens` /
`outputTokens` / `cacheReadTokens` / `cacheWriteTokens`.

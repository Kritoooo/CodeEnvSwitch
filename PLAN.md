# Statusline Plan (Simplified)

## Goals
- Provide a host-agnostic statusline outputter for Codex CLI and Claude Code.
- Show Git status, model label, and usage in a single line.
- Auto-enable a bottom statusline when launching via `codenv`.

## Done (implemented)
- `codenv statusline` outputs text/JSON with Git + model + usage.
- ANSI bottom-bar renderer added with forced redraw support (for Codex UI repaint).
- `codenv launch codex` auto-starts the renderer.
- `codenv launch claude` ensures `.claude/settings.json` uses a `statusLine` command object.
- Env knobs added for enable/disable, interval, offset/reserve, and force redraw.

## Next plan (overall)
### Phase 1 — Stabilize behavior
- Verify Codex overlay behavior across terminals; tune default interval/offset as needed.
- Add a simple “compatibility fallback” note for terminals that don’t support scroll regions.
- Confirm Claude statusLine object format across versions (no string form).

### Phase 2 — Data quality
- Optional: resolve model from session logs if not provided by env/stdin.
- Clarify usage sync strategy (per-session vs aggregate) and align with `src/usage/`.

### Phase 3 — Integrations & ergonomics
- Provide generic wrapper example for other CLIs (stdin JSON contract).
- Optional tmux statusline snippet as alternative for Codex.
- Add minimal config knobs to `code-env.example.json` if needed.

### Phase 4 — QA & polish
- Manual test checklist (bash/zsh/fish, macOS/Linux).
- Performance check target (<50ms typical render).
- Harden error handling and safe fallbacks.

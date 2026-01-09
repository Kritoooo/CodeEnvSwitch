# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds TypeScript sources. Key areas: `src/cli/` argument parsing, `src/commands/` CLI actions, `src/config/` config IO, `src/profile/` profile resolution, `src/shell/` shell integration, `src/ui/` prompts, `src/usage/` logging.
- `bin/` contains compiled JavaScript from `tsc`; treat it as generated output.
- `code-env.example.json` is the public config template; `README.md` and `README_zh.md` are user docs.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run build` compiles `src/` to `bin/` using `tsconfig.json`.
- `npm run lint` runs ESLint; `npm run lint:fix` auto-fixes.
- `npm link` (or `npm install -g .`) installs the CLI locally for manual testing.
- No automated test script is configured yet.

## Coding Style & Naming Conventions
- Follow existing formatting: 4-space indentation, double quotes, and semicolons.
- Use `camelCase` for variables/functions and `PascalCase` for types/interfaces.
- CLI commands are single verbs (`add`, `use`, `unset`); flags are `--kebab-case` (e.g., `--config`, `--shell`).
- Keep changes ESLint-clean.

## Testing Guidelines
- There is no test framework configured. If you add tests, also add a `npm test` script and document the framework in `README.md`.
- Prefer a top-level `tests/` folder or `src/**/__tests__` for discoverable structure.

## Commit & Pull Request Guidelines
- Git history shows Conventional Commit-style prefixes (e.g., `feat:`) plus simple descriptive messages; release commits use version numbers like `0.1.1`.
- Use short, imperative subjects and include a brief body for non-trivial changes.
- PRs should include: summary, rationale, manual test commands run (e.g., `npm run build`, `codenv use`), and any config or shell-rc impacts; link related issues.

## Configuration & Security Notes
- Config is loaded via `--config`, `CODE_ENV_CONFIG`, or `~/.config/code-env/config.json`; use `code-env.example.json` for sanitized examples.
- Never commit real API keys or user-specific config.

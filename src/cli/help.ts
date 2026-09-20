/**
 * Help message for codenv CLI
 */

export function printHelp(): void {
    const msg = `codenv - switch Claude/Codex profiles

Usage:
  codenv list
  codenv ls
  codenv config
  codenv auto
  codenv use
  codenv use <profile>
  codenv use <type> <name>
  codenv show <profile>
  codenv show <type> <name>
  codenv default <profile>
  codenv default <type> <name>
  codenv default --clear
  codenv remove <profile> [<profile> ...]
  codenv remove <type> <name> [<type> <name> ...]
  codenv remove --all
  codenv unset
  codenv add <profile> KEY=VALUE [KEY=VALUE ...]
  codenv add
  codenv launch <codex|claude> [--] [args...]
  codenv login <codex|claude> <name>
  codenv adopt <codex|claude> <name>
  codenv migrate [<type>] [--login <name>] [--dry-run] [--yes]
  codenv init
  codenv statusline [options]
  codenv usage-reset [--yes]

Accounts:
  Each profile owns its credentials under <config dir>/accounts/<type>/<key>/.
  The tool's own credential path becomes a symlink into it, so switching never
  copies one account's tokens over another's. Run \`codenv migrate\` once to move
  pre-0.2 state into that layout.

Options:
  -c, --config <path>   Path to config JSON
  -h, --help            Show help

Init options:
  --apply                 Append shell helper to your shell rc (default)
  --print                 Print helper snippet to stdout
  --shell <bash|zsh|fish> Explicitly set the target shell

Add options:
  -t, --type <codex|claude>   Set profile type (alias: cc)
  -l, --login                 Give the profile its own account login instead
                              of an API key (requires --type); sign in with
                              \`codenv login <type> <name>\`
  -n, --note <text>           Set profile note
  -r, --remove-file <path>    Add a removeFiles entry (repeat)
  -x, --command <cmd>         Add a commands entry (repeat)
  -u, --unset <KEY>           Add a global unset key (repeat)

Statusline options:
  --format <text|json>        Output format (default: text)
  --cwd <path>                Override working directory
  --type <type>               Set profile type
  --profile-key <key>         Set profile key
  --profile-name <name>       Set profile name
  --model <model>             Set model label
  --usage-today <n>           Set today's token usage
  --usage-total <n>           Set total token usage
  --usage-input <n>           Set input token usage
  --usage-output <n>          Set output token usage
  --sync-usage                Sync usage from sessions before reading

Migrate options:
  --login <name>              Profile that owns the existing account login
                              (only needed when a type has several login profiles)
  -d, --dry-run               Print the plan without changing anything
  -y, --yes                   Skip confirmation prompt

Usage reset options:
  -y, --yes                   Skip confirmation prompt

Examples:
  codenv init
  codenv use codex primary
  codenv list
  codenv default codex primary
  codenv remove codex primary
  codenv remove codex primary claude default
  codenv remove --all
  codenv launch codex -- --help
  codenv statusline --format json
  codenv usage-reset --yes
  CODE_ENV_CONFIG=~/.config/code-env/config.json codenv use claude default
  codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY
  codenv add --login --type claude personal
  codenv login codex work
  codenv adopt codex work
  codenv migrate --dry-run
  codenv add
`;
    console.log(msg);
}

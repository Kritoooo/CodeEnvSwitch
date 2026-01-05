# code-env-switch

A tiny CLI to switch between Claude Code and Codex environment variables.

## Setup

1) Copy the example config and fill in your keys:

```bash
cp code-env.example.json code-env.json
```

2) Install from npm (after publish) or locally:

```bash
npm install -g code-env-switch
# or local dev
npm install -g .
# or
npm link
```

## 使用方法

`codenv use` 会输出一段 shell 命令，需在当前 shell 里执行，环境变量才会生效。

1) 准备配置文件（或用环境变量指定）：

```bash
cp code-env.example.json code-env.json
# 或者
export CODE_ENV_CONFIG=/path/to/code-env.json
```

2) 添加/更新 profile：

```bash
codenv add codex-88 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "OpenAI official"
# 交互式添加（选择 codex/claude，再输入 Base URL 和 API key）
codenv add --interactive
# 指定 type（codex/claude，claude 也可写 cc）
codenv add --type codex 88 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

3) 在当前 shell 中切换并生效（bash/zsh）：

```bash
eval "$(codenv use codex-88)"
# 或按类型 + 名称切换（会匹配 type 或形如 codex-88 的 profile）
eval "$(codenv use codex 88)"
eval "$(codenv use cc 88)"
```

4) 查看与列出：

```bash
codenv list
codenv show codex-88
```

5) 清理所有已知键：

```bash
eval "$(codenv unset)"
```

## Usage

List profiles:

```bash
codenv list
```

Add or update a profile from the CLI:

```bash
codenv add codex-88 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "OpenAI official"
# with explicit type
codenv add --type codex 88 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

Interactive add (choose codex/claude, then enter Base URL and API key):

```bash
codenv add --interactive
```

Switch in the current shell (bash/zsh):

```bash
eval "$(codenv use codex-88)"
# or by type + name
eval "$(codenv use codex 88)"
eval "$(codenv use cc 88)"
```

Unset all known keys:

```bash
eval "$(codenv unset)"
```

### Config lookup order

`codenv` searches in this order:

1) `--config <path>`
2) `CODE_ENV_CONFIG`
3) `./code-env.json`
4) `./profiles.json`
5) `./code-env.config.json`
6) `~/.config/code-env/config.json`

## Config format

```json
{
  "unset": ["OPENAI_BASE_URL", "OPENAI_API_KEY", "CODEX_PROVIDER", "ANTHROPIC_API_KEY", "CLAUDE_CODE_BASE_URL"],
  "profiles": {
    "codex-88": {
      "type": "codex",
      "note": "OpenAI official",
      "env": {
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_API_KEY": "YOUR_API_KEY",
        "CODEX_PROVIDER": "OpenAI"
      },
      "removeFiles": ["$HOME/.config/openai/auth.json"],
      "commands": ["echo \"Switched to codex-88\""]
    }
  }
}
```

Notes:
- `removeFiles` is optional; when present, `codenv use <profile>` emits `rm -f` lines for those paths.
- `commands` is optional; any strings are emitted as-is.
- `note` is shown in `codenv list` output.
- `type` is optional; set to `codex` or `claude` (alias: `cc`) so you can use `codenv use <type> <name>`.
- `codenv add` creates the config file if it does not exist (default: `./code-env.json`).

## Fish shell

```fish
codenv use codex-88 | source
```

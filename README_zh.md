# code-env-switch

一个轻量的 CLI，用于在 Claude Code 与 Codex 的环境变量之间快速切换。

[English](README.md)

## 特性

- 多 profile 管理，按名称或类型切换
- `codenv use` 输出可执行的 shell 命令，方便在当前终端生效
- 支持交互式添加与选择 profile
- 支持 `removeFiles` 与 `commands` 做清理与自动化
- 配置文件自动发现与按类型自动补充 `unset` 键

## 快速开始

1) 安装：

```bash
npm install -g @praeviso/code-env-switch
```

2) 交互式添加 profile（若不存在会创建 `~/.config/code-env/config.json`）：

```bash
codenv add
# 再执行一次，用来添加另一种 type
codenv add
```

交互示例：

```text
$ codenv add
Select type (1=codex, 2=claude): 1
Profile name (default: default): primary
Base URL (required): https://api.example.com/v1
API key (required): YOUR_API_KEY
```

3) 按 type 设置默认项：

```bash
codenv default codex primary
codenv default claude default
```

4) 启用自动应用：

```bash
codenv init
```

新开终端（或执行 `source ~/.bashrc` / `source ~/.zshrc`）即可自动应用默认配置。

本地开发可用：

```bash
npm install -g .
# 或
npm link
```

## 使用方法

> 默认情况下，`codenv use` 仅输出 shell 命令；执行 `codenv init` 后，
> shell 包装函数会自动在当前终端生效。
> 该片段还会包装 `codex`/`claude` 以绑定会话到 profile；如需绕过，
> 可使用 `command codex` / `command claude`。

### 常用命令

```bash
codenv list
codenv show codex primary
codenv default codex primary
codenv remove codex primary
```

`codenv list`（或 `codenv ls`）会输出 `PROFILE` / `TYPE` / `NOTE` 的表格。默认项会标注在 `NOTE` 列，当前激活的配置会用绿色显示。
如果设置了 `profile.name`，`PROFILE` 列会显示该名称；否则显示 profile 的 key（会尽量去掉旧的 `type-` 前缀）。

### 添加 / 更新 profile

```bash
codenv add primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "Primary endpoint"
# 指定 type（codex/claude，claude 也可写 cc）
codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

当设置 `--type` 时，名称保持不变，`type` 会单独存储。
profiles 使用内部 key，展示名称存放在 `profile.name`。

交互式添加（默认）：

```bash
codenv add
```

### 删除 profile

```bash
codenv remove primary
# 或按类型 + 名称（名称重复时推荐）
codenv remove codex primary
# 一次删多个
codenv remove codex primary claude default
# （也兼容形如 codex-primary 的旧 key）
codenv remove codex-primary claude-default
# 全部删除
codenv remove --all
```

### 切换并生效（bash/zsh）

```bash
codenv use
# 上下选择，回车确认（q 退出）
codenv use primary
# 或按类型 + 名称匹配（也兼容形如 codex-primary 的旧 key）
codenv use codex primary
codenv use cc primary
```

先执行一次 `codenv init` 安装 shell 包装函数：

```bash
codenv init
# 或指定 shell
codenv init --shell zsh
```

该包装函数会让 `codenv use` 和 `codenv unset` 在当前终端自动生效。
如果只想打印片段而不写入，可用 `codenv init --print`。

### 默认 profile 自动生效（按 type）

为不同 type 设置默认 profile，并重新执行一次 `codenv init`：

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

之后每次新开终端都会自动执行 `codenv auto` 应用所有默认配置。
如需清除全部默认设置，可执行 `codenv default --clear`（需确认）。

如果不想安装，可一次性执行：

```bash
eval "$(codenv use codex primary)"
```

注意：写入后对新终端生效；如需立刻生效，可执行：

```bash
source ~/.bashrc
# 或 zsh
source ~/.zshrc
```

### 清理已知键

```bash
codenv unset
# 或一次性执行
eval "$(codenv unset)"
```

### Fish shell

```fish
codenv use codex primary
# 或一次性执行
codenv use codex primary | source
```

## 配置文件查找顺序

`codenv` 按以下顺序查找：

1) `--config <path>`
2) `CODE_ENV_CONFIG`
3) `~/.config/code-env/config.json`

可用 `codenv config` 输出当前目录会使用的配置路径。

`codenv add` 在找不到配置时，会默认写入 `~/.config/code-env/config.json`。

## 配置格式

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

说明：
- `unset`：全局需要清理的环境变量。按 type 的默认清理键只会对当前 type 生效，不会影响其他 type。
- `defaultProfiles`：可选；`codex`/`claude` 对应的默认 profile 名称或 key，供 `codenv auto` 使用。
- `codexStatusline`：可选；在启动 `codex` 时写入 Codex TUI status line 配置。
  - `command`：字符串或字符串数组；写入 Codex 的 `tui.status_line.command`。
  - `showHints`：布尔值；状态栏激活时是否拼接 footer 提示。
  - `updateIntervalMs`：数字；状态栏命令的刷新间隔（毫秒）。
  - `timeoutMs`：数字；状态栏命令超时（毫秒）。
  - `configPath`：可选；覆盖 `~/.codex/config.toml`（也可用 `CODE_ENV_CODEX_CONFIG_PATH`）。
- `claudeStatusline`：可选；在启动 `claude` 时写入 Claude Code statusLine 配置。
  - `command`：字符串（或字符串数组；数组会被拼接成单个命令字符串）。
  - `type`：字符串；statusLine 类型（默认 `command`）。
  - `padding`：数字；statusLine padding（默认 0）。
  - `settingsPath`：可选；覆盖 `~/.claude/settings.json`（也可用 `CODE_ENV_CLAUDE_SETTINGS_PATH`）。
- `name`：用于展示的 profile 名称，`codenv list` 与 `codenv use <name>` 会使用它。
- `type`：可选，`codex` 或 `claude`（别名 `cc`），便于用 `codenv use <type> <name>` 匹配。
- `note`：显示在 `codenv list` 输出中。
- `removeFiles`：可选；`codenv use` 会输出对应 `rm -f`。Codex profile 还会删除 `~/.codex/auth.json`。
- `ANTHROPIC_AUTH_TOKEN`：当设置了 `ANTHROPIC_API_KEY` 时，`codenv use` 会自动以同样的值导出 `ANTHROPIC_AUTH_TOKEN`。
- `commands`：可选；原样输出到切换脚本中。

## 安全提示

配置文件包含 API key，请妥善保存并避免提交到公共仓库。

## 开发

```bash
npm install
npm run build
```

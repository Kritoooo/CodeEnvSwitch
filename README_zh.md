# code-env-switch

一个轻量的 CLI，用于在 Claude Code 与 Codex profile 之间快速切换。

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

2) 添加 profile（若不存在会创建 `~/.config/code-env/config.json`）：

```bash
codenv add
```

会直接打开新建表单：

```text
New profile

 name                  (empty)
 type                  codex   (space toggles)
 auth                  API key   (space toggles)
 OPENAI_BASE_URL       (empty)
 OPENAI_API_KEY        (empty)
 note                  (empty)

↑↓ move   Enter edit/toggle   a add   d delete   s save   q cancel
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
> 同一个 session 内切换 profile 时，后续用量与金额会跟随最新应用的
> profile 统计。

### 常用命令

```bash
codenv list
codenv show codex primary
codenv default codex primary
codenv remove codex primary
```

`codenv list`（或 `codenv ls`）会输出 `PROFILE` / `TYPE` / `NOTE` 的表格。默认项会标注在 `NOTE` 列，当前激活的配置会用绿色显示。
如果设置了 `profile.name`，`PROFILE` 列会显示该名称；否则显示 profile 的 key（会尽量去掉旧的 `type-` 前缀）。

### 清理用量历史

```bash
codenv usage-reset
# 跳过确认
codenv usage-reset --yes
```

该命令会删除用量历史文件（`usage.jsonl`、用量 state、`profile-log.jsonl`、`statusline-debug.jsonl`）以及配置目录中的相关备份文件。

### 添加 / 更新 profile

```bash
codenv add primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY --note "Primary endpoint"
# 指定 type（codex/claude，claude 也可写 cc）
codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY
```

当设置 `--type` 时，名称保持不变，`type` 会单独存储。
profiles 使用内部 key，展示名称存放在 `profile.name`。

为了兼容旧配置，Codex profile 仍然在 JSON 里保存
`OPENAI_BASE_URL` / `OPENAI_API_KEY`。但在实际应用 Codex profile 时，
`codenv` 会先清理这些 shell 变量，再把对应值写入
`~/.codex/config.toml` 中由 codenv 托管的块，并把 key 写入该 profile 自己的
凭据文件（见下方「登录 profile 与多账号」）。`config.toml` 的其余内容不会被改动。

### 浏览与编辑 profile

```bash
codenv         # profile 浏览器：应用、编辑、新建、删除
codenv add     # 直接进入空白新建表单
```

`codenv use` 不带参数会打开同一个浏览器。

```
↑↓ 移动   Enter 应用   e 编辑   n 新建   d 删除   / 过滤   q 退出
```

编辑器是唯一能**删除** env 键、删除 `removeFiles` / `commands` 条目的地方
——`add` 的参数只能新增和覆盖，删不掉。切换 auth 方式时也会在保存前提示
该 profile 已存的凭据会被如何处理。

非 TTY 环境下 `codenv` 仍按原样打印帮助；`codenv use <name>` 和 `add` 的参数
形式仍是脚本路径。

应用 profile 需要把变量注入当前 shell，所以浏览器只在通过 shell 函数调用时
才启用该操作。**从 0.2.x 升级需要重跑一次 `codenv init`**，让裸 `codenv` 也走
source；在那之前浏览器照常打开，只是会提示 apply 不可用。

交互式添加（默认）：

```bash
codenv add
```

### 登录 profile 与多账号

每个 profile 拥有自己的凭据，存放在配置目录下：

```
~/.config/code-env/accounts/<type>/<profileKey>/
```

工具自身的凭据路径（`~/.codex/auth.json`、`~/.claude/.credentials.json`）会变成
指向当前 profile 目录的符号链接。codex 或 Claude Code 刷新 token 时直接写入该
profile 自己的文件，任何时候都不会把一个账号的凭据覆盖到另一个账号上。

```bash
codenv add --login --type codex work
codenv login codex work          # 为该 profile 执行 `codex login`
codenv add --login --type codex personal
codenv login codex personal      # 第二个彼此独立的账号
codenv use codex work            # 随意切换
```

API profile 同样被隔离：它的凭据文件由 profile 配置的 key 派生而来，因此 API
profile 看不到账号登录，登录 profile 也看不到 API key。这是与旧版本的关键区别
——旧版两者共存于同一个 `auth.json`，切换依赖快照还原，可能把刷新过的 token 回滚掉。

`codenv list` 会显示每个登录 profile 当前持有的账号；尚未登录时显示
`not signed in`。

### 从 0.1.x 迁移

只需执行一次。它把磁盘上已有的凭据归入对应的 profile，并删除旧的 provider 备份文件：

```bash
codenv migrate --dry-run   # 只打印计划，不改动任何文件
codenv migrate
```

当某个 type 恰好只有一个登录 profile 时归属是自动的——这也是 0.1.x 在磁盘上
唯一能表示的情况。如果有多个，需要指明归属：

```bash
codenv migrate codex --login work
```

其余登录 profile 原本只是同一账号的别名，迁移后是空的——对每一个执行
`codenv login <type> <name>` 才会变成真正独立的账号。迁移会把所有将被覆盖的内容
复制到 `accounts/migrate-backup-<时间戳>/`，且不会自动删除。

迁移之前，`codenv use` 会拒绝改动已存在的凭据文件，以免破坏你的登录。若想自行
指定归属，使用 `codenv adopt <type> <name>`。

说明：如果某个工具改用「写临时文件再 rename」的方式替换凭据文件（而不是写穿符号
链接），codenv 会在下一次切换时检测到，把这份孤立的凭据归档回它所属的 profile，
并退回到切换时复制文件的模式。数据不会丢失，只是失去实时写回的特性。macOS 上
Claude Code 把 OAuth 凭据存在钥匙串而非 `.credentials.json`，该布局在那里不适用。

交互式 `codenv add` 会询问 `Select auth (1=API key, 2=account login)`，登录
profile 会跳过 Base URL / API key 的提问。

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

对于 Codex profile，新的应用方式仍然读取旧 profile 里的 `OPENAI_*`
字段，但真正生效的是 `~/.codex/config.toml` 与 `~/.codex/auth.json`，
而不是导出的 `OPENAI_BASE_URL` / `OPENAI_API_KEY` 环境变量。

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

对于 Codex，`codenv unset` 还会恢复 `codenv` 接管前备份的
`~/.codex/config.toml` 与 `~/.codex/auth.json`。

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
        "description": "平衡性能与速度，适合日常使用"
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

说明：
- `unset`：全局需要清理的环境变量。按 type 的默认清理键只会对当前 type 生效，不会影响其他 type。
- `defaultProfiles`：可选；`codex`/`claude` 对应的默认 profile 名称或 key，供 `codenv auto` 使用。
- `codexStatusline`：可选；在启动 `codex` 时写入官方 Codex TUI 状态栏配置。
  - `items`：字符串数组；按顺序写入 `~/.codex/config.toml` 的 `tui.status_line`。
  - 支持的 item ID 包括：`model-name`、`model-with-reasoning`、`current-dir`、`project-root`、`git-branch`、`context-remaining`、`context-used`、`five-hour-limit`、`weekly-limit`、`codex-version`、`context-window-size`、`used-tokens`、`total-input-tokens`、`total-output-tokens`、`session-id`。
  - `configPath`：可选；覆盖 `~/.codex/config.toml`（也可用 `CODE_ENV_CODEX_CONFIG_PATH`）。
  - 若未设置 `items`，`codenv` 不会改写 Codex 状态栏配置（使用 Codex 默认值）。
- `claudeStatusline`：可选；在启动 `claude` 时写入 Claude Code statusLine 配置。
  - `command`：字符串（或字符串数组；数组会被拼接成单个命令字符串）。
  - `type`：字符串；statusLine 类型（默认 `command`）。
  - `padding`：数字；statusLine padding（默认 0）。
  - `settingsPath`：可选；覆盖 `~/.claude/settings.json`（也可用 `CODE_ENV_CLAUDE_SETTINGS_PATH`）。
- `pricing`：可选；模型价格（美元 / 1M tokens），用于在状态栏将 token 用量换算为美元额度。
  - `models`：模型名称到价格的映射（匹配时忽略大小写与格式差异）。
  - `input`/`output`/`cacheRead`/`cacheWrite`：输入/输出/缓存价格。
  - 优先使用 profile 中指定的 `model`，否则使用状态栏输入的模型名称；无拆分则不显示金额。
- `name`：用于展示的 profile 名称，`codenv list` 与 `codenv use <name>` 会使用它。
- `type`：可选，`codex` 或 `claude`（别名 `cc`），便于用 `codenv use <type> <name>` 匹配。
- `note`：显示在 `codenv list` 输出中。
- `removeFiles`：可选；`codenv use` 会输出对应 `rm -f`。Codex profile 还会删除 `~/.codex/auth.json`。
- `pricing`（profile 内）：可选；为单个 profile 覆盖价格。支持 `model` 以及 `input`/`output`/`cacheRead`/`cacheWrite`。
  - `multiplier`：可选；倍率（数字）。
- `ANTHROPIC_AUTH_TOKEN`：当设置了 `ANTHROPIC_API_KEY` 时，`codenv use` 会自动以同样的值导出 `ANTHROPIC_AUTH_TOKEN`。
- `commands`：可选；原样输出到切换脚本中。

## 安全提示

配置文件包含 API key，请妥善保存并避免提交到公共仓库。

## 开发

```bash
npm install
npm run build
```

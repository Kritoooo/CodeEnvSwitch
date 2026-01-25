# 用量统计逻辑

用量来自两条路径（状态栏输入同步 + 会话日志解析），最终追加到 `usage.jsonl`。

## 文件与路径

- `usage.jsonl`：JSONL 记录，包含 `ts`/`type`/`profileKey`/`profileName`/`model`/`sessionId` 和 token 拆分字段。
- `usage.jsonl.state.json`：保存每个 session 的累计 totals + session 文件的 mtime/size，用于计算增量并避免重复统计。
- `profile-log.jsonl`：profile 使用与 session 绑定日志（`use`/`session`）。
- `statusline-debug.jsonl`：当 `CODE_ENV_STATUSLINE_DEBUG` 开启时写入的调试信息。
- 可通过 `usagePath`/`usageStatePath`/`profileLogPath`/`codexSessionsPath`/`claudeSessionsPath` 覆盖默认路径。

## 会话绑定（profile -> session）

- `codenv init` 安装 shell 包装函数，使 `codex`/`claude` 实际走 `codenv launch`。
- `codenv launch` 记录 profile 使用，并在启动后短时间内（默认约 5 秒、每秒轮询）找到最新未绑定的 session 文件（优先 `cwd` 匹配），写入 `profile-log.jsonl`。
- 后续同步会用该绑定将 session 归因到对应 profile。

## 状态栏同步（`codenv statusline --sync-usage`）

- 需要 `sessionId`、model，以及 profile（`profileKey` 或 `profileName`）才会写入用量。
- 从 stdin JSON 读取 totals，与 state 中的上次 totals 做差得到增量。
- 如果 totals 回退（session reset），直接把当前 totals 当作新增；否则对负数子项做 0 处理。
- 当拆分合计大于 total 时，以拆分合计为准。
- 把增量写入 `usage.jsonl`，并更新 state 中的 session totals。

## 会话日志同步（`--sync-usage` 与 `codenv list`）

- 扫描 Codex 的 `CODEX_HOME/sessions`（或 `~/.codex/sessions`）与 Claude 的 `CLAUDE_HOME/projects`（或 `~/.claude/projects`）。
- Codex：读取 `event_msg` 的 token_count 记录，取累计最大值；cached input 计为 cache read，并在可判断时从 input 中扣除。
- Claude：汇总 `message.usage` 中的 input/output/cache tokens。
- 与 state 中的文件元数据和 session 最大值做差，生成增量并写入 `usage.jsonl`；无法解析到绑定的文件会被跳过。

## 今日统计

- “今日”按本地时区 00:00 到次日 00:00 计算。

## 费用换算

- 使用 profile 定价或 `pricing.models`（含默认值）换算，依赖 input/output/cache 拆分；缺少拆分则不显示金额。

## 示例

### `usage.jsonl` 记录

每行一条 JSON（字段可能为空或缺省，取决于来源）：

```json
{"ts":"2026-01-25T12:34:56.789Z","type":"codex","profileKey":"p_a1b2c3","profileName":"primary","model":"gpt-5.1-codex","sessionId":"a6f9c4d8-1234-5678-9abc-def012345678","inputTokens":1200,"outputTokens":300,"cacheReadTokens":200,"cacheWriteTokens":0,"totalTokens":1700}
```

`totalTokens` 会取“上报 total”和“拆分合计”的较大值，因此可能 >= input + output + cache。

## 状态栏输入示例（Codex/Claude）

可通过设置 `CODE_ENV_STATUSLINE_DEBUG=1`，在 `statusline-debug.jsonl`
（或 `CODE_ENV_STATUSLINE_DEBUG_PATH` 指定路径）看到实际 JSON。

### Codex（token_usage totals）

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

可识别字段（节选）：
- `token_usage.total_token_usage` 或 `token_usage.totalTokenUsage`
- `last_token_usage` 或 `lastTokenUsage`
- `input_tokens` / `inputTokens` / `input`
- `output_tokens` / `outputTokens` / `output` / `reasoning_output_tokens`
- `cached_input_tokens` / `cache_read_input_tokens`
- `cache_creation_input_tokens` / `cache_write_input_tokens`
- `total_tokens` / `totalTokens` / `total`

`token_usage` 也可以是数字，或直接提供 `usage`。

### Claude（context_window totals）

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

可识别字段（节选）：
- `context_window` 或 `contextWindow`
- `current_usage` 或 `currentUsage`
- `total_input_tokens` / `totalInputTokens`
- `total_output_tokens` / `totalOutputTokens`
- `cache_read_input_tokens` / `cacheReadInputTokens`
- `cache_creation_input_tokens` / `cacheWriteInputTokens`

也可直接提供 `usage`，字段包括 `todayTokens` / `totalTokens` / `inputTokens` /
`outputTokens` / `cacheReadTokens` / `cacheWriteTokens`。

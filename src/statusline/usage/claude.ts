import type {
    StatuslineInput,
    StatuslineInputUsage,
    StatuslineUsageTotals,
} from "../types";
import { firstNumber, isRecord } from "../utils";

function resolveContextWindow(
    input: StatuslineInput
): Record<string, unknown> | null {
    if (isRecord(input.context_window)) {
        return input.context_window as Record<string, unknown>;
    }
    if (isRecord(input.contextWindow)) {
        return input.contextWindow as Record<string, unknown>;
    }
    return null;
}

function resolveCurrentUsage(
    contextWindow: Record<string, unknown>
): Record<string, unknown> | null {
    if (isRecord(contextWindow.current_usage)) {
        return contextWindow.current_usage as Record<string, unknown>;
    }
    if (isRecord(contextWindow.currentUsage)) {
        return contextWindow.currentUsage as Record<string, unknown>;
    }
    return null;
}

function parseClaudeUsageTotalsRecord(
    record: Record<string, unknown>
): StatuslineUsageTotals | null {
    const inputTokens =
        firstNumber(
            record.inputTokens,
            record.input,
            record.input_tokens
        ) ?? null;
    const outputTokens =
        firstNumber(
            record.outputTokens,
            record.output,
            record.output_tokens
        ) ?? null;
    const cacheRead =
        firstNumber(
            record.cache_read_input_tokens,
            record.cacheReadInputTokens,
            record.cache_read,
            record.cacheRead
        ) ?? null;
    const cacheWrite =
        firstNumber(
            record.cache_creation_input_tokens,
            record.cacheCreationInputTokens,
            record.cache_write_input_tokens,
            record.cacheWriteInputTokens,
            record.cache_write,
            record.cacheWrite
        ) ?? null;
    const totalTokens =
        firstNumber(
            record.totalTokens,
            record.total,
            record.total_tokens
        ) ?? null;
    let computedTotal: number | null = null;
    if (
        inputTokens !== null ||
        outputTokens !== null ||
        cacheRead !== null ||
        cacheWrite !== null
    ) {
        computedTotal =
            (inputTokens || 0) +
            (outputTokens || 0) +
            (cacheRead || 0) +
            (cacheWrite || 0);
    }
    const resolvedTotal = totalTokens ?? computedTotal;
    if (
        inputTokens === null &&
        outputTokens === null &&
        cacheRead === null &&
        cacheWrite === null &&
        resolvedTotal === null
    ) {
        return null;
    }
    return {
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        totalTokens: resolvedTotal,
    };
}

function parseClaudeInputUsageRecord(
    record: Record<string, unknown>
): StatuslineInputUsage | null {
    const todayTokens =
        firstNumber(
            record.todayTokens,
            record.today,
            record.today_tokens,
            record.daily,
            record.daily_tokens
        ) ?? null;
    const totalTokens =
        firstNumber(
            record.totalTokens,
            record.total,
            record.total_tokens
        ) ?? null;
    const inputTokens =
        firstNumber(
            record.inputTokens,
            record.input,
            record.input_tokens
        ) ?? null;
    const outputTokens =
        firstNumber(
            record.outputTokens,
            record.output,
            record.output_tokens
        ) ?? null;
    const cacheRead =
        firstNumber(
            record.cache_read_input_tokens,
            record.cacheReadInputTokens,
            record.cache_read,
            record.cacheRead
        ) ?? null;
    const cacheWrite =
        firstNumber(
            record.cache_creation_input_tokens,
            record.cacheCreationInputTokens,
            record.cache_write_input_tokens,
            record.cacheWriteInputTokens,
            record.cache_write,
            record.cacheWrite
        ) ?? null;
    if (
        todayTokens === null &&
        totalTokens === null &&
        inputTokens === null &&
        outputTokens === null &&
        cacheRead === null &&
        cacheWrite === null
    ) {
        return null;
    }
    const hasCacheTokens = cacheRead !== null || cacheWrite !== null;
    const computedTotal = hasCacheTokens
        ? (inputTokens || 0) +
          (outputTokens || 0) +
          (cacheRead || 0) +
          (cacheWrite || 0)
        : null;
    const resolvedTodayTokens = hasCacheTokens
        ? todayTokens ?? totalTokens ?? computedTotal
        : todayTokens;
    return {
        todayTokens: resolvedTodayTokens,
        totalTokens: totalTokens ?? null,
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
    };
}

function parseTotalsFromContextWindow(
    contextWindow: Record<string, unknown>
): StatuslineUsageTotals | null {
    const inputTokens =
        firstNumber(
            contextWindow.total_input_tokens,
            contextWindow.totalInputTokens
        ) ?? null;
    const outputTokens =
        firstNumber(
            contextWindow.total_output_tokens,
            contextWindow.totalOutputTokens
        ) ?? null;
    if (inputTokens === null && outputTokens === null) return null;
    const currentUsage = resolveCurrentUsage(contextWindow);
    const cacheRead =
        currentUsage
            ? firstNumber(
                  currentUsage.cache_read_input_tokens,
                  currentUsage.cacheReadInputTokens
              ) ?? null
            : null;
    const cacheWrite =
        currentUsage
            ? firstNumber(
                  currentUsage.cache_creation_input_tokens,
                  currentUsage.cacheCreationInputTokens
              ) ?? null
            : null;
    const totalTokens =
        (inputTokens || 0) +
        (outputTokens || 0) +
        (cacheRead || 0) +
        (cacheWrite || 0);
    return {
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        totalTokens,
    };
}

export function getClaudeUsageTotalsFromInput(
    input: StatuslineInput | null
): StatuslineUsageTotals | null {
    if (!input) return null;
    const contextWindow = resolveContextWindow(input);
    if (contextWindow) {
        const totals = parseTotalsFromContextWindow(contextWindow);
        if (totals) return totals;
    }
    if (isRecord(input.usage)) {
        return parseClaudeUsageTotalsRecord(input.usage as Record<string, unknown>);
    }
    return null;
}

export function getClaudeInputUsage(
    input: StatuslineInput | null
): StatuslineInputUsage | null {
    if (!input) return null;
    if (isRecord(input.usage)) {
        const parsed = parseClaudeInputUsageRecord(input.usage as Record<string, unknown>);
        if (parsed) return parsed;
        return input.usage as StatuslineInputUsage;
    }
    const contextWindow = resolveContextWindow(input);
    if (!contextWindow) return null;
    const totals = parseTotalsFromContextWindow(contextWindow);
    if (totals) {
        return {
            todayTokens: null,
            totalTokens: null,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheReadTokens: totals.cacheReadTokens,
            cacheWriteTokens: totals.cacheWriteTokens,
        };
    }
    const currentUsage = resolveCurrentUsage(contextWindow);
    if (!currentUsage) return null;
    const inputTokens =
        firstNumber(
            currentUsage.input_tokens,
            currentUsage.inputTokens
        ) ?? null;
    const outputTokens =
        firstNumber(
            currentUsage.output_tokens,
            currentUsage.outputTokens
        ) ?? null;
    const cacheRead =
        firstNumber(
            currentUsage.cache_read_input_tokens,
            currentUsage.cacheReadInputTokens
        ) ?? null;
    const cacheWrite =
        firstNumber(
            currentUsage.cache_creation_input_tokens,
            currentUsage.cacheCreationInputTokens
        ) ?? null;
    if (
        inputTokens === null &&
        outputTokens === null &&
        cacheRead === null &&
        cacheWrite === null
    ) {
        return null;
    }
    const totalTokens =
        (inputTokens || 0) +
        (outputTokens || 0) +
        (cacheRead || 0) +
        (cacheWrite || 0);
    return {
        todayTokens: totalTokens,
        totalTokens: null,
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
    };
}

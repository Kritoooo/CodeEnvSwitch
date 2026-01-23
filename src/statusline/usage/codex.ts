import type {
    StatuslineInput,
    StatuslineInputUsage,
    StatuslineUsageTotals,
} from "../types";
import { coerceNumber, firstNumber, isRecord } from "../utils";

function resolveOutputTokens(record: Record<string, unknown>): number | null {
    const outputTokens =
        firstNumber(
            record.outputTokens,
            record.output,
            record.output_tokens
        ) ?? null;
    const reasoningTokens =
        firstNumber(
            record.reasoning_output_tokens,
            record.reasoningOutputTokens,
            record.reasoning_output
        ) ?? null;
    if (outputTokens === null && reasoningTokens === null) return null;
    if (reasoningTokens === null) return outputTokens;
    return (outputTokens || 0) + reasoningTokens;
}

function parseCodexUsageTotalsRecord(
    record: Record<string, unknown>
): StatuslineUsageTotals | null {
    const inputTokens =
        firstNumber(
            record.inputTokens,
            record.input,
            record.input_tokens
        ) ?? null;
    const outputTokens = resolveOutputTokens(record);
    const cacheRead =
        firstNumber(
            record.cached_input_tokens,
            record.cachedInputTokens,
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

function parseCodexInputUsageRecord(
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
    const outputTokens = resolveOutputTokens(record);
    const cacheRead =
        firstNumber(
            record.cached_input_tokens,
            record.cachedInputTokens,
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

function resolveNestedRecord(
    record: Record<string, unknown>,
    ...keys: string[]
): Record<string, unknown> | null {
    for (const key of keys) {
        if (isRecord(record[key])) {
            return record[key] as Record<string, unknown>;
        }
    }
    return null;
}

export function getCodexUsageTotalsFromInput(
    input: StatuslineInput | null
): StatuslineUsageTotals | null {
    if (!input) return null;
    const tokenUsage = input.token_usage;
    if (typeof tokenUsage === "number") {
        return {
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            totalTokens: coerceNumber(tokenUsage),
        };
    }
    if (isRecord(tokenUsage)) {
        const totalUsage = resolveNestedRecord(
            tokenUsage,
            "total_token_usage",
            "totalTokenUsage"
        );
        if (totalUsage) {
            const parsed = parseCodexUsageTotalsRecord(totalUsage);
            if (parsed) return parsed;
        }
        const lastUsage = resolveNestedRecord(
            tokenUsage,
            "last_token_usage",
            "lastTokenUsage"
        );
        if (lastUsage) {
            const parsed = parseCodexUsageTotalsRecord(lastUsage);
            if (parsed) return parsed;
        }
        const parsed = parseCodexUsageTotalsRecord(tokenUsage as Record<string, unknown>);
        if (parsed) return parsed;
    }
    if (isRecord(input.usage)) {
        return parseCodexUsageTotalsRecord(input.usage as Record<string, unknown>);
    }
    return null;
}

export function getCodexInputUsage(
    input: StatuslineInput | null
): StatuslineInputUsage | null {
    if (!input) return null;
    if (isRecord(input.usage)) {
        const parsed = parseCodexInputUsageRecord(input.usage as Record<string, unknown>);
        if (parsed) return parsed;
        return input.usage as StatuslineInputUsage;
    }
    const tokenUsage = input.token_usage;
    if (tokenUsage !== null && tokenUsage !== undefined) {
        if (typeof tokenUsage === "number") {
            return {
                todayTokens: null,
                totalTokens: coerceNumber(tokenUsage),
                inputTokens: null,
                outputTokens: null,
                cacheReadTokens: null,
                cacheWriteTokens: null,
            };
        }
        if (isRecord(tokenUsage)) {
            const totalUsage = resolveNestedRecord(
                tokenUsage,
                "total_token_usage",
                "totalTokenUsage"
            );
            if (totalUsage) {
                const parsed = parseCodexInputUsageRecord(totalUsage);
                if (parsed) return parsed;
            }
            const lastUsage = resolveNestedRecord(
                tokenUsage,
                "last_token_usage",
                "lastTokenUsage"
            );
            if (lastUsage) {
                const parsed = parseCodexInputUsageRecord(lastUsage);
                if (parsed) return parsed;
            }
            const parsed = parseCodexInputUsageRecord(tokenUsage as Record<string, unknown>);
            if (parsed) return parsed;
        }
    }
    return null;
}

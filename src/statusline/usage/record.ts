/**
 * Shared shape of a usage record.
 *
 * Claude and Codex disagree only about how input, output and cache-read tokens
 * are spelled and derived; everything after that — the cache-write and total
 * alias lists, the computed-total fallback, the all-null bail-out and the
 * returned shape — is one rule. It lives here so a new upstream key spelling is
 * a single edit rather than four.
 */
import type { StatuslineInputUsage, StatuslineUsageTotals } from "../types";
import { firstNumber } from "../utils";

/** The part each provider reads for itself. */
export interface CoreTokens {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
}

export type CoreReader = (record: Record<string, unknown>) => CoreTokens;

export function readCacheWriteTokens(record: Record<string, unknown>): number | null {
    return firstNumber(
        record.cache_creation_input_tokens,
        record.cacheCreationInputTokens,
        record.cache_write_input_tokens,
        record.cacheWriteInputTokens,
        record.cache_write,
        record.cacheWrite
    );
}

export function readTotalTokens(record: Record<string, unknown>): number | null {
    return firstNumber(record.totalTokens, record.total, record.total_tokens);
}

export function readTodayTokens(record: Record<string, unknown>): number | null {
    return firstNumber(
        record.todayTokens,
        record.today,
        record.today_tokens,
        record.daily,
        record.daily_tokens
    );
}

export function parseUsageTotalsRecord(
    record: Record<string, unknown>,
    readCore: CoreReader
): StatuslineUsageTotals | null {
    const { inputTokens, outputTokens, cacheReadTokens: cacheRead } = readCore(record);
    const cacheWrite = readCacheWriteTokens(record);
    const totalTokens = readTotalTokens(record);
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

export function parseInputUsageRecord(
    record: Record<string, unknown>,
    readCore: CoreReader
): StatuslineInputUsage | null {
    const todayTokens = readTodayTokens(record);
    const totalTokens = readTotalTokens(record);
    const { inputTokens, outputTokens, cacheReadTokens: cacheRead } = readCore(record);
    const cacheWrite = readCacheWriteTokens(record);
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
        totalTokens,
        inputTokens,
        outputTokens,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
    };
}

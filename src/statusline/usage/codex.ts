import type {
    StatuslineInput,
    StatuslineInputUsage,
    StatuslineUsageTotals,
} from "../types";
import { coerceNumber, firstNumber, isRecord } from "../utils";
import {
    parseInputUsageRecord,
    parseUsageTotalsRecord,
    type CoreReader,
} from "./record";

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
    if (outputTokens !== null) return outputTokens;
    if (reasoningTokens !== null) return reasoningTokens;
    return null;
}

function splitInputTokens(
    record: Record<string, unknown>
): { inputTokens: number | null; cacheReadTokens: number | null } {
    const rawInput =
        firstNumber(
            record.inputTokens,
            record.input,
            record.input_tokens
        ) ?? null;
    const cacheRead =
        firstNumber(
            record.cached_input_tokens,
            record.cachedInputTokens,
            record.cache_read_input_tokens,
            record.cacheReadInputTokens,
            record.cache_read,
            record.cacheRead
        ) ?? null;
    if (rawInput === null) {
        return { inputTokens: null, cacheReadTokens: cacheRead };
    }
    if (cacheRead === null) {
        return { inputTokens: rawInput, cacheReadTokens: null };
    }
    const nonCachedInput = Math.max(0, rawInput - cacheRead);
    return { inputTokens: nonCachedInput, cacheReadTokens: cacheRead };
}

/**
 * Codex reports a raw input count that already includes cached tokens, and
 * falls back to reasoning tokens for output.
 */
const readCodexCore: CoreReader = (record) => {
    const split = splitInputTokens(record);
    return {
        inputTokens: split.inputTokens,
        outputTokens: resolveOutputTokens(record),
        cacheReadTokens: split.cacheReadTokens,
    };
};

function parseCodexUsageTotalsRecord(
    record: Record<string, unknown>
): StatuslineUsageTotals | null {
    return parseUsageTotalsRecord(record, readCodexCore);
}

function parseCodexInputUsageRecord(
    record: Record<string, unknown>
): StatuslineInputUsage | null {
    return parseInputUsageRecord(record, readCodexCore);
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

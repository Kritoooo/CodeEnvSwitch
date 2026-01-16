import type { Config } from "../types";
import { normalizeType } from "../profile/type";
import { readUsageTotalsIndex, resolveUsageTotalsForProfile } from "../usage";
import type { StatuslineInput, StatuslineInputUsage, StatuslineUsage, StatuslineUsageTotals } from "./types";
import { coerceNumber, firstNumber, isRecord } from "./utils";

export function parseUsageTotalsRecord(
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
    const totalTokens =
        firstNumber(
            record.totalTokens,
            record.total,
            record.total_tokens
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
        resolvedTotal === null
    ) {
        return null;
    }
    return {
        inputTokens,
        outputTokens,
        totalTokens: resolvedTotal,
    };
}

export function getUsageTotalsFromInput(
    input: StatuslineInput | null
): StatuslineUsageTotals | null {
    if (!input) return null;
    const contextWindow = isRecord(input.context_window)
        ? (input.context_window as Record<string, unknown>)
        : isRecord(input.contextWindow)
        ? (input.contextWindow as Record<string, unknown>)
        : null;
    if (contextWindow) {
        const totalInputTokens =
            firstNumber(
                contextWindow.total_input_tokens,
                contextWindow.totalInputTokens
            ) ?? null;
        const totalOutputTokens =
            firstNumber(
                contextWindow.total_output_tokens,
                contextWindow.totalOutputTokens
            ) ?? null;
        if (totalInputTokens !== null || totalOutputTokens !== null) {
            return {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                totalTokens: (totalInputTokens || 0) + (totalOutputTokens || 0),
            };
        }
    }
    if (typeof input.token_usage === "number") {
        return {
            inputTokens: null,
            outputTokens: null,
            totalTokens: coerceNumber(input.token_usage),
        };
    }
    if (isRecord(input.token_usage)) {
        const tokenUsage = input.token_usage as Record<string, unknown>;
        const totalUsage =
            (isRecord(tokenUsage.total_token_usage)
                ? (tokenUsage.total_token_usage as Record<string, unknown>)
                : null) ||
            (isRecord(tokenUsage.totalTokenUsage)
                ? (tokenUsage.totalTokenUsage as Record<string, unknown>)
                : null);
        if (totalUsage) {
            const parsed = parseUsageTotalsRecord(totalUsage);
            if (parsed) return parsed;
        }
        return parseUsageTotalsRecord(tokenUsage);
    }
    if (isRecord(input.usage)) {
        return parseUsageTotalsRecord(input.usage as Record<string, unknown>);
    }
    return null;
}

export function normalizeInputUsage(
    inputUsage: StatuslineInputUsage | null
): StatuslineUsage | null {
    if (!inputUsage) return null;
    const usage: StatuslineUsage = {
        todayTokens: coerceNumber(inputUsage.todayTokens),
        totalTokens: coerceNumber(inputUsage.totalTokens),
        inputTokens: coerceNumber(inputUsage.inputTokens),
        outputTokens: coerceNumber(inputUsage.outputTokens),
    };
    const hasUsage =
        usage.todayTokens !== null ||
        usage.totalTokens !== null ||
        usage.inputTokens !== null ||
        usage.outputTokens !== null;
    return hasUsage ? usage : null;
}

export function resolveUsageFromRecords(
    config: Config,
    configPath: string | null,
    type: string | null,
    profileKey: string | null,
    profileName: string | null,
    syncUsage: boolean
): StatuslineUsage | null {
    try {
        const normalized = normalizeType(type || "");
        if (!normalized || (!profileKey && !profileName)) return null;
        const totals = readUsageTotalsIndex(config, configPath, syncUsage);
        if (!totals) return null;
        const usage = resolveUsageTotalsForProfile(
            totals,
            normalized,
            profileKey,
            profileName
        );
        if (!usage) return null;
        return {
            todayTokens: usage.today,
            totalTokens: usage.total,
            inputTokens: null,
            outputTokens: null,
        };
    } catch {
        return null;
    }
}

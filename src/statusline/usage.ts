import type { Config } from "../types";
import { normalizeType } from "../profile/type";
import { readUsageTotalsIndex, resolveUsageTotalsForProfile } from "../usage";
import type { StatuslineInput, StatuslineInputUsage, StatuslineUsage, StatuslineUsageTotals } from "./types";
import { coerceNumber } from "./utils";
import { getClaudeUsageTotalsFromInput } from "./usage/claude";
import { getCodexUsageTotalsFromInput } from "./usage/codex";

export function getUsageTotalsFromInput(
    input: StatuslineInput | null,
    type: string | null
): StatuslineUsageTotals | null {
    if (!input) return null;
    const normalized = normalizeType(type || "");
    if (normalized === "codex") {
        return getCodexUsageTotalsFromInput(input);
    }
    if (normalized === "claude") {
        return getClaudeUsageTotalsFromInput(input);
    }
    return (
        getCodexUsageTotalsFromInput(input) ||
        getClaudeUsageTotalsFromInput(input)
    );
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
        cacheReadTokens: coerceNumber(inputUsage.cacheReadTokens),
        cacheWriteTokens: coerceNumber(inputUsage.cacheWriteTokens),
    };
    const hasUsage =
        usage.todayTokens !== null ||
        usage.totalTokens !== null ||
        usage.inputTokens !== null ||
        usage.outputTokens !== null ||
        usage.cacheReadTokens !== null ||
        usage.cacheWriteTokens !== null;
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
            inputTokens: usage.todayInput ?? null,
            outputTokens: usage.todayOutput ?? null,
            cacheReadTokens: usage.todayCacheRead ?? null,
            cacheWriteTokens: usage.todayCacheWrite ?? null,
        };
    } catch {
        return null;
    }
}

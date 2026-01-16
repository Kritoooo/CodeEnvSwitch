import * as fs from "fs";
import { DEFAULT_PROFILE_TYPES } from "../constants";
import { normalizeType } from "../profile/type";
import type {
    GitStatus,
    StatuslineInput,
    StatuslineInputProfile,
    StatuslineInputUsage,
} from "./types";
import { coerceNumber, firstNonEmpty, firstNumber, isRecord } from "./utils";

export function readStdinJson(): StatuslineInput | null {
    if (process.stdin.isTTY) return null;
    try {
        const raw = fs.readFileSync(0, "utf8");
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const parsed = JSON.parse(trimmed);
        if (!isRecord(parsed)) return null;
        return parsed as StatuslineInput;
    } catch {
        return null;
    }
}

export function normalizeTypeValue(value: string | null): string | null {
    if (!value) return null;
    const normalized = normalizeType(value);
    if (normalized) return normalized;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

export function detectTypeFromEnv(): string | null {
    const matches = DEFAULT_PROFILE_TYPES.filter((type) => {
        const suffix = type.toUpperCase();
        return (
            process.env[`CODE_ENV_PROFILE_KEY_${suffix}`] ||
            process.env[`CODE_ENV_PROFILE_NAME_${suffix}`]
        );
    });
    if (matches.length === 1) return matches[0];
    return null;
}

export function resolveEnvProfile(
    type: string | null
): { key: string | null; name: string | null } {
    const genericKey = process.env.CODE_ENV_PROFILE_KEY || null;
    const genericName = process.env.CODE_ENV_PROFILE_NAME || null;
    if (!type) {
        return { key: genericKey, name: genericName };
    }
    const suffix = type.toUpperCase();
    const key = process.env[`CODE_ENV_PROFILE_KEY_${suffix}`] || genericKey;
    const name = process.env[`CODE_ENV_PROFILE_NAME_${suffix}`] || genericName;
    return { key: key || null, name: name || null };
}

export function getModelFromInput(input: StatuslineInput | null): string | null {
    if (!input) return null;
    const raw = input.model;
    if (!raw) return null;
    if (typeof raw === "string") return raw;
    if (isRecord(raw)) {
        const displayName = raw.displayName || raw.display_name;
        if (displayName) return String(displayName);
        if (raw.id) return String(raw.id);
    }
    return null;
}

export function getModelProviderFromInput(input: StatuslineInput | null): string | null {
    if (!input || !input.model_provider) return null;
    const provider = String(input.model_provider).trim();
    return provider ? provider : null;
}

export function getInputProfile(
    input: StatuslineInput | null
): StatuslineInputProfile | null {
    if (!input || !isRecord(input.profile)) return null;
    return input.profile as StatuslineInputProfile;
}

export function getInputUsage(input: StatuslineInput | null): StatuslineInputUsage | null {
    if (!input) return null;
    if (isRecord(input.usage)) {
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
            };
        }
        if (isRecord(tokenUsage)) {
            const record = tokenUsage as Record<string, unknown>;
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
            };
        }
    }
    const contextWindow = isRecord(input.context_window)
        ? (input.context_window as Record<string, unknown>)
        : isRecord(input.contextWindow)
        ? (input.contextWindow as Record<string, unknown>)
        : null;
    if (!contextWindow) return null;
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
            todayTokens: null,
            totalTokens: null,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
        };
    }
    const currentUsage = isRecord(contextWindow.current_usage)
        ? (contextWindow.current_usage as Record<string, unknown>)
        : isRecord(contextWindow.currentUsage)
        ? (contextWindow.currentUsage as Record<string, unknown>)
        : null;
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
    };
}

export function getSessionId(input: StatuslineInput | null): string | null {
    if (!input) return null;
    return firstNonEmpty(input.session_id, input.sessionId);
}

export function getContextUsedTokens(input: StatuslineInput | null): number | null {
    if (!input) return null;
    return coerceNumber(input.context_window_used_tokens);
}

export function getContextLeftPercent(
    input: StatuslineInput | null,
    type: string | null
): number | null {
    if (!input) return null;
    const raw = coerceNumber(input.context_window_percent);
    if (raw === null || raw < 0) return null;
    const percent = raw <= 1 ? raw * 100 : raw;
    if (percent > 100) return null;
    const usedTokens = getContextUsedTokens(input);
    const normalizedType = normalizeTypeValue(type);
    const preferRemaining =
        normalizedType === "codex" ||
        normalizedType === "claude" ||
        usedTokens === null ||
        (usedTokens <= 0 && percent >= 99);
    const left = preferRemaining ? percent : 100 - percent;
    return Math.max(0, Math.min(100, left));
}

export function getWorkspaceDir(input: StatuslineInput | null): string | null {
    if (!input || !isRecord(input.workspace)) return null;
    const currentDir = input.workspace.current_dir;
    if (currentDir) {
        const trimmed = String(currentDir).trim();
        if (trimmed) return trimmed;
    }
    const projectDir = input.workspace.project_dir;
    if (!projectDir) return null;
    const trimmed = String(projectDir).trim();
    return trimmed ? trimmed : null;
}

export function getGitStatusFromInput(input: StatuslineInput | null): GitStatus | null {
    if (!input || !input.git_branch) return null;
    const branch = String(input.git_branch).trim();
    if (!branch) return null;
    return {
        branch,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };
}

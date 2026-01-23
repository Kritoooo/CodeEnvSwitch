import * as fs from "fs";
import { DEFAULT_PROFILE_TYPES } from "../constants";
import { normalizeType } from "../profile/type";
import type {
    GitStatus,
    StatuslineInput,
    StatuslineInputProfile,
    StatuslineInputUsage,
} from "./types";
import { coerceNumber, firstNonEmpty, isRecord } from "./utils";
import { getClaudeInputUsage } from "./usage/claude";
import { getCodexInputUsage } from "./usage/codex";

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

export function getInputUsage(
    input: StatuslineInput | null,
    type: string | null
): StatuslineInputUsage | null {
    if (!input) return null;
    const normalized = normalizeTypeValue(type);
    if (normalized === "codex") {
        return getCodexInputUsage(input);
    }
    if (normalized === "claude") {
        return getClaudeInputUsage(input);
    }
    return getCodexInputUsage(input) || getClaudeInputUsage(input);
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

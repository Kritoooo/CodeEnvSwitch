/**
 * Statusline builder
 */
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import type { Config, StatuslineArgs } from "../types";
import { DEFAULT_PROFILE_TYPES } from "../constants";
import { normalizeType, inferProfileType, getProfileDisplayName } from "../profile/type";
import {
    formatTokenCount,
    readUsageTotalsIndex,
    resolveUsageTotalsForProfile,
    syncUsageFromStatuslineInput,
} from "../usage";

interface StatuslineInputProfile {
    key?: string;
    name?: string;
    type?: string;
}

interface StatuslineInputUsage {
    todayTokens?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
}

interface StatuslineInputContextWindowUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
}

interface StatuslineInputContextWindow {
    current_usage?: StatuslineInputContextWindowUsage | null;
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    currentUsage?: StatuslineInputContextWindowUsage | null;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    contextWindowSize?: number;
}

interface StatuslineInputModel {
    id?: string;
    displayName?: string;
    display_name?: string;
}

interface StatuslineInput {
    cwd?: string;
    type?: string;
    profile?: StatuslineInputProfile;
    model?: string | StatuslineInputModel;
    model_provider?: string;
    usage?: StatuslineInputUsage;
    token_usage?: StatuslineInputUsage | number | Record<string, unknown>;
    git_branch?: string;
    task_running?: boolean;
    review_mode?: boolean;
    context_window_percent?: number;
    context_window_used_tokens?: number;
    context_window?: StatuslineInputContextWindow | Record<string, unknown> | null;
    contextWindow?: StatuslineInputContextWindow | Record<string, unknown> | null;
    workspace?: {
        current_dir?: string;
        project_dir?: string;
    };
    cost?: Record<string, unknown>;
    version?: string;
    output_style?: { name?: string };
    session_id?: string;
    sessionId?: string;
    transcript_path?: string;
    hook_event_name?: string;
}

interface StatuslineUsage {
    todayTokens: number | null;
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
}

interface StatuslineUsageTotals {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
}

interface GitStatus {
    branch: string | null;
    ahead: number;
    behind: number;
    staged: number;
    unstaged: number;
    untracked: number;
    conflicted: number;
}

const COLOR_ENABLED = !process.env.NO_COLOR && process.env.TERM !== "dumb";
const ANSI_RESET = "\x1b[0m";
const ICON_GIT = "⎇";
const ICON_PROFILE = "👤";
const ICON_MODEL = "⚙";
const ICON_USAGE = "⚡";
const ICON_CONTEXT = "🧠";
const ICON_REVIEW = "📝";
const ICON_CWD = "📁";

function colorize(text: string, colorCode: string): string {
    if (!COLOR_ENABLED) return text;
    return `\x1b[${colorCode}m${text}${ANSI_RESET}`;
}

function dim(text: string): string {
    return colorize(text, "2");
}

function getCwdSegment(cwd: string): string | null {
    if (!cwd) return null;
    const base = path.basename(cwd) || cwd;
    const segment = `${ICON_CWD} ${base}`;
    return dim(segment);
}

export interface StatuslineJson {
    cwd: string;
    type: string | null;
    profile: { key: string | null; name: string | null };
    model: string | null;
    usage: StatuslineUsage | null;
    git: GitStatus | null;
}

export interface StatuslineResult {
    text: string;
    json: StatuslineJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStdinJson(): StatuslineInput | null {
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

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function coerceNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

function firstNumber(...values: Array<unknown>): number | null {
    for (const value of values) {
        const num = coerceNumber(value);
        if (num !== null) return num;
    }
    return null;
}

function normalizeTypeValue(value: string | null): string | null {
    if (!value) return null;
    const normalized = normalizeType(value);
    if (normalized) return normalized;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function detectTypeFromEnv(): string | null {
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

function resolveEnvProfile(type: string | null): { key: string | null; name: string | null } {
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

function getModelFromInput(input: StatuslineInput | null): string | null {
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

function getModelProviderFromInput(input: StatuslineInput | null): string | null {
    if (!input || !input.model_provider) return null;
    const provider = String(input.model_provider).trim();
    return provider ? provider : null;
}

function getInputProfile(input: StatuslineInput | null): StatuslineInputProfile | null {
    if (!input || !isRecord(input.profile)) return null;
    return input.profile as StatuslineInputProfile;
}

function getInputUsage(input: StatuslineInput | null): StatuslineInputUsage | null {
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

function getSessionId(input: StatuslineInput | null): string | null {
    if (!input) return null;
    return firstNonEmpty(input.session_id, input.sessionId);
}

function parseUsageTotalsRecord(
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

function getUsageTotalsFromInput(
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
        return parseUsageTotalsRecord(input.token_usage as Record<string, unknown>);
    }
    if (isRecord(input.usage)) {
        return parseUsageTotalsRecord(input.usage as Record<string, unknown>);
    }
    return null;
}

function getContextUsedTokens(input: StatuslineInput | null): number | null {
    if (!input) return null;
    return coerceNumber(input.context_window_used_tokens);
}

function normalizeInputUsage(
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

function getContextLeftPercent(
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
    // Prefer treating the percent as "remaining" for codex/claude and when usage is absent.
    const preferRemaining =
        normalizedType === "codex" ||
        normalizedType === "claude" ||
        usedTokens === null ||
        (usedTokens <= 0 && percent >= 99);
    const left = preferRemaining ? percent : 100 - percent;
    return Math.max(0, Math.min(100, left));
}

function getWorkspaceDir(input: StatuslineInput | null): string | null {
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

function getGitStatusFromInput(
    input: StatuslineInput | null
): GitStatus | null {
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

function getGitStatus(cwd: string): GitStatus | null {
    if (!cwd) return null;
    const result = spawnSync("git", ["-C", cwd, "status", "--porcelain=v2", "-b"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || !result.stdout) return null;
    const status: GitStatus = {
        branch: null,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };

    const lines = result.stdout.split(/\r?\n/);
    for (const line of lines) {
        if (!line) continue;
        if (line.startsWith("# branch.head ")) {
            status.branch = line.slice("# branch.head ".length).trim();
            continue;
        }
        if (line.startsWith("# branch.ab ")) {
            const parts = line
                .slice("# branch.ab ".length)
                .trim()
                .split(/\s+/);
            for (const part of parts) {
                if (part.startsWith("+")) status.ahead = Number(part.slice(1)) || 0;
                if (part.startsWith("-")) status.behind = Number(part.slice(1)) || 0;
            }
            continue;
        }
        if (line.startsWith("? ")) {
            status.untracked += 1;
            continue;
        }
        if (line.startsWith("u ")) {
            status.conflicted += 1;
            continue;
        }
        if (line.startsWith("1 ") || line.startsWith("2 ")) {
            const parts = line.split(/\s+/);
            const xy = parts[1] || "";
            const staged = xy[0];
            const unstaged = xy[1];
            if (staged && staged !== ".") status.staged += 1;
            if (unstaged && unstaged !== ".") status.unstaged += 1;
            continue;
        }
    }

    if (!status.branch) {
        status.branch = "HEAD";
    }
    return status;
}

function formatGitSegment(status: GitStatus | null): string | null {
    if (!status || !status.branch) return null;
    const meta: string[] = [];
    const dirtyCount = status.staged + status.unstaged + status.untracked;
    if (status.ahead > 0) meta.push(`↑${status.ahead}`);
    if (status.behind > 0) meta.push(`↓${status.behind}`);
    if (status.conflicted > 0) meta.push(`✖${status.conflicted}`);
    if (dirtyCount > 0) meta.push(`+${dirtyCount}`);
    const suffix = meta.length > 0 ? ` [${meta.join("")}]` : "";
    const text = `${ICON_GIT} ${status.branch}${suffix}`;
    const hasConflicts = status.conflicted > 0;
    const isDirty = dirtyCount > 0;
    if (hasConflicts) return colorize(text, "31");
    if (isDirty) return colorize(text, "33");
    if (status.ahead > 0 || status.behind > 0) return colorize(text, "36");
    return colorize(text, "32");
}

function resolveUsageFromRecords(
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

function formatUsageSegment(usage: StatuslineUsage | null): string | null {
    if (!usage) return null;
    const today =
        usage.todayTokens ??
        (usage.inputTokens !== null || usage.outputTokens !== null
            ? (usage.inputTokens || 0) + (usage.outputTokens || 0)
            : usage.totalTokens);
    if (today === null) return null;
    const text = `Today ${formatTokenCount(today)}`;
    return colorize(`${ICON_USAGE} ${text}`, "33");
}

function formatModelSegment(
    model: string | null,
    provider: string | null
): string | null {
    if (!model) return null;
    const providerLabel = provider ? `${provider}:${model}` : model;
    return colorize(`${ICON_MODEL} ${providerLabel}`, "35");
}

function formatProfileSegment(
    type: string | null,
    profileKey: string | null,
    profileName: string | null
): string | null {
    const name = profileName || profileKey;
    if (!name) return null;
    const label = type ? `${type}:${name}` : name;
    return colorize(`${ICON_PROFILE} ${label}`, "37");
}

function formatContextSegment(contextLeft: number | null): string | null {
    if (contextLeft === null) return null;
    const left = Math.max(0, Math.min(100, Math.round(contextLeft)));
    return colorize(`${ICON_CONTEXT} ${left}% left`, "36");
}

function formatContextUsedSegment(usedTokens: number | null): string | null {
    if (usedTokens === null) return null;
    return colorize(`${ICON_CONTEXT} ${formatTokenCount(usedTokens)} used`, "36");
}

function formatModeSegment(reviewMode: boolean): string | null {
    if (!reviewMode) return null;
    return colorize(`${ICON_REVIEW} review`, "34");
}

export function buildStatuslineResult(
    args: StatuslineArgs,
    config: Config,
    configPath: string | null
): StatuslineResult {
    const stdinInput = readStdinJson();
    const inputProfile = getInputProfile(stdinInput);

    let typeCandidate = firstNonEmpty(
        args.type,
        process.env.CODE_ENV_TYPE,
        inputProfile ? inputProfile.type : null,
        stdinInput ? stdinInput.type : null
    );

    if (!typeCandidate) {
        typeCandidate = detectTypeFromEnv();
    }

    let type = normalizeTypeValue(typeCandidate);
    const envProfile = resolveEnvProfile(type);

    const profileKey = firstNonEmpty(
        args.profileKey,
        envProfile.key,
        inputProfile ? inputProfile.key : null
    );
    let profileName = firstNonEmpty(
        args.profileName,
        envProfile.name,
        inputProfile ? inputProfile.name : null
    );

    if (profileKey && !profileName && config.profiles && config.profiles[profileKey]) {
        const profile = config.profiles[profileKey];
        profileName = getProfileDisplayName(profileKey, profile, type || undefined);
        if (!type) {
            const inferred = inferProfileType(profileKey, profile, null);
            if (inferred) type = inferred;
        }
    }

    if (!type && profileKey && config.profiles && config.profiles[profileKey]) {
        const profile = config.profiles[profileKey];
        const inferred = inferProfileType(profileKey, profile, null);
        if (inferred) type = inferred;
    }

    const cwd = firstNonEmpty(
        args.cwd,
        process.env.CODE_ENV_CWD,
        getWorkspaceDir(stdinInput),
        stdinInput ? stdinInput.cwd : null,
        process.cwd()
    )!;

    const sessionId = getSessionId(stdinInput);
    const stdinUsageTotals = getUsageTotalsFromInput(stdinInput);
    if (args.syncUsage && sessionId && stdinUsageTotals) {
        const usageType = normalizeType(type || "");
        syncUsageFromStatuslineInput(
            config,
            configPath,
            usageType,
            profileKey,
            profileName,
            sessionId,
            stdinUsageTotals,
            cwd
        );
    }

    const model = firstNonEmpty(
        args.model,
        process.env.CODE_ENV_MODEL,
        getModelFromInput(stdinInput)
    );
    const modelProvider = firstNonEmpty(
        process.env.CODE_ENV_MODEL_PROVIDER,
        getModelProviderFromInput(stdinInput)
    );

    const usage: StatuslineUsage = {
        todayTokens: firstNumber(
            args.usageToday,
            process.env.CODE_ENV_USAGE_TODAY
        ),
        totalTokens: firstNumber(
            args.usageTotal,
            process.env.CODE_ENV_USAGE_TOTAL
        ),
        inputTokens: firstNumber(
            args.usageInput,
            process.env.CODE_ENV_USAGE_INPUT
        ),
        outputTokens: firstNumber(
            args.usageOutput,
            process.env.CODE_ENV_USAGE_OUTPUT
        ),
    };

    const hasExplicitUsage =
        usage.todayTokens !== null ||
        usage.totalTokens !== null ||
        usage.inputTokens !== null ||
        usage.outputTokens !== null;

    const stdinUsage = normalizeInputUsage(getInputUsage(stdinInput));

    let finalUsage: StatuslineUsage | null = hasExplicitUsage ? usage : null;
    if (!finalUsage) {
        finalUsage = stdinUsage;
    }
    if (!finalUsage) {
        finalUsage = resolveUsageFromRecords(
            config,
            configPath,
            type,
            profileKey,
            profileName,
            args.syncUsage
        );
    }

    let gitStatus = getGitStatus(cwd);
    if (!gitStatus) {
        gitStatus = getGitStatusFromInput(stdinInput);
    } else {
        const inputGit = getGitStatusFromInput(stdinInput);
        if (inputGit && (!gitStatus.branch || gitStatus.branch === "HEAD")) {
            gitStatus.branch = inputGit.branch;
        }
    }
    const gitSegment = formatGitSegment(gitStatus);
    const profileSegment = formatProfileSegment(type, profileKey, profileName);
    const modelSegment = formatModelSegment(model, modelProvider);
    const usageSegment = formatUsageSegment(finalUsage);
    const contextLeft = getContextLeftPercent(stdinInput, type);
    const contextSegment = formatContextSegment(contextLeft);
    const contextUsedTokens = getContextUsedTokens(stdinInput);
    const contextUsedSegment =
        contextSegment === null ? formatContextUsedSegment(contextUsedTokens) : null;
    const modeSegment = formatModeSegment(
        stdinInput?.review_mode === true
    );
    const cwdSegment = getCwdSegment(cwd);

    const segments: string[] = [];
    if (gitSegment) segments.push(gitSegment);
    if (profileSegment) segments.push(profileSegment);
    if (modeSegment) segments.push(modeSegment);
    if (modelSegment) segments.push(modelSegment);
    if (usageSegment) segments.push(usageSegment);
    if (contextSegment) segments.push(contextSegment);
    if (contextUsedSegment) segments.push(contextUsedSegment);
    if (cwdSegment) segments.push(cwdSegment);

    const text = segments.join(" ");

    return {
        text,
        json: {
            cwd,
            type,
            profile: { key: profileKey, name: profileName },
            model,
            usage: finalUsage,
            git: gitStatus,
        },
    };
}

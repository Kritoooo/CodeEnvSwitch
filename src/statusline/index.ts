/**
 * Statusline builder
 */
import type { Config, StatuslineArgs } from "../types";
import { normalizeType, inferProfileType, getProfileDisplayName } from "../profile/type";
import {
    readUsageCostIndex,
    readUsageSessionCost,
    resolveUsageCostForProfile,
    syncUsageFromStatuslineInput,
} from "../usage";
import { calculateUsageCost, resolvePricingForProfile } from "../usage/pricing";
import { appendStatuslineDebug } from "./debug";
import {
    formatContextSegment,
    formatContextUsedSegment,
    formatModeSegment,
    formatModelSegment,
    formatProfileSegment,
    formatUsageSegment,
    getCwdSegment,
} from "./format";
import { formatGitSegment, getGitStatus } from "./git";
import {
    detectTypeFromEnv,
    getContextLeftPercent,
    getContextUsedTokens,
    getGitStatusFromInput,
    getInputProfile,
    getInputUsage,
    getModelFromInput,
    getModelProviderFromInput,
    getSessionId,
    getWorkspaceDir,
    normalizeTypeValue,
    readStdinJson,
    resolveEnvProfile,
} from "./input";
import { getUsageTotalsFromInput, normalizeInputUsage, resolveUsageFromRecords } from "./usage";
import { firstNonEmpty, firstNumber } from "./utils";
import type { StatuslineResult, StatuslineUsage } from "./types";

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
    const usageType = normalizeType(type || "");
    const stdinUsageTotals = getUsageTotalsFromInput(stdinInput, usageType);
    const shouldSyncUsageFromSessions =
        args.syncUsage && !stdinUsageTotals;
    const model = firstNonEmpty(
        args.model,
        process.env.CODE_ENV_MODEL,
        getModelFromInput(stdinInput)
    );
    const modelProvider = firstNonEmpty(
        process.env.CODE_ENV_MODEL_PROVIDER,
        getModelProviderFromInput(stdinInput)
    );
    appendStatuslineDebug(configPath, {
        timestamp: new Date().toISOString(),
        typeCandidate,
        resolvedType: type,
        usageType,
        profile: { key: profileKey, name: profileName },
        sessionId,
        stdinUsageTotals,
        cwd,
        args: {
            type: args.type,
            profileKey: args.profileKey,
            profileName: args.profileName,
            usageToday: args.usageToday,
            usageTotal: args.usageTotal,
            usageInput: args.usageInput,
            usageOutput: args.usageOutput,
            syncUsage: args.syncUsage,
        },
        env: {
            CODE_ENV_TYPE: process.env.CODE_ENV_TYPE,
            CODE_ENV_PROFILE_KEY: process.env.CODE_ENV_PROFILE_KEY,
            CODE_ENV_PROFILE_NAME: process.env.CODE_ENV_PROFILE_NAME,
            CODE_ENV_CWD: process.env.CODE_ENV_CWD,
            CODE_ENV_STATUSLINE: process.env.CODE_ENV_STATUSLINE,
        },
        input: stdinInput,
    });
    if (args.syncUsage && sessionId && stdinUsageTotals) {
        syncUsageFromStatuslineInput(
            config,
            configPath,
            usageType,
            profileKey,
            profileName,
            sessionId,
            stdinUsageTotals,
            cwd,
            model
        );
    }

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
        cacheReadTokens: null,
        cacheWriteTokens: null,
    };

    const hasExplicitUsage =
        usage.todayTokens !== null ||
        usage.totalTokens !== null ||
        usage.inputTokens !== null ||
        usage.outputTokens !== null;

    const stdinUsage = normalizeInputUsage(getInputUsage(stdinInput, usageType));
    const recordsUsage = resolveUsageFromRecords(
        config,
        configPath,
        type,
        profileKey,
        profileName,
        shouldSyncUsageFromSessions
    );

    let finalUsage: StatuslineUsage | null = hasExplicitUsage ? usage : null;
    if (!finalUsage && args.syncUsage && recordsUsage) {
        finalUsage = recordsUsage;
    }
    if (!finalUsage) {
        finalUsage = stdinUsage;
    }
    if (!finalUsage && recordsUsage) {
        finalUsage = recordsUsage;
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
    let profile = profileKey && config.profiles ? config.profiles[profileKey] : null;
    if (!profile && profileName && config.profiles) {
        const matches = Object.entries(config.profiles).find(([key, entry]) => {
            const displayName = getProfileDisplayName(key, entry);
            return (
                displayName === profileName ||
                entry.name === profileName ||
                key === profileName
            );
        });
        if (matches) profile = matches[1];
    }
    const sessionUsage = hasExplicitUsage ? usage : stdinUsage;
    const pricing = resolvePricingForProfile(config, profile || null, model);
    let sessionCost: number | null = null;
    if (hasExplicitUsage) {
        sessionCost = sessionUsage
            ? calculateUsageCost(sessionUsage, pricing)
            : null;
    } else {
        const sessionCostFromRecords = sessionId
            ? readUsageSessionCost(
                  config,
                  configPath,
                  type,
                  sessionId,
                  shouldSyncUsageFromSessions
              )
            : null;
        sessionCost =
            sessionCostFromRecords ??
            (sessionUsage ? calculateUsageCost(sessionUsage, pricing) : null);
    }
    const costIndex = readUsageCostIndex(
        config,
        configPath,
        shouldSyncUsageFromSessions
    );
    const costTotals = costIndex
        ? resolveUsageCostForProfile(costIndex, type, profileKey, profileName)
        : null;
    const todayCost = costTotals ? costTotals.today : null;
    const usageSegment = formatUsageSegment(todayCost, sessionCost);
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

export type {
    GitStatus,
    StatuslineInput,
    StatuslineInputContextWindow,
    StatuslineInputContextWindowUsage,
    StatuslineInputModel,
    StatuslineInputProfile,
    StatuslineInputUsage,
    StatuslineJson,
    StatuslineResult,
    StatuslineUsage,
    StatuslineUsageTotals,
} from "./types";

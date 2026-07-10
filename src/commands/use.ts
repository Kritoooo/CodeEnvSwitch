/**
 * Use command - apply profile environment
 */
import type { Config, ProfileType } from "../types";
import { shellEscape, expandEnv } from "../shell/utils";
import { inferProfileType, isLoginProfile, getProfileDisplayName } from "../profile/type";
import { shouldRemoveCodexAuth } from "../profile/match";
import { buildEffectiveEnv } from "../profile/display";
import { getFilteredUnsetKeys, getTypeDefaultUnsetKeys } from "../config/defaults";

export function buildUseLines(
    config: Config,
    profileName: string,
    requestedType: ProfileType | null,
    includeGlobalUnset: boolean,
    configPath: string | null = null
): string[] {
    const profile = config.profiles && config.profiles[profileName];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileName}`);
    }

    const unsetLines: string[] = [];
    const exportLines: string[] = [];
    const postLines: string[] = [];
    const unsetKeys = new Set<string>();
    const activeType = inferProfileType(profileName, profile, requestedType);
    const effectiveEnv = buildEffectiveEnv(profile, activeType);
    const managedCodexKeys =
        activeType === "codex"
            ? new Set(["OPENAI_BASE_URL", "OPENAI_API_KEY"])
            : new Set<string>();

    const addUnset = (key: string) => {
        if (unsetKeys.has(key)) return;
        if (Object.prototype.hasOwnProperty.call(effectiveEnv, key)) return;
        unsetKeys.add(key);
        unsetLines.push(`unset ${key}`);
    };

    if (includeGlobalUnset) {
        for (const key of getFilteredUnsetKeys(config, activeType)) {
            addUnset(key);
        }
    }

    if (activeType) {
        for (const key of getTypeDefaultUnsetKeys(activeType)) {
            addUnset(key);
        }
    }

    for (const key of Object.keys(effectiveEnv)) {
        if (managedCodexKeys.has(key)) {
            if (!unsetKeys.has(key)) {
                unsetKeys.add(key);
                unsetLines.push(`unset ${key}`);
            }
            continue;
        }
        const value = effectiveEnv[key];
        if (value === null || value === undefined || value === "") {
            if (!unsetKeys.has(key)) {
                unsetKeys.add(key);
                unsetLines.push(`unset ${key}`);
            }
        } else {
            exportLines.push(`export ${key}=${shellEscape(value)}`);
        }
    }

    if (activeType) {
        const typeSuffix = activeType.toUpperCase();
        const displayName = getProfileDisplayName(profileName, profile, activeType);
        exportLines.push(
            `export CODE_ENV_PROFILE_KEY_${typeSuffix}=${shellEscape(profileName)}`
        );
        exportLines.push(
            `export CODE_ENV_PROFILE_NAME_${typeSuffix}=${shellEscape(displayName)}`
        );
    }
    if (configPath) {
        exportLines.push(`export CODE_ENV_CONFIG_PATH=${shellEscape(configPath)}`);
    }

    if (shouldRemoveCodexAuth(profileName, profile, requestedType)) {
        postLines.push(
            isLoginProfile(profile)
                ? "command codenv __codex-clear"
                : "command codenv __codex-sync"
        );
    }

    if (Array.isArray(profile.removeFiles)) {
        for (const p of profile.removeFiles) {
            const expanded = expandEnv(p);
            if (expanded) postLines.push(`rm -f ${shellEscape(expanded)}`);
        }
    }

    if (Array.isArray(profile.commands)) {
        for (const cmd of profile.commands) {
            if (cmd && String(cmd).trim()) postLines.push(String(cmd));
        }
    }

    return [...unsetLines, ...exportLines, ...postLines];
}

export function printUse(
    config: Config,
    profileName: string,
    requestedType: ProfileType | null = null,
    includeGlobalUnset = true,
    configPath: string | null = null
): void {
    const lines = buildUseLines(
        config,
        profileName,
        requestedType,
        includeGlobalUnset,
        configPath
    );
    console.log(lines.join("\n"));
}

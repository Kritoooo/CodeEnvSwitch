/**
 * Profile matching utilities
 */
import type { Config, Profile, ProfileType } from "../types";
import { normalizeType, hasEnvKeyPrefix, hasTypePrefix, getProfileDisplayName } from "./type";

export function profileMatchesType(profile: Profile | undefined, type: ProfileType): boolean {
    if (!profile) return false;
    if (!profile.type) return true;
    const t = normalizeType(profile.type);
    if (!t) return false;
    return t === type;
}

export function findProfileKeysByName(
    config: Config,
    name: string,
    type?: ProfileType | null
): string[] {
    const profiles = config && config.profiles ? config.profiles : {};
    const matches: string[] = [];
    for (const [key, profile] of Object.entries(profiles)) {
        const safeProfile = profile || {};
        if (type && !profileMatchesType(safeProfile, type)) continue;
        const displayName = getProfileDisplayName(key, safeProfile, type || null);
        if (displayName === name) matches.push(key);
    }
    return matches;
}

export function shouldRemoveCodexAuth(
    profileName: string,
    profile: Profile | undefined,
    requestedType: ProfileType | null
): boolean {
    if (requestedType === "codex") return true;
    if (!profile) return false;
    if (normalizeType(profile.type) === "codex") return true;
    if (hasEnvKeyPrefix(profile, "OPENAI_")) return true;
    return hasTypePrefix(profileName, "codex");
}

/**
 * Profile display utilities
 */
import type { Config, Profile, ProfileType, ListRow, EnvValue } from "../types";
import { DEFAULT_PROFILE_TYPES } from "../constants";
import { normalizeType, inferProfileType, getProfileDisplayName } from "./type";

export function isEnvValueUnset(value: EnvValue): boolean {
    return value === null || value === undefined || value === "";
}

export function buildEffectiveEnv(
    profile: Profile | undefined,
    activeType: ProfileType | null
): Record<string, EnvValue> {
    const env = profile && profile.env ? profile.env : {};
    if (!activeType) return env;
    if (activeType !== "claude") return env;
    const apiKey = env.ANTHROPIC_API_KEY;
    const authToken = env.ANTHROPIC_AUTH_TOKEN;
    if (isEnvValueUnset(apiKey) || !isEnvValueUnset(authToken)) return env;
    return { ...env, ANTHROPIC_AUTH_TOKEN: apiKey };
}

export function envMatchesProfile(profile: Profile | undefined): boolean {
    if (!profile || !profile.env) return false;
    for (const key of Object.keys(profile.env)) {
        const expected = profile.env[key];
        const actual = process.env[key];
        if (isEnvValueUnset(expected)) {
            if (actual !== undefined && actual !== "") return false;
            continue;
        }
        if (actual !== String(expected)) return false;
    }
    return Object.keys(profile.env).length > 0;
}

// Forward declaration to avoid circular dependency
// getResolvedDefaultProfileKeys will be imported from config/defaults
export function buildListRows(
    config: Config,
    getResolvedDefaultProfileKeys: (config: Config) => Record<string, string | undefined>
): ListRow[] {
    const profiles = config && config.profiles ? config.profiles : {};
    const entries = Object.entries(profiles);
    if (entries.length === 0) return [];
    const defaults = getResolvedDefaultProfileKeys(config);
    const rows = entries.map(([key, profile]) => {
        const safeProfile = profile || {};
        const rawType = safeProfile.type ? String(safeProfile.type) : "";
        const normalizedType = normalizeType(rawType);
        const type = normalizedType || rawType || "-";
        const inferredType = inferProfileType(key, safeProfile, null);
        const usageType = inferredType || normalizedType || null;
        const displayName = getProfileDisplayName(key, safeProfile);
        const note = safeProfile.note ? String(safeProfile.note) : "";
        const defaultTypes = DEFAULT_PROFILE_TYPES.filter(
            (profileType) => defaults[profileType] === key
        );
        const defaultLabel = defaultTypes.length > 0 ? "default" : "";
        const noteParts: string[] = [];
        if (defaultLabel) noteParts.push(defaultLabel);
        if (note) noteParts.push(note);
        const noteText = noteParts.join(" | ");
        const active = envMatchesProfile(safeProfile);
        return { key, name: displayName, type, note: noteText, active, usageType };
    });
    rows.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        const typeCmp = a.type.localeCompare(b.type);
        if (typeCmp !== 0) return typeCmp;
        return a.key.localeCompare(b.key);
    });
    return rows;
}

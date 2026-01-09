/**
 * Default profile handling
 */
import type { Config, ProfileType, DefaultProfiles } from "../types";
import { DEFAULT_PROFILE_TYPES, DEFAULT_UNSET_KEYS } from "../constants";
import { normalizeType } from "../profile/type";
import { resolveProfileName } from "../profile/resolve";

export function getDefaultProfiles(config: Config): DefaultProfiles {
    const defaults: DefaultProfiles = {};
    if (!config || typeof config !== "object") return defaults;
    if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
        return defaults;
    }
    for (const [rawType, rawValue] of Object.entries(config.defaultProfiles)) {
        const type = normalizeType(rawType);
        if (!type) continue;
        const trimmed = String(rawValue ?? "").trim();
        if (trimmed) defaults[type] = trimmed;
    }
    return defaults;
}

export function deleteDefaultProfileEntry(config: Config, type: ProfileType): boolean {
    if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
        return false;
    }
    let changed = false;
    for (const key of Object.keys(config.defaultProfiles)) {
        if (normalizeType(key) === type) {
            delete config.defaultProfiles[key];
            changed = true;
        }
    }
    return changed;
}

export function resolveDefaultProfileForType(
    config: Config,
    type: ProfileType,
    value: string
): string | null {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const params = trimmed.split(/\s+/).filter(Boolean);
    if (params.length === 0) return null;
    const explicitType = normalizeType(params[0]);
    if (explicitType) {
        if (explicitType !== type) {
            throw new Error(
                `Default profile for "${type}" must match type "${type}".`
            );
        }
        return resolveProfileName(config, params);
    }
    return resolveProfileName(config, [type, ...params]);
}

export function getResolvedDefaultProfileKeys(config: Config): DefaultProfiles {
    const defaults = getDefaultProfiles(config);
    const resolved: DefaultProfiles = {};
    for (const type of DEFAULT_PROFILE_TYPES) {
        const value = defaults[type];
        if (!value) continue;
        try {
            const profileName = resolveDefaultProfileForType(config, type, value);
            if (profileName) resolved[type] = profileName;
        } catch (err) {
            // ignore invalid defaults for list output
        }
    }
    return resolved;
}

export function getTypeDefaultUnsetKeys(type: ProfileType): string[] {
    return DEFAULT_UNSET_KEYS[type] || [];
}

export function getFilteredUnsetKeys(config: Config, activeType: ProfileType | null): string[] {
    const keys = Array.isArray(config.unset) ? config.unset : [];
    if (!activeType) return [...keys];
    const otherDefaults = new Set(
        DEFAULT_PROFILE_TYPES.filter((type) => type !== activeType).flatMap(
            (type) => DEFAULT_UNSET_KEYS[type]
        )
    );
    return keys.filter((key) => !otherDefaults.has(key));
}

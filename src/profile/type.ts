/**
 * Profile type handling
 */
import type { Profile, ProfileType } from "../types";

export function normalizeType(value: string | null | undefined): ProfileType | null {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    const compact = raw.replace(/[\s_-]+/g, "");
    if (compact === "codex") return "codex";
    if (compact === "claude" || compact === "claudecode" || compact === "cc") {
        return "claude";
    }
    return null;
}

export function hasTypePrefix(name: string, type: ProfileType): boolean {
    if (!name) return false;
    const lowered = String(name).toLowerCase();
    const prefixes = type === "claude" ? [type, "cc"] : [type];
    for (const prefix of prefixes) {
        for (const sep of ["-", "_", "."]) {
            if (lowered.startsWith(`${prefix}${sep}`)) return true;
        }
    }
    return false;
}

export function hasEnvKeyPrefix(profile: Profile | undefined, prefix: string): boolean {
    if (!profile || !profile.env) return false;
    const normalized = prefix.toUpperCase();
    for (const key of Object.keys(profile.env)) {
        if (key.toUpperCase().startsWith(normalized)) return true;
    }
    return false;
}

export function inferProfileType(
    profileName: string,
    profile: Profile | undefined,
    requestedType: ProfileType | null
): ProfileType | null {
    if (requestedType) return requestedType;
    const fromProfile = profile ? normalizeType(profile.type) : null;
    if (fromProfile) return fromProfile;
    if (hasEnvKeyPrefix(profile, "OPENAI_")) return "codex";
    if (hasEnvKeyPrefix(profile, "ANTHROPIC_")) return "claude";
    if (hasTypePrefix(profileName, "codex")) return "codex";
    if (hasTypePrefix(profileName, "claude")) return "claude";
    return null;
}

export function stripTypePrefixFromName(name: string, type: string): string {
    if (!name) return name;
    const normalizedType = normalizeType(type);
    if (!normalizedType) return name;
    const lowered = String(name).toLowerCase();
    const prefixes = normalizedType === "claude" ? [normalizedType, "cc"] : [normalizedType];
    for (const prefix of prefixes) {
        for (const sep of ["-", "_", "."]) {
            const candidate = `${prefix}${sep}`;
            if (lowered.startsWith(candidate)) {
                const stripped = String(name).slice(candidate.length);
                return stripped || name;
            }
        }
    }
    return name;
}

export function getProfileDisplayName(
    profileKey: string,
    profile: Profile,
    requestedType?: string | null
): string {
    if (profile.name) return String(profile.name);
    const rawType = profile.type ? String(profile.type) : "";
    if (rawType) return stripTypePrefixFromName(profileKey, rawType);
    if (requestedType) return stripTypePrefixFromName(profileKey, requestedType);
    return profileKey;
}


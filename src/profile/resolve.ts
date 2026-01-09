/**
 * Profile resolution utilities
 */
import type { Config, ProfileType } from "../types";
import { normalizeType } from "./type";
import { profileMatchesType, findProfileKeysByName } from "./match";

export function generateProfileKey(config: Config): string {
    const profiles = config && config.profiles ? config.profiles : {};
    for (let i = 0; i < 10; i++) {
        const key = `p_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        if (!profiles[key]) return key;
    }
    let idx = 0;
    while (true) {
        const key = `p_${Date.now().toString(36)}_${idx}`;
        if (!profiles[key]) return key;
        idx++;
    }
}

export function resolveProfileName(config: Config, params: string[]): string {
    if (!params || params.length === 0) {
        throw new Error("Missing profile name.");
    }
    if (params.length >= 2) {
        const maybeType = normalizeType(params[0]);
        if (maybeType) {
            const name = params[1];
            return resolveProfileByType(config, maybeType, name, params[0]);
        }
    }
    const name = params[0];
    const profiles = config && config.profiles ? config.profiles : {};
    if (profiles[name]) return name;
    const matches = findProfileKeysByName(config, name, null);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        throw new Error(
            `Multiple profiles named "${name}". ` +
            `Use: codenv <type> ${name} (or profile key: ${matches.join(", ")})`
        );
    }
    return name;
}

export function resolveProfileByType(
    config: Config,
    type: ProfileType,
    name: string,
    rawType: string
): string {
    if (!name) throw new Error("Missing profile name.");
    const profiles = config && config.profiles ? config.profiles : {};

    if (profiles[name] && profileMatchesType(profiles[name], type)) {
        return name;
    }
    const matches = findProfileKeysByName(config, name, type);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        throw new Error(
            `Multiple profiles named "${name}" for type "${type}". ` +
            `Use profile key: ${matches.join(", ")}`
        );
    }
    if (rawType) {
        const prefixes: string[] = [];
        const raw = String(rawType).trim();
        if (raw && raw.toLowerCase() !== type) prefixes.push(raw);
        prefixes.push(type);
        for (const prefix of prefixes) {
            for (const sep of ["-", "_", "."]) {
                const candidate = `${prefix}${sep}${name}`;
                if (profiles[candidate] && profileMatchesType(profiles[candidate], type)) {
                    return candidate;
                }
            }
        }
    }
    throw new Error(`Unknown profile for type "${type}": ${name}`);
}

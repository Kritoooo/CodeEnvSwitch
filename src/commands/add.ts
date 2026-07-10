/**
 * Add command - add/update profile configuration
 */
import type { Config, AddArgs } from "../types";
import { findProfileKeysByName } from "../profile/match";
import { generateProfileKey } from "../profile/resolve";
import { inferProfileType } from "../profile/type";

const API_CREDENTIAL_KEYS = new Set([
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
]);

export function addConfig(config: Config, addArgs: AddArgs): Config {
    if (!config.profiles || typeof config.profiles !== "object") {
        config.profiles = {};
    }
    let targetKey: string | null = null;
    let matchedByName = false;

    if (Object.prototype.hasOwnProperty.call(config.profiles, addArgs.profile!)) {
        targetKey = addArgs.profile;
    } else {
        const matches = findProfileKeysByName(
            config,
            addArgs.profile!,
            addArgs.type
        );
        if (matches.length === 1) {
            targetKey = matches[0];
            matchedByName = true;
        } else if (matches.length > 1) {
            const hint = addArgs.type
                ? `Use profile key: ${matches.join(", ")}`
                : `Use: codenv add --type <type> ${addArgs.profile} ... (or profile key: ${matches.join(
                    ", "
                )})`;
            throw new Error(`Multiple profiles named "${addArgs.profile}". ${hint}`);
        }
    }

    if (!targetKey) {
        targetKey = generateProfileKey(config);
        matchedByName = true;
    }

    if (!config.profiles[targetKey]) {
        config.profiles[targetKey] = {};
    }
    const profile = config.profiles[targetKey];
    if (!profile.env || typeof profile.env !== "object") {
        profile.env = {};
    }

    if (matchedByName) {
        profile.name = addArgs.profile!;
    }

    if (addArgs.type) {
        profile.type = addArgs.type;
    }

    for (const pair of addArgs.pairs) {
        const idx = pair.indexOf("=");
        if (idx <= 0) throw new Error(`Invalid KEY=VALUE: ${pair}`);
        const key = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        if (addArgs.login && API_CREDENTIAL_KEYS.has(key.toUpperCase())) {
            throw new Error(
                `Login profiles use the account login stored by codex/claude; drop ${key} or omit --login.`
            );
        }
        profile.env[key] = value;
    }

    if (addArgs.login) {
        profile.authMode = "login";
        for (const key of Object.keys(profile.env)) {
            if (API_CREDENTIAL_KEYS.has(key.toUpperCase())) {
                delete profile.env[key];
            }
        }
        const resolvedType = inferProfileType(targetKey, profile, addArgs.type);
        if (!resolvedType) {
            throw new Error(
                "Login profiles need a type. Use: codenv add --login --type <codex|claude> <name>."
            );
        }
        if (!profile.type) profile.type = resolvedType;
    }

    if (addArgs.note !== null && addArgs.note !== undefined) {
        profile.note = addArgs.note;
    }

    if (addArgs.removeFiles.length > 0) {
        if (!Array.isArray(profile.removeFiles)) profile.removeFiles = [];
        for (const p of addArgs.removeFiles) {
            if (!profile.removeFiles.includes(p)) profile.removeFiles.push(p);
        }
    }

    if (addArgs.commands.length > 0) {
        if (!Array.isArray(profile.commands)) profile.commands = [];
        for (const cmd of addArgs.commands) {
            if (!profile.commands.includes(cmd)) profile.commands.push(cmd);
        }
    }

    if (addArgs.unset.length > 0) {
        if (!Array.isArray(config.unset)) config.unset = [];
        for (const key of addArgs.unset) {
            if (!config.unset.includes(key)) config.unset.push(key);
        }
    }

    return config;
}

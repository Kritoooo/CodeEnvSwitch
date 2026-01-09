/**
 * Add command - add/update profile configuration
 */
import type { Config, AddArgs } from "../types";
import { findProfileKeysByName } from "../profile/match";
import { generateProfileKey } from "../profile/resolve";

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
        profile.env[key] = value;
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

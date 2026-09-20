/**
 * Adopt command - capture the credential already on disk into a profile
 */
import * as fs from "fs";
import type { AdoptArgs, Config } from "../types";
import { resolveProfileByType } from "../profile/resolve";
import { getProfileDisplayName } from "../profile/type";
import { adoptLiveCredential, getLiveCredentialPath } from "./vault";
import { describeCredential, detectAuthMode } from "./identity";

/** Returns true when the config was changed and needs writing back. */
export function runAdopt(
    config: Config,
    configPath: string | null,
    args: AdoptArgs
): boolean {
    if (!args.type) {
        throw new Error("Missing type. Use: codenv adopt <codex|claude> <name>.");
    }
    if (!args.name) {
        throw new Error("Missing profile name. Use: codenv adopt <codex|claude> <name>.");
    }
    const profileKey = resolveProfileByType(config, args.type, args.name, args.type);
    const profile = (config.profiles || {})[profileKey];
    if (!profile) {
        throw new Error(`Unknown profile: ${args.name}`);
    }

    const live = getLiveCredentialPath(args.type);
    let text: string;
    try {
        text = fs.readFileSync(live, "utf8");
    } catch {
        throw new Error(`No credential file at ${live} to adopt.`);
    }

    const mode = detectAuthMode(args.type, text);
    let changed = false;
    if (mode === "login" && profile.authMode !== "login") {
        profile.authMode = "login";
        changed = true;
    }
    if (!profile.type) {
        profile.type = args.type;
        changed = true;
    }

    adoptLiveCredential(configPath, args.type, profileKey);

    const label = describeCredential(args.type, text);
    const displayName = getProfileDisplayName(profileKey, profile, args.type);
    console.log(
        `Adopted ${args.type} credential${label ? ` (${label})` : ""} into profile "${displayName}".`
    );
    return changed;
}

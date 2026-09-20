/**
 * Applying a profile's account to the live credential path
 */
import type { Config, ProfileType } from "../types";
import { isLoginProfile } from "../profile/type";
import { applyCodexConfigToml, buildCodexApiAuthJson } from "../codex/config";
import { checkoutVault, reconcileVault, writeVaultCredential } from "./vault";

export interface ApplyReport {
    warnings: string[];
}

/**
 * Put `profileKey`'s credentials in place for `type`.
 *
 * API profiles get a vault file derived from their configured key, so it is
 * disposable and always matches the config. Login profiles own their vault
 * file outright — codenv never writes it, which is what lets a refreshed token
 * stay put instead of being rolled back to a snapshot.
 */
export function applyProfileAccount(
    config: Config,
    configPath: string | null,
    profileKey: string,
    type: ProfileType
): ApplyReport {
    const profile = (config.profiles || {})[profileKey];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileKey}`);
    }
    const warnings: string[] = [];
    const report = reconcileVault(configPath, type);
    if (report.degraded) {
        warnings.push(
            `${type}: credential file was replaced by an atomic write; ` +
            `archived it into the previous profile and switched to copy mode.`
        );
    }

    const login = isLoginProfile(profile);
    if (type === "codex") {
        applyCodexConfigToml(config, profile);
        if (!login) {
            writeVaultCredential(configPath, type, profileKey, buildCodexApiAuthJson(profile));
        }
    } else if (!login) {
        // An API profile must not see the account login, so its vault file is
        // deliberately absent: claude reads that as "not logged in".
        writeVaultCredential(configPath, type, profileKey, null);
    }

    checkoutVault(configPath, type, profileKey);
    return { warnings };
}

/**
 * Applying a profile's account to the live credential path
 */
import * as fs from "fs";
import * as path from "path";
import type { Config, ProfileType } from "../types";
import { isLoginProfile } from "../profile/type";
import { applyCodexConfigToml, buildCodexApiAuthJson } from "../codex/config";
import { detectAuthMode } from "./identity";
import {
    checkoutVault,
    getVaultCredentialPath,
    readVaultCredential,
    reconcileVault,
    writeVaultCredential,
} from "./vault";

export interface ApplyReport {
    warnings: string[];
}

/**
 * Move a real account login out of the way before a derived file overwrites it.
 *
 * Flipping a profile from login to API is a config edit, not a reason to lose a
 * credential that may need a browser round-trip to recreate.
 */
function archiveLoginCredential(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): string | null {
    const current = readVaultCredential(configPath, type, profileKey);
    if (detectAuthMode(type, current) !== "login") return null;
    const vaultPath = getVaultCredentialPath(configPath, type, profileKey);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archived = path.join(
        path.dirname(vaultPath),
        `${path.basename(vaultPath)}.login-${stamp}`
    );
    try {
        fs.renameSync(vaultPath, archived);
    } catch {
        return null;
    }
    return archived;
}

/**
 * Drop a derived API credential left behind when a profile became a login one.
 *
 * Without this the stale file would be mounted as if it were the account login,
 * so codex would quietly keep running on the old key.
 */
function clearDerivedCredential(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): boolean {
    const current = readVaultCredential(configPath, type, profileKey);
    if (detectAuthMode(type, current) !== "api") return false;
    writeVaultCredential(configPath, type, profileKey, null);
    return true;
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
    if (type === "codex") applyCodexConfigToml(config, profile);

    if (login) {
        // The vault may still hold a derived file from when this profile was an
        // API one; mounting it would silently keep the old key in use.
        if (clearDerivedCredential(configPath, type, profileKey)) {
            warnings.push(
                `${type}: profile is now a login profile but its vault held an ` +
                `API credential; removed it. Run \`codenv login ${type} <name>\` to sign in.`
            );
        }
    } else {
        const archived = archiveLoginCredential(configPath, type, profileKey);
        if (archived) {
            warnings.push(
                `${type}: profile is now an API profile; its account login was ` +
                `moved to ${archived} instead of being overwritten.`
            );
        }
        // An API profile must not see an account login. For codex the file is
        // derived from the configured key; for claude it stays absent, which
        // claude reads as "not logged in".
        writeVaultCredential(
            configPath,
            type,
            profileKey,
            type === "codex" ? buildCodexApiAuthJson(profile) : null
        );
    }

    checkoutVault(configPath, type, profileKey);
    return { warnings };
}

/**
 * Migrate command - move Phase 1 snapshot-based state into the account vault
 *
 * Phase 1 could only ever hold one account per tool on disk, so when exactly
 * one login profile exists the credential's owner is unambiguous and nothing is
 * asked. Two or more login profiles were aliases for that same account, so one
 * of them has to be named; the rest come out empty and need `codenv login`.
 */
import * as fs from "fs";
import * as path from "path";
import type { Config, MigrateArgs, Profile, ProfileType } from "../types";
import { CODEX_PROVIDER_NAME } from "../constants";
import { getProfileDisplayName, inferProfileType, isLoginProfile } from "../profile/type";
import { findProfileKeysByName, generateProfileKey } from "../profile";
import {
    applyCodexConfigToml,
    buildCodexApiAuthJson,
    getLegacyBackupPath,
    readLegacyCodexBackup,
    readModelProviderLine,
    removeLegacyCodexBackup,
    resolveCodexConfigPath,
} from "../codex/config";
import { describeCredential } from "./identity";
import {
    checkoutVault,
    getLiveCredentialPath,
    getVaultRoot,
    isManagedLive,
    writeVaultCredential,
} from "./vault";

export interface MigrateTypePlan {
    type: ProfileType;
    skip: string | null;
    loginKey: string | null;
    loginName: string;
    createLoginProfile: boolean;
    credentialText: string | null;
    credentialLabel: string | null;
    credentialSource: string | null;
    apiProfiles: { key: string; name: string }[];
    baseModelProvider: string | null;
    hasLegacyBackup: boolean;
    orphanLoginProfiles: string[];
    notes: string[];
}

function readTextIfExists(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return null;
    }
}

function parseJsonObject(text: string | null): Record<string, unknown> | null {
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }
    return null;
}

function getRefreshMs(record: Record<string, unknown> | null): number {
    if (!record || typeof record.last_refresh !== "string") return 0;
    const ms = Date.parse(record.last_refresh);
    return Number.isFinite(ms) ? ms : 0;
}

/** Keep only the login half of a codex auth.json, dropping the API-key half. */
function extractLoginCredential(
    type: ProfileType,
    record: Record<string, unknown> | null
): string | null {
    if (!record) return null;
    if (type === "codex") {
        if (!record.tokens) return null;
        const kept: Record<string, unknown> = { tokens: record.tokens };
        if (record.last_refresh) kept.last_refresh = record.last_refresh;
        return `${JSON.stringify(kept, null, 2)}\n`;
    }
    if (!record.claudeAiOauth) return null;
    return `${JSON.stringify(record, null, 2)}\n`;
}

function quotedTomlValue(line: string | null): string | null {
    if (!line) return null;
    const match = line.match(/=\s*"([^"]*)"/);
    return match && match[1] ? match[1] : null;
}

function listProfilesOfType(
    config: Config,
    type: ProfileType,
    login: boolean
): { key: string; name: string }[] {
    const profiles = config.profiles || {};
    const out: { key: string; name: string }[] = [];
    for (const [key, raw] of Object.entries(profiles)) {
        const profile = raw || {};
        if (inferProfileType(key, profile, null) !== type) continue;
        if (isLoginProfile(profile) !== login) continue;
        out.push({ key, name: getProfileDisplayName(key, profile, type) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}

export function buildMigrateTypePlan(
    config: Config,
    configPath: string | null,
    type: ProfileType,
    loginNameOverride: string | undefined
): MigrateTypePlan {
    const notes: string[] = [];
    const hasLegacyBackup =
        type === "codex" && fs.existsSync(getLegacyBackupPath(config));
    const plan: MigrateTypePlan = {
        type,
        skip: null,
        loginKey: null,
        loginName: "",
        createLoginProfile: false,
        credentialText: null,
        credentialLabel: null,
        credentialSource: null,
        apiProfiles: listProfilesOfType(config, type, false),
        baseModelProvider: null,
        hasLegacyBackup,
        orphanLoginProfiles: [],
        notes,
    };

    if (isManagedLive(configPath, type) && !hasLegacyBackup) {
        plan.skip = "already managed by codenv";
        return plan;
    }

    // Pick the fresher of the two copies Phase 1 could leave behind.
    const liveRecord = parseJsonObject(readTextIfExists(getLiveCredentialPath(type)));
    const backup = type === "codex" ? readLegacyCodexBackup(config) : null;
    const backupRecord = parseJsonObject(backup ? backup.authText : null);
    const useBackup = getRefreshMs(backupRecord) > getRefreshMs(liveRecord);
    const chosen = useBackup ? backupRecord : liveRecord;
    plan.credentialText = extractLoginCredential(type, chosen);
    plan.credentialSource = plan.credentialText
        ? useBackup
            ? "legacy backup file"
            : getLiveCredentialPath(type)
        : null;
    plan.credentialLabel = describeCredential(type, plan.credentialText);

    if (type === "codex") {
        plan.baseModelProvider =
            quotedTomlValue(backup ? backup.modelProviderLine : null) ||
            (() => {
                const current = quotedTomlValue(
                    readModelProviderLine(
                        readTextIfExists(resolveCodexConfigPath(config)) || ""
                    )
                );
                return current && current !== CODEX_PROVIDER_NAME ? current : null;
            })();
    }

    const loginProfiles = listProfilesOfType(config, type, true);
    if (loginNameOverride) {
        const matches = findProfileKeysByName(config, loginNameOverride, type);
        if (matches.length !== 1) {
            throw new Error(
                `Cannot resolve --login "${loginNameOverride}" for type "${type}".`
            );
        }
        plan.loginKey = matches[0];
        plan.loginName = loginNameOverride;
    } else if (loginProfiles.length === 1) {
        plan.loginKey = loginProfiles[0].key;
        plan.loginName = loginProfiles[0].name;
    } else if (loginProfiles.length === 0) {
        if (plan.credentialText) {
            plan.createLoginProfile = true;
            plan.loginName = "login";
            notes.push(
                `No ${type} login profile exists; one named "login" will be created ` +
                `to hold the credential found on disk.`
            );
        }
    } else {
        const label = plan.credentialLabel ? ` (${plan.credentialLabel})` : "";
        throw new Error(
            `${loginProfiles.length} ${type} login profiles exist, so the credential` +
            `${label} cannot be attributed automatically.\n` +
            `Re-run with: codenv migrate ${type} --login <${loginProfiles
                .map((entry) => entry.name)
                .join("|")}>`
        );
    }

    plan.orphanLoginProfiles = loginProfiles
        .filter((entry) => entry.key !== plan.loginKey)
        .map((entry) => entry.name);
    if (plan.orphanLoginProfiles.length > 0) {
        notes.push(
            `These ${type} login profiles were aliases for the same account and ` +
            `start empty: ${plan.orphanLoginProfiles.join(", ")}. ` +
            `Run \`codenv login ${type} <name>\` for each to make it a real account.`
        );
    }
    if (!plan.credentialText) {
        notes.push(
            `No ${type} account login found on disk; login profiles will start empty.`
        );
    }
    return plan;
}

export function printMigratePlan(plan: MigrateTypePlan): void {
    console.log(`\n[${plan.type}]`);
    if (plan.skip) {
        console.log(`  skip: ${plan.skip}`);
        return;
    }
    if (plan.credentialText) {
        const label = plan.credentialLabel ? ` (${plan.credentialLabel})` : "";
        const target = plan.createLoginProfile
            ? `${plan.loginName} [new profile]`
            : plan.loginName;
        console.log(`  login credential${label} -> profile "${target}"`);
        console.log(`    source: ${plan.credentialSource}`);
    }
    if (plan.apiProfiles.length > 0) {
        console.log(
            `  ${plan.apiProfiles.length} API profile(s) get a derived vault file: ` +
            plan.apiProfiles.map((entry) => entry.name).join(", ")
        );
    }
    if (plan.baseModelProvider) {
        console.log(`  config.toml: restore model_provider = "${plan.baseModelProvider}"`);
    }
    if (plan.hasLegacyBackup) {
        console.log("  remove legacy provider backup file");
    }
    for (const note of plan.notes) {
        console.log(`  note: ${note}`);
    }
}

function copyIfExists(from: string, toDir: string): boolean {
    if (!fs.existsSync(from)) return false;
    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(from, path.join(toDir, path.basename(from)));
    return true;
}

/** Copy everything this migration will overwrite; never removed automatically. */
export function writeSafetyCopy(
    config: Config,
    configPath: string | null,
    plans: MigrateTypePlan[]
): string | null {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(getVaultRoot(configPath), `migrate-backup-${stamp}`);
    let copied = false;
    for (const plan of plans) {
        if (plan.skip) continue;
        if (copyIfExists(getLiveCredentialPath(plan.type), dir)) copied = true;
        if (plan.type === "codex") {
            if (copyIfExists(getLegacyBackupPath(config), dir)) copied = true;
            if (copyIfExists(resolveCodexConfigPath(config), dir)) copied = true;
        }
    }
    return copied ? dir : null;
}

/** Returns true when the config object was changed and needs writing back. */
export function executeMigrateTypePlan(
    config: Config,
    configPath: string | null,
    plan: MigrateTypePlan
): boolean {
    if (plan.skip) return false;
    let changed = false;

    if (plan.createLoginProfile) {
        const key = generateProfileKey(config);
        if (!config.profiles) config.profiles = {};
        const profile: Profile = {
            name: plan.loginName,
            type: plan.type,
            authMode: "login",
            note: "adopted by codenv migrate",
        };
        config.profiles[key] = profile;
        plan.loginKey = key;
        changed = true;
    }

    if (plan.type === "codex" && plan.baseModelProvider) {
        if (config.codexBaseModelProvider !== plan.baseModelProvider) {
            config.codexBaseModelProvider = plan.baseModelProvider;
            changed = true;
        }
    }

    if (plan.loginKey && plan.credentialText) {
        writeVaultCredential(configPath, plan.type, plan.loginKey, plan.credentialText);
    }

    for (const entry of plan.apiProfiles) {
        if (plan.type !== "codex") continue;
        const profile = (config.profiles || {})[entry.key] || {};
        writeVaultCredential(
            configPath,
            plan.type,
            entry.key,
            buildCodexApiAuthJson(profile)
        );
    }

    // Drop the live file before checkout so the "do not clobber" guard sees a
    // clean slate; its contents are already in the vault and the safety copy.
    const live = getLiveCredentialPath(plan.type);
    try {
        fs.unlinkSync(live);
    } catch {
        // nothing to remove
    }

    if (plan.loginKey) {
        checkoutVault(configPath, plan.type, plan.loginKey);
    }

    if (plan.type === "codex") {
        const loginProfile: Profile = { authMode: "login" };
        applyCodexConfigToml(config, loginProfile);
        removeLegacyCodexBackup(config);
    }

    return changed;
}

export function getMigrateTypes(args: MigrateArgs): ProfileType[] {
    return args.types.length > 0 ? args.types : ["codex", "claude"];
}

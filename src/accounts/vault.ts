/**
 * Per-profile credential vault
 *
 * Each profile owns a credential file under the vault; the tool's live
 * credential path becomes a symlink into it, so a token refresh written by
 * codex/claude lands in the owning profile's file instead of a shared one.
 *
 * Tools that replace the file via tmp+rename would destroy that symlink. That
 * case is detected rather than assumed: the orphaned regular file belongs
 * unambiguously to the last checked-out profile, so it is archived back into
 * that profile's vault and the type degrades to copy mode.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProfileType } from "../types";

export type VaultMode = "link" | "copy";

export interface VaultTypeState {
    activeKey: string | null;
    mode: VaultMode;
    checkoutHash: string | null;
}

export type VaultState = Partial<Record<ProfileType, VaultTypeState>>;

export interface ReconcileReport {
    mode: VaultMode;
    degraded: boolean;
    recoveredKey: string | null;
    checkedInKey: string | null;
}

const CREDENTIAL_FILES: Record<ProfileType, string> = {
    codex: "auth.json",
    claude: ".credentials.json",
};

const CREDENTIAL_MODE = 0o600;

function defaultTypeState(): VaultTypeState {
    return { activeKey: null, mode: "link", checkoutHash: null };
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
}

function resolveConfigDir(configPath: string | null): string {
    if (configPath) return path.dirname(configPath);
    return path.join(os.homedir(), ".config", "code-env");
}

export function getVaultRoot(configPath: string | null): string {
    return path.join(resolveConfigDir(configPath), "accounts");
}

export function getVaultDir(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): string {
    return path.join(getVaultRoot(configPath), type, profileKey);
}

export function getVaultCredentialPath(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): string {
    return path.join(getVaultDir(configPath, type, profileKey), CREDENTIAL_FILES[type]);
}

/** The path the tool itself reads, honouring its own home override. */
export function getLiveCredentialPath(type: ProfileType): string {
    if (type === "codex") {
        const home = process.env.CODEX_HOME;
        const base = home && home.trim() ? home.trim() : path.join(os.homedir(), ".codex");
        return path.join(base, CREDENTIAL_FILES.codex);
    }
    const home = process.env.CLAUDE_CONFIG_DIR;
    const base = home && home.trim() ? home.trim() : path.join(os.homedir(), ".claude");
    return path.join(base, CREDENTIAL_FILES.claude);
}

function getStatePath(configPath: string | null): string {
    return path.join(getVaultRoot(configPath), "state.json");
}

export function readVaultState(configPath: string | null): VaultState {
    const statePath = getStatePath(configPath);
    if (!fs.existsSync(statePath)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as VaultState;
    } catch {
        return {};
    }
}

export function writeVaultState(configPath: string | null, state: VaultState): void {
    const statePath = getStatePath(configPath);
    ensureDir(path.dirname(statePath));
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getTypeState(state: VaultState, type: ProfileType): VaultTypeState {
    const entry = state[type];
    if (!entry || typeof entry !== "object") return defaultTypeState();
    return {
        activeKey: typeof entry.activeKey === "string" ? entry.activeKey : null,
        mode: entry.mode === "copy" ? "copy" : "link",
        checkoutHash:
            typeof entry.checkoutHash === "string" ? entry.checkoutHash : null,
    };
}

function hashFile(filePath: string): string | null {
    try {
        const buf = fs.readFileSync(filePath);
        return crypto.createHash("sha256").update(buf).digest("hex");
    } catch {
        return null;
    }
}

function lstatOrNull(filePath: string): fs.Stats | null {
    try {
        return fs.lstatSync(filePath);
    } catch {
        return null;
    }
}

/** True when `live` is a symlink pointing inside our vault. */
function readVaultLinkTarget(
    live: string,
    vaultRoot: string
): string | null {
    const stat = lstatOrNull(live);
    if (!stat || !stat.isSymbolicLink()) return null;
    let target: string;
    try {
        target = fs.readlinkSync(live);
    } catch {
        return null;
    }
    const resolved = path.resolve(path.dirname(live), target);
    const rel = path.relative(vaultRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return resolved;
}

function copyCredential(from: string, to: string): void {
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
    try {
        fs.chmodSync(to, CREDENTIAL_MODE);
    } catch {
        // best effort; the copy itself is what matters
    }
}

function replaceWithSymlink(live: string, target: string): void {
    ensureDir(path.dirname(live));
    const tmp = `${live}.codenv-tmp-${process.pid}`;
    try {
        fs.unlinkSync(tmp);
    } catch {
        // nothing to clean up
    }
    fs.symlinkSync(target, tmp);
    fs.renameSync(tmp, live);
}

/**
 * Bring the live credential path back in sync with the vault before a switch.
 *
 * Detects a symlink that a tool replaced with a regular file, archives that
 * file into the profile it belonged to, and degrades the type to copy mode.
 * In copy mode it checks the live file back in when it changed since checkout.
 */
export function reconcileVault(
    configPath: string | null,
    type: ProfileType
): ReconcileReport {
    const state = readVaultState(configPath);
    const entry = getTypeState(state, type);
    const live = getLiveCredentialPath(type);
    const vaultRoot = getVaultRoot(configPath);
    const report: ReconcileReport = {
        mode: entry.mode,
        degraded: false,
        recoveredKey: null,
        checkedInKey: null,
    };

    const stat = lstatOrNull(live);

    if (entry.mode === "link") {
        if (!stat) return report;
        if (readVaultLinkTarget(live, vaultRoot)) return report;
        if (stat.isSymbolicLink()) return report; // someone else's symlink; leave it
        if (!entry.activeKey) return report; // native file we never adopted

        // Our symlink was replaced by an atomic write. The content is the
        // active profile's freshest credential, so archive it there.
        copyCredential(live, getVaultCredentialPath(configPath, type, entry.activeKey));
        entry.mode = "copy";
        report.mode = "copy";
        report.degraded = true;
        report.recoveredKey = entry.activeKey;
        state[type] = entry;
        writeVaultState(configPath, state);
        return report;
    }

    // copy mode: check the live file back in if it changed since checkout
    if (!entry.activeKey || !stat || !stat.isFile()) return report;
    const currentHash = hashFile(live);
    if (!currentHash || currentHash === entry.checkoutHash) return report;
    copyCredential(live, getVaultCredentialPath(configPath, type, entry.activeKey));
    entry.checkoutHash = currentHash;
    report.checkedInKey = entry.activeKey;
    state[type] = entry;
    writeVaultState(configPath, state);
    return report;
}

/**
 * Point the live credential path at `profileKey`'s vault file.
 *
 * Refuses to clobber a regular credential file that codenv never created, so
 * an un-migrated native login is never destroyed by a first switch.
 */
export function checkoutVault(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): VaultMode {
    reconcileVault(configPath, type);
    const state = readVaultState(configPath);
    const entry = getTypeState(state, type);
    const live = getLiveCredentialPath(type);
    const vaultPath = getVaultCredentialPath(configPath, type, profileKey);
    ensureDir(path.dirname(vaultPath));

    const stat = lstatOrNull(live);
    const isAdopted =
        Boolean(entry.activeKey) ||
        Boolean(readVaultLinkTarget(live, getVaultRoot(configPath)));
    if (stat && stat.isFile() && !stat.isSymbolicLink() && !isAdopted) {
        throw new Error(
            `Refusing to overwrite existing ${live}. ` +
            `Run \`codenv migrate ${type}\` to move it into a profile ` +
            `(or \`codenv adopt ${type} <name>\` to pick the profile yourself).`
        );
    }

    if (entry.mode === "link") {
        replaceWithSymlink(live, vaultPath);
        entry.checkoutHash = null;
    } else {
        if (fs.existsSync(vaultPath)) {
            copyCredential(vaultPath, live);
        } else {
            try {
                fs.unlinkSync(live);
            } catch {
                // already absent
            }
        }
        entry.checkoutHash = hashFile(live);
    }

    entry.activeKey = profileKey;
    state[type] = entry;
    writeVaultState(configPath, state);
    return entry.mode;
}

/**
 * Overwrite a profile's vault file with content codenv derives from config.
 *
 * Identical content is skipped: `codenv auto` re-derives the active profile on
 * every interactive shell start, and rewriting a credential file that has not
 * changed only churns its mtime.
 */
export function writeVaultCredential(
    configPath: string | null,
    type: ProfileType,
    profileKey: string,
    content: string | null
): void {
    const vaultPath = getVaultCredentialPath(configPath, type, profileKey);
    if (content === null) {
        if (!fs.existsSync(vaultPath)) return;
        try {
            fs.unlinkSync(vaultPath);
        } catch {
            // already absent
        }
        return;
    }
    let current: string | null;
    try {
        current = fs.readFileSync(vaultPath, "utf8");
    } catch {
        current = null;
    }
    if (current === content) return;
    ensureDir(path.dirname(vaultPath));
    fs.writeFileSync(vaultPath, content, { encoding: "utf8", mode: CREDENTIAL_MODE });
}

export function readVaultCredential(
    configPath: string | null,
    type: ProfileType,
    profileKey: string
): string | null {
    const vaultPath = getVaultCredentialPath(configPath, type, profileKey);
    try {
        return fs.readFileSync(vaultPath, "utf8");
    } catch {
        return null;
    }
}

/** True when the live path is already a symlink codenv owns. */
export function isManagedLive(configPath: string | null, type: ProfileType): boolean {
    return Boolean(
        readVaultLinkTarget(getLiveCredentialPath(type), getVaultRoot(configPath))
    );
}

export function describeLive(configPath: string | null, type: ProfileType): string {
    const live = getLiveCredentialPath(type);
    const stat = lstatOrNull(live);
    if (!stat) return "missing";
    if (stat.isSymbolicLink()) {
        return readVaultLinkTarget(live, getVaultRoot(configPath))
            ? "managed symlink"
            : "foreign symlink";
    }
    return "regular file";
}

/**
 * Move the credential file sitting at the live path into `profileKey`'s vault
 * and replace it with a symlink, so an existing login is captured rather than
 * guessed at or destroyed. `transform` lets a caller strip fields first.
 */
export function adoptLiveCredential(
    configPath: string | null,
    type: ProfileType,
    profileKey: string,
    transform?: (text: string) => string
): void {
    const live = getLiveCredentialPath(type);
    const stat = lstatOrNull(live);
    if (!stat) {
        throw new Error(`No credential file at ${live} to adopt.`);
    }
    if (stat.isSymbolicLink()) {
        if (readVaultLinkTarget(live, getVaultRoot(configPath))) {
            throw new Error(`${live} is already managed by codenv.`);
        }
        throw new Error(`${live} is a symlink codenv does not own; resolve it manually.`);
    }

    const raw = fs.readFileSync(live, "utf8");
    const content = transform ? transform(raw) : raw;
    writeVaultCredential(configPath, type, profileKey, content);

    fs.unlinkSync(live);
    const state = readVaultState(configPath);
    const entry = getTypeState(state, type);
    if (entry.mode === "link") {
        replaceWithSymlink(live, getVaultCredentialPath(configPath, type, profileKey));
        entry.checkoutHash = null;
    } else {
        copyCredential(getVaultCredentialPath(configPath, type, profileKey), live);
        entry.checkoutHash = hashFile(live);
    }
    entry.activeKey = profileKey;
    state[type] = entry;
    writeVaultState(configPath, state);
}

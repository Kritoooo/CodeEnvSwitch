/**
 * Launch codex/claude with session binding
 */
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import type { Config, ProfileType } from "../types";
import { CODEX_AUTH_PATH } from "../constants";
import { normalizeType } from "../profile/type";
import {
    getCodexSessionsPath,
    getClaudeSessionsPath,
    logProfileUse,
    logSessionBinding,
    readSessionBindingIndex,
} from "../usage";
import { ensureClaudeStatusline } from "../statusline/claude";
import { ensureCodexStatuslineConfig } from "../statusline/codex";

const SESSION_BINDING_POLL_MS = 1000;
const SESSION_BINDING_START_GRACE_MS = 5000;

interface SessionMeta {
    filePath: string;
    sessionId: string | null;
    timestamp: string | null;
    fileTimestampMs: number | null;
    cwd: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSessionFiles(root: string | null): string[] {
    if (!root || !fs.existsSync(root)) return [];
    const files: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                files.push(full);
            }
        }
    }
    return files;
}

function readFirstJsonLine(filePath: string): unknown | null {
    let fd: number | null = null;
    try {
        fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(64 * 1024);
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (bytes <= 0) return null;
        const text = buffer.slice(0, bytes).toString("utf8");
        const line = text.split(/\r?\n/)[0];
        if (!line) return null;
        return JSON.parse(line);
    } catch {
        return null;
    } finally {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch {
                // ignore
            }
        }
    }
}

function parseCodexFilenameInfo(filePath: string): {
    timestamp: string | null;
    timestampMs: number | null;
    sessionId: string | null;
} {
    const base = path.basename(filePath);
    const match = base.match(
        /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-([0-9a-fA-F-]+)\.jsonl$/
    );
    if (!match) {
        return { timestamp: null, timestampMs: null, sessionId: null };
    }
    const [, date, hour, minute, second, sessionId] = match;
    const timestamp = `${date}T${hour}:${minute}:${second}`;
    const parsedMs = new Date(timestamp).getTime();
    return {
        timestamp,
        timestampMs: Number.isNaN(parsedMs) ? null : parsedMs,
        sessionId: sessionId ? String(sessionId) : null,
    };
}

function readSessionMeta(filePath: string, type: ProfileType): SessionMeta | null {
    const first = readFirstJsonLine(filePath);
    if (!isRecord(first)) return null;
    if (type === "codex") {
        const fromName = parseCodexFilenameInfo(filePath);
        const payload = isRecord(first.payload) ? first.payload : null;
        const ts = payload && payload.timestamp ? payload.timestamp : first.timestamp;
        const timestamp = ts ? String(ts) : fromName.timestamp;
        return {
            filePath,
            sessionId:
                payload && payload.id
                    ? String(payload.id)
                    : fromName.sessionId
                    ? String(fromName.sessionId)
                    : null,
            timestamp,
            fileTimestampMs: fromName.timestampMs,
            cwd: payload && payload.cwd ? String(payload.cwd) : null,
        };
    }
    return {
        filePath,
        sessionId: first.sessionId ? String(first.sessionId) : null,
        timestamp: first.timestamp ? String(first.timestamp) : null,
        fileTimestampMs: null,
        cwd: first.cwd ? String(first.cwd) : null,
    };
}

function getSessionCandidateTimestamp(meta: SessionMeta, stat: fs.Stats): number | null {
    const times: number[] = [];
    if (Number.isFinite(stat.mtimeMs)) times.push(stat.mtimeMs);
    if (meta.timestamp) {
        const tsMs = new Date(meta.timestamp).getTime();
        if (Number.isFinite(tsMs)) times.push(tsMs);
    }
    if (Number.isFinite(meta.fileTimestampMs)) times.push(meta.fileTimestampMs);
    if (times.length === 0) return null;
    return Math.max(...times);
}

function findLatestUnboundSessionMeta(
    root: string | null,
    type: ProfileType,
    bound: { byFile: Set<string>; byId: Set<string> },
    minTimestampMs: number | null,
    cwd: string | null,
    skipFiles: Set<string> | null
): SessionMeta | null {
    const files = collectSessionFiles(root);
    let bestMeta: SessionMeta | null = null;
    let bestTs = Number.NEGATIVE_INFINITY;
    let bestCwdMatch = false;

    for (const filePath of files) {
        if (bound.byFile.has(filePath)) continue;
        if (skipFiles && skipFiles.has(filePath)) continue;
        let stat: fs.Stats | null = null;
        try {
            stat = fs.statSync(filePath);
        } catch {
            continue;
        }
        if (!stat || !stat.isFile()) continue;
        const meta =
            readSessionMeta(filePath, type) || {
                filePath,
                sessionId: null,
                timestamp: null,
                fileTimestampMs: null,
                cwd: null,
            };
        if (meta.sessionId && bound.byId.has(meta.sessionId)) continue;
        const tsMs = getSessionCandidateTimestamp(meta, stat);
        if (tsMs === null || Number.isNaN(tsMs)) continue;
        if (minTimestampMs !== null && tsMs < minTimestampMs) continue;
        const cwdMatch = Boolean(cwd && meta.cwd && meta.cwd === cwd);
        if (
            !bestMeta ||
            (cwdMatch && !bestCwdMatch) ||
            (cwdMatch === bestCwdMatch && tsMs > bestTs)
        ) {
            bestMeta = meta;
            bestTs = tsMs;
            bestCwdMatch = cwdMatch;
        }
    }

    return bestMeta;
}

function getProfileEnv(type: ProfileType): { key: string | null; name: string | null } {
    const suffix = type.toUpperCase();
    const key = process.env[`CODE_ENV_PROFILE_KEY_${suffix}`] || null;
    const name = process.env[`CODE_ENV_PROFILE_NAME_${suffix}`] || key;
    return { key, name };
}

function writeCodexAuthFromEnv(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    try {
        fs.mkdirSync(path.dirname(CODEX_AUTH_PATH), { recursive: true });
    } catch {
        // ignore
    }
    const authJson =
        apiKey === null || apiKey === undefined || apiKey === ""
            ? "null"
            : JSON.stringify({ OPENAI_API_KEY: String(apiKey) });
    try {
        fs.writeFileSync(CODEX_AUTH_PATH, `${authJson}\n`, "utf8");
    } catch {
        // ignore
    }
}

function parseBooleanEnv(value: string | undefined): boolean | null {
    if (value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
}

function isStatuslineEnabled(type: ProfileType): boolean {
    if (!process.stdout.isTTY || process.env.TERM === "dumb") return false;
    const disable = parseBooleanEnv(process.env.CODE_ENV_STATUSLINE_DISABLE);
    if (disable === true) return false;
    const typeFlag = parseBooleanEnv(
        process.env[`CODE_ENV_STATUSLINE_${type.toUpperCase()}`]
    );
    if (typeFlag !== null) return typeFlag;
    const genericFlag = parseBooleanEnv(process.env.CODE_ENV_STATUSLINE);
    if (genericFlag !== null) return genericFlag;
    return true;
}

async function ensureClaudeStatuslineConfig(
    config: Config,
    enabled: boolean
): Promise<void> {
    await ensureClaudeStatusline(config, enabled);
}

export async function runLaunch(
    config: Config,
    configPath: string | null,
    target: string,
    args: string[]
): Promise<number> {
    const type = normalizeType(target);
    if (!type) {
        throw new Error(`Unknown launch target: ${target}`);
    }
    if (type === "codex") {
        writeCodexAuthFromEnv();
    }

    const { key: profileKey, name: profileName } = getProfileEnv(type);
    const terminalTag = process.env.CODE_ENV_TERMINAL_TAG || null;
    const cwd = process.cwd();
    const startMs = Date.now();
    const minBindingTimestampMs = startMs - SESSION_BINDING_START_GRACE_MS;
    const sessionRoot =
        type === "codex" ? getCodexSessionsPath(config) : getClaudeSessionsPath(config);
    const initialBindingIndex = readSessionBindingIndex(config, configPath);
    const initialUnboundFiles = new Set<string>();
    for (const filePath of collectSessionFiles(sessionRoot)) {
        if (!initialBindingIndex.byFile.has(filePath)) {
            initialUnboundFiles.add(filePath);
        }
    }

    const statuslineEnabled = isStatuslineEnabled(type);
    if (type === "claude") {
        await ensureClaudeStatuslineConfig(config, statuslineEnabled);
    } else if (type === "codex") {
        await ensureCodexStatuslineConfig(config, statuslineEnabled);
    }
    if (profileKey) {
        logProfileUse(config, configPath, profileKey, type, terminalTag, cwd);
    }
    const child = spawn(target, args, { stdio: "inherit", env: process.env });
    const canBindSession = Boolean(profileKey || profileName);
    let boundSession: SessionMeta | null = null;
    let bindingTimer: NodeJS.Timeout | null = null;

    const tryBindSession = () => {
        if (!canBindSession || boundSession) return;
        const bindingIndex = readSessionBindingIndex(config, configPath);
        const candidate = findLatestUnboundSessionMeta(
            sessionRoot,
            type,
            bindingIndex,
            minBindingTimestampMs,
            cwd,
            initialUnboundFiles
        );
        if (!candidate) return;
        boundSession = candidate;
        logSessionBinding(
            config,
            configPath,
            type,
            profileKey,
            profileName,
            terminalTag,
            cwd,
            boundSession.filePath,
            boundSession.sessionId,
            boundSession.timestamp
        );
        if (bindingTimer) {
            clearInterval(bindingTimer);
            bindingTimer = null;
        }
    };

    if (canBindSession) {
        tryBindSession();
        bindingTimer = setInterval(tryBindSession, SESSION_BINDING_POLL_MS);
    }

    const forwardSignal = (signal: NodeJS.Signals) => {
        try {
            child.kill(signal);
        } catch {
            // ignore
        }
    };
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);

    const exitCode = await new Promise<number>((resolve) => {
        child.on("error", (err) => {
            process.off("SIGINT", forwardSignal);
            process.off("SIGTERM", forwardSignal);
            if (bindingTimer) {
                clearInterval(bindingTimer);
                bindingTimer = null;
            }
            console.error(`codenv: failed to launch ${target}: ${err.message}`);
            resolve(1);
        });
        child.on("exit", (code, signal) => {
            process.off("SIGINT", forwardSignal);
            process.off("SIGTERM", forwardSignal);
            if (bindingTimer) {
                clearInterval(bindingTimer);
                bindingTimer = null;
            }
            const bindingIndex = readSessionBindingIndex(config, configPath);
            const sessionMeta = findLatestUnboundSessionMeta(
                sessionRoot,
                type,
                bindingIndex,
                minBindingTimestampMs,
                cwd,
                initialUnboundFiles
            );
            if (!boundSession && sessionMeta && (profileKey || profileName)) {
                logSessionBinding(
                    config,
                    configPath,
                    type,
                    profileKey,
                    profileName,
                    terminalTag,
                    cwd,
                    sessionMeta.filePath,
                    sessionMeta.sessionId,
                    sessionMeta.timestamp
                );
            }
            if (typeof code === "number") {
                resolve(code);
                return;
            }
            if (signal) {
                resolve(1);
                return;
            }
            resolve(0);
        });
    });

    return exitCode;
}

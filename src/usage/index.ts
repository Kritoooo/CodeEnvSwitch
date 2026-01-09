/**
 * Usage tracking utilities
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Config, ProfileType } from "../types";
import { resolvePath } from "../shell/utils";
import { normalizeType, inferProfileType, getProfileDisplayName } from "../profile/type";

interface UsageRecord {
    ts: string;
    type: string;
    profileKey: string | null;
    profileName: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

interface UsageTotals {
    today: number;
    total: number;
}

interface UsageTotalsIndex {
    byKey: Map<string, UsageTotals>;
    byName: Map<string, UsageTotals>;
}

interface UsageStateEntry {
    mtimeMs: number;
    size: number;
    type: ProfileType;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    startTs: string | null;
    endTs: string | null;
    cwd: string | null;
}

interface UsageStateFile {
    version: number;
    files: Record<string, UsageStateEntry>;
}

interface ProfileLogEntry {
    kind: "use" | "session";
    timestamp: string;
    profileKey: string | null;
    profileName: string | null;
    profileType: ProfileType | null;
    configPath: string | null;
    terminalTag: string | null;
    cwd: string | null;
    sessionFile: string | null;
    sessionId: string | null;
}

interface ProfileMatch {
    profileKey: string | null;
    profileName: string | null;
}

interface ProfileResolveResult {
    match: ProfileMatch | null;
    ambiguous: boolean;
}

interface SessionStats {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    startTs: string | null;
    endTs: string | null;
    cwd: string | null;
    sessionId: string | null;
}

function resolveDefaultConfigDir(configPath: string | null): string {
    if (configPath) return path.dirname(configPath);
    return path.join(os.homedir(), ".config", "code-env");
}

export function getUsagePath(config: Config, configPath: string | null): string | null {
    if (config && config.usagePath) return resolvePath(config.usagePath);
    const baseDir = resolveDefaultConfigDir(configPath);
    return path.join(baseDir, "usage.jsonl");
}

export function getUsageStatePath(usagePath: string, config: Config): string {
    if (config && config.usageStatePath) return resolvePath(config.usageStatePath)!;
    return `${usagePath}.state.json`;
}

export function getProfileLogPath(config: Config, configPath: string | null): string {
    if (config && config.profileLogPath) return resolvePath(config.profileLogPath)!;
    const baseDir = resolveDefaultConfigDir(configPath);
    return path.join(baseDir, "profile-log.jsonl");
}

export function getCodexSessionsPath(config: Config): string | null {
    if (config && config.codexSessionsPath) return resolvePath(config.codexSessionsPath);
    if (process.env.CODEX_HOME) {
        return path.join(process.env.CODEX_HOME, "sessions");
    }
    return path.join(os.homedir(), ".codex", "sessions");
}

export function getClaudeSessionsPath(config: Config): string | null {
    if (config && config.claudeSessionsPath) return resolvePath(config.claudeSessionsPath);
    if (process.env.CLAUDE_HOME) {
        return path.join(process.env.CLAUDE_HOME, "projects");
    }
    return path.join(os.homedir(), ".claude", "projects");
}

export function formatTokenCount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    if (value < 1000) return `${Math.round(value)}`;
    if (value < 1_000_000) return `${(value / 1000).toFixed(2)}K`;
    if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    return `${(value / 1_000_000_000).toFixed(2)}B`;
}

export function buildUsageTotals(records: UsageRecord[]): UsageTotalsIndex {
    const byKey = new Map<string, UsageTotals>();
    const byName = new Map<string, UsageTotals>();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const tomorrowStartMs = tomorrowStart.getTime();

    const isToday = (ts: string) => {
        if (!ts) return false;
        const time = new Date(ts).getTime();
        if (Number.isNaN(time)) return false;
        return time >= todayStartMs && time < tomorrowStartMs;
    };

    const addTotals = (map: Map<string, UsageTotals>, key: string, amount: number, ts: string) => {
        if (!key) return;
        const current = map.get(key) || { today: 0, total: 0 };
        current.total += amount;
        if (isToday(ts)) current.today += amount;
        map.set(key, current);
    };

    for (const record of records) {
        const type = normalizeUsageType(record.type) || "";
        const total = Number(record.totalTokens || 0);
        if (!Number.isFinite(total)) continue;
        if (record.profileKey) {
            addTotals(byKey, `${type}||${record.profileKey}`, total, record.ts);
        }
        if (record.profileName) {
            addTotals(byName, `${type}||${record.profileName}`, total, record.ts);
        }
    }

    return { byKey, byName };
}

function normalizeUsageType(type: string | null | undefined): string | null {
    if (!type) return null;
    const normalized = normalizeType(type);
    if (normalized) return normalized;
    const trimmed = String(type).trim();
    return trimmed ? trimmed : null;
}

function buildUsageLookupKey(
    type: string | null | undefined,
    profileId: string | null | undefined
): string | null {
    if (!profileId) return null;
    const resolvedType = normalizeUsageType(type);
    if (!resolvedType) return null;
    return `${resolvedType}||${profileId}`;
}

export function readUsageTotalsIndex(
    config: Config,
    configPath: string | null,
    syncUsage: boolean
): UsageTotalsIndex | null {
    const usagePath = getUsagePath(config, configPath);
    if (!usagePath) return null;
    if (syncUsage) {
        syncUsageFromSessions(config, configPath, usagePath);
    }
    const records = readUsageRecords(usagePath);
    if (records.length === 0) return null;
    return buildUsageTotals(records);
}

export function resolveUsageTotalsForProfile(
    totals: UsageTotalsIndex,
    type: string | null,
    profileKey: string | null,
    profileName: string | null
): UsageTotals | null {
    const keyLookup = buildUsageLookupKey(type, profileKey);
    const nameLookup = buildUsageLookupKey(type, profileName);
    return (
        (keyLookup && totals.byKey.get(keyLookup)) ||
        (nameLookup && totals.byName.get(nameLookup)) ||
        null
    );
}

export function logProfileUse(
    config: Config,
    configPath: string | null,
    profileKey: string,
    requestedType: ProfileType | null,
    terminalTag: string | null,
    cwd: string | null
): void {
    const profile = config.profiles && config.profiles[profileKey];
    if (!profile) return;
    const inferred = inferProfileType(profileKey, profile, requestedType);
    if (!inferred) return;
    const displayName = getProfileDisplayName(profileKey, profile, requestedType || inferred);
    appendProfileLogEntry(
        config,
        configPath,
        profileKey,
        displayName || profileKey,
        inferred,
        terminalTag,
        cwd,
        "use",
        null,
        null,
        null
    );
}

export function logSessionBinding(
    config: Config,
    configPath: string | null,
    profileType: ProfileType,
    profileKey: string | null,
    profileName: string | null,
    terminalTag: string | null,
    cwd: string | null,
    sessionFile: string | null,
    sessionId: string | null,
    sessionTimestamp: string | null
): void {
    if (!profileKey && !profileName) return;
    const key = profileKey ? String(profileKey) : "unknown";
    const name = profileName ? String(profileName) : key;
    appendProfileLogEntry(
        config,
        configPath,
        key,
        name,
        profileType,
        terminalTag,
        cwd,
        "session",
        sessionFile,
        sessionId,
        sessionTimestamp
    );
}

function appendProfileLogEntry(
    config: Config,
    configPath: string | null,
    profileKey: string,
    profileName: string,
    profileType: ProfileType,
    terminalTag: string | null,
    cwd: string | null,
    kind: "use" | "session",
    sessionFile: string | null,
    sessionId: string | null,
    timestamp: string | null
) {
    const logPath = getProfileLogPath(config, configPath);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const record = {
        timestamp: timestamp || new Date().toISOString(),
        kind,
        profileKey,
        profileName,
        profileType,
        configPath: configPath || null,
        terminalTag: terminalTag || null,
        cwd: cwd || null,
        sessionFile: sessionFile || null,
        sessionId: sessionId || null,
    };
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function readProfileLogEntries(paths: string[]): ProfileLogEntry[] {
    const entries: ProfileLogEntry[] = [];
    for (const logPath of paths) {
        if (!logPath || !fs.existsSync(logPath)) continue;
        const raw = fs.readFileSync(logPath, "utf8");
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (!parsed || typeof parsed !== "object") continue;
                const rawKind = parsed.kind ? String(parsed.kind).toLowerCase() : "";
                const kind = rawKind === "session" ? "session" : "use";
                entries.push({
                    kind,
                    timestamp: String(parsed.timestamp ?? ""),
                    profileKey: parsed.profileKey ? String(parsed.profileKey) : null,
                    profileName: parsed.profileName ? String(parsed.profileName) : null,
                    profileType: normalizeType(parsed.profileType) || null,
                    configPath: parsed.configPath ? String(parsed.configPath) : null,
                    terminalTag: parsed.terminalTag ? String(parsed.terminalTag) : null,
                    cwd: parsed.cwd ? String(parsed.cwd) : null,
                    sessionFile: parsed.sessionFile ? String(parsed.sessionFile) : null,
                    sessionId: parsed.sessionId ? String(parsed.sessionId) : null,
                });
            } catch {
                // ignore invalid lines
            }
        }
    }
    return entries;
}

export function readSessionBindingIndex(
    config: Config,
    configPath: string | null
): { byFile: Set<string>; byId: Set<string> } {
    const profileLogPath = getProfileLogPath(config, configPath);
    const entries = readProfileLogEntries([profileLogPath]);
    const byFile = new Set<string>();
    const byId = new Set<string>();
    for (const entry of entries) {
        if (entry.kind !== "session") continue;
        if (entry.sessionFile) byFile.add(entry.sessionFile);
        if (entry.sessionId) byId.add(entry.sessionId);
    }
    return { byFile, byId };
}

function normalizeProfileMatch(
    config: Config,
    entry: ProfileLogEntry,
    type: ProfileType
): ProfileMatch {
    const profileKey = entry.profileKey;
    let profileName = entry.profileName;
    if (profileKey && config.profiles && config.profiles[profileKey]) {
        profileName = getProfileDisplayName(
            profileKey,
            config.profiles[profileKey],
            type
        );
    }
    if (!profileName && profileKey) profileName = profileKey;
    return { profileKey, profileName };
}

function resolveUniqueProfileMatch(
    config: Config,
    entries: ProfileLogEntry[],
    type: ProfileType
): ProfileResolveResult {
    const uniqueProfiles = new Map<string, ProfileLogEntry>();
    for (const entry of entries) {
        const id = entry.profileKey || entry.profileName || "";
        if (!id) continue;
        if (!uniqueProfiles.has(id)) uniqueProfiles.set(id, entry);
    }
    if (uniqueProfiles.size === 0) return { match: null, ambiguous: false };
    if (uniqueProfiles.size !== 1) return { match: null, ambiguous: true };
    const best = Array.from(uniqueProfiles.values())[0];
    return { match: normalizeProfileMatch(config, best, type), ambiguous: false };
}

function resolveProfileForSession(
    config: Config,
    logEntries: ProfileLogEntry[],
    type: ProfileType,
    sessionFile: string | null,
    sessionId: string | null
): ProfileResolveResult {
    const sessionEntries = logEntries.filter(
        (entry) => entry.kind === "session" && entry.profileType === type
    );

    if (sessionFile) {
        const matches = sessionEntries.filter(
            (entry) => entry.sessionFile && entry.sessionFile === sessionFile
        );
        if (matches.length > 0) {
            const resolved = resolveUniqueProfileMatch(config, matches, type);
            if (resolved.match || resolved.ambiguous) return resolved;
        }
    }

    if (sessionId) {
        const matches = sessionEntries.filter(
            (entry) => entry.sessionId && entry.sessionId === sessionId
        );
        if (matches.length > 0) {
            const resolved = resolveUniqueProfileMatch(config, matches, type);
            if (resolved.match || resolved.ambiguous) return resolved;
        }
    }

    return { match: null, ambiguous: false };
}

function readUsageState(statePath: string): UsageStateFile {
    if (!statePath || !fs.existsSync(statePath)) {
        return { version: 1, files: {} };
    }
    try {
        const raw = fs.readFileSync(statePath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { version: 1, files: {} };
        }
        const files =
            parsed.files && typeof parsed.files === "object" ? parsed.files : {};
        return { version: 1, files };
    } catch {
        return { version: 1, files: {} };
    }
}

function writeUsageState(statePath: string, state: UsageStateFile) {
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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

function updateMinMaxTs(
    current: { start: string | null; end: string | null },
    ts: string
) {
    if (!ts) return;
    const time = new Date(ts).getTime();
    if (Number.isNaN(time)) return;
    if (!current.start || new Date(current.start).getTime() > time) {
        current.start = ts;
    }
    if (!current.end || new Date(current.end).getTime() < time) {
        current.end = ts;
    }
}

function parseCodexSessionFile(filePath: string): SessionStats {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    let maxTotal = 0;
    let maxInput = 0;
    let maxOutput = 0;
    let hasTotal = false;
    let sumLast = 0;
    let sumLastInput = 0;
    let sumLastOutput = 0;
    const tsRange = { start: null as string | null, end: null as string | null };
    let cwd: string | null = null;
    let sessionId: string | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== "object") continue;
            if (parsed.timestamp) updateMinMaxTs(tsRange, String(parsed.timestamp));
            if (!cwd && parsed.type === "session_meta") {
                const payload = parsed.payload || {};
                if (payload && payload.cwd) cwd = String(payload.cwd);
                if (!sessionId && payload && payload.id) {
                    sessionId = String(payload.id);
                }
            }
            if (!cwd && parsed.type === "turn_context") {
                const payload = parsed.payload || {};
                if (payload && payload.cwd) cwd = String(payload.cwd);
            }
            if (parsed.type !== "event_msg") continue;
            const payload = parsed.payload;
            if (!payload || payload.type !== "token_count") continue;
            const info = payload.info || {};
            const totalUsage = info.total_token_usage || {};
            const lastUsage = info.last_token_usage || {};
            const totalTokens = Number(totalUsage.total_tokens);
            if (Number.isFinite(totalTokens)) {
                hasTotal = true;
                if (totalTokens > maxTotal) maxTotal = totalTokens;
                const totalInput = Number(totalUsage.input_tokens);
                const totalOutput = Number(totalUsage.output_tokens);
                if (Number.isFinite(totalInput) && totalInput > maxInput) {
                    maxInput = totalInput;
                }
                if (Number.isFinite(totalOutput) && totalOutput > maxOutput) {
                    maxOutput = totalOutput;
                }
            } else {
                const lastTokens = Number(lastUsage.total_tokens);
                if (Number.isFinite(lastTokens)) sumLast += lastTokens;
                const lastInput = Number(lastUsage.input_tokens);
                const lastOutput = Number(lastUsage.output_tokens);
                if (Number.isFinite(lastInput)) sumLastInput += lastInput;
                if (Number.isFinite(lastOutput)) sumLastOutput += lastOutput;
            }
        } catch {
            // ignore invalid lines
        }
    }

    if (!hasTotal) {
        maxTotal = sumLast;
        maxInput = sumLastInput;
        maxOutput = sumLastOutput;
    }

    return {
        inputTokens: maxInput,
        outputTokens: maxOutput,
        totalTokens: maxTotal,
        startTs: tsRange.start,
        endTs: tsRange.end,
        cwd,
        sessionId,
    };
}

function parseClaudeSessionFile(filePath: string): SessionStats {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const tsRange = { start: null as string | null, end: null as string | null };
    let cwd: string | null = null;
    let sessionId: string | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== "object") continue;
            if (parsed.timestamp) updateMinMaxTs(tsRange, String(parsed.timestamp));
            if (!cwd && parsed.cwd) cwd = String(parsed.cwd);
            if (!sessionId && parsed.sessionId) {
                sessionId = String(parsed.sessionId);
            }
            const message = parsed.message;
            const usage = message && message.usage ? message.usage : null;
            if (!usage) continue;
            const input = Number(usage.input_tokens ?? 0);
            const output = Number(usage.output_tokens ?? 0);
            const cacheCreate = Number(usage.cache_creation_input_tokens ?? 0);
            const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
            if (Number.isFinite(input)) inputTokens += input;
            if (Number.isFinite(output)) outputTokens += output;
            totalTokens +=
                (Number.isFinite(input) ? input : 0) +
                (Number.isFinite(output) ? output : 0) +
                (Number.isFinite(cacheCreate) ? cacheCreate : 0) +
                (Number.isFinite(cacheRead) ? cacheRead : 0);
        } catch {
            // ignore invalid lines
        }
    }

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        startTs: tsRange.start,
        endTs: tsRange.end,
        cwd,
        sessionId,
    };
}

const LOCK_STALE_MS = 10 * 60 * 1000;

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        return code === "EPERM";
    }
}

function readLockInfo(lockPath: string): { pid: number | null; timestampMs: number | null } {
    try {
        const raw = fs.readFileSync(lockPath, "utf8");
        const lines = raw.split(/\r?\n/);
        const pid = Number(lines[0] || "");
        const ts = lines[1] ? new Date(lines[1]).getTime() : Number.NaN;
        return {
            pid: Number.isFinite(pid) && pid > 0 ? pid : null,
            timestampMs: Number.isFinite(ts) ? ts : null,
        };
    } catch {
        return { pid: null, timestampMs: null };
    }
}

function isLockStale(lockPath: string): boolean {
    const info = readLockInfo(lockPath);
    if (info.pid !== null) {
        return !isProcessAlive(info.pid);
    }
    if (info.timestampMs !== null) {
        return Date.now() - info.timestampMs > LOCK_STALE_MS;
    }
    return true;
}

function acquireLock(lockPath: string) {
    const dir = path.dirname(lockPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const attemptAcquire = () => {
        try {
            const fd = fs.openSync(lockPath, "wx");
            fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
            return fd;
        } catch (err) {
            const code = (err as NodeJS.ErrnoException | undefined)?.code;
            if (code !== "EEXIST") return null;
        }
        return null;
    };

    const fd = attemptAcquire();
    if (fd !== null) return fd;
    if (!isLockStale(lockPath)) return null;
    try {
        fs.unlinkSync(lockPath);
    } catch {
        return null;
    }
    return attemptAcquire();
}

function releaseLock(lockPath: string, fd: number | null) {
    if (fd === null) return;
    try {
        fs.closeSync(fd);
    } catch {
        // ignore
    }
    try {
        fs.unlinkSync(lockPath);
    } catch {
        // ignore
    }
}

function appendUsageRecord(usagePath: string, record: UsageRecord) {
    const dir = path.dirname(usagePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(usagePath, `${JSON.stringify(record)}\n`, "utf8");
}

export function readUsageRecords(usagePath: string): UsageRecord[] {
    if (!usagePath || !fs.existsSync(usagePath)) return [];
    const raw = fs.readFileSync(usagePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const records: UsageRecord[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== "object") continue;
            const input = Number(parsed.inputTokens ?? 0);
            const output = Number(parsed.outputTokens ?? 0);
            const total = Number(parsed.totalTokens ?? input + output);
            const type = normalizeType(parsed.type) || String(parsed.type ?? "unknown");
            records.push({
                ts: String(parsed.ts ?? ""),
                type,
                profileKey: parsed.profileKey ? String(parsed.profileKey) : null,
                profileName: parsed.profileName ? String(parsed.profileName) : null,
                inputTokens: Number.isFinite(input) ? input : 0,
                outputTokens: Number.isFinite(output) ? output : 0,
                totalTokens: Number.isFinite(total) ? total : 0,
            });
        } catch {
            // ignore invalid lines
        }
    }
    return records;
}

export function syncUsageFromSessions(
    config: Config,
    configPath: string | null,
    usagePath: string
) {
    const statePath = getUsageStatePath(usagePath, config);
    const lockPath = `${statePath}.lock`;
    const lockFd = acquireLock(lockPath);
    if (lockFd === null) return;
    try {
        const profileLogPath = getProfileLogPath(config, configPath);
        const logEntries = readProfileLogEntries([profileLogPath]);

        const state = readUsageState(statePath);
        const files = state.files || {};
        const codexFiles = collectSessionFiles(getCodexSessionsPath(config));
        const claudeFiles = collectSessionFiles(getClaudeSessionsPath(config));

        const processFile = (filePath: string, type: ProfileType) => {
            let stat: fs.Stats | null = null;
            try {
                stat = fs.statSync(filePath);
            } catch {
                return;
            }
            if (!stat || !stat.isFile()) return;
            const prev = files[filePath];
            if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
                return;
            }
            let stats: SessionStats;
            try {
                stats =
                    type === "codex"
                        ? parseCodexSessionFile(filePath)
                        : parseClaudeSessionFile(filePath);
            } catch {
                return;
            }
            const resolved = resolveProfileForSession(
                config,
                logEntries,
                type,
                filePath,
                stats.sessionId
            );
            if (!resolved.match) return;
            const prevInput = prev ? prev.inputTokens : 0;
            const prevOutput = prev ? prev.outputTokens : 0;
            const prevTotal = prev ? prev.totalTokens : 0;
            let deltaInput = stats.inputTokens - prevInput;
            let deltaOutput = stats.outputTokens - prevOutput;
            let deltaTotal = stats.totalTokens - prevTotal;
            if (deltaTotal < 0 || deltaInput < 0 || deltaOutput < 0) {
                deltaInput = stats.inputTokens;
                deltaOutput = stats.outputTokens;
                deltaTotal = stats.totalTokens;
            }
            if (deltaTotal > 0) {
                const record: UsageRecord = {
                    ts: stats.endTs || stats.startTs || new Date().toISOString(),
                    type,
                    profileKey: resolved.match.profileKey,
                    profileName: resolved.match.profileName,
                    inputTokens: deltaInput,
                    outputTokens: deltaOutput,
                    totalTokens: deltaTotal,
                };
                appendUsageRecord(usagePath, record);
            }
            files[filePath] = {
                mtimeMs: stat.mtimeMs,
                size: stat.size,
                type,
                inputTokens: stats.inputTokens,
                outputTokens: stats.outputTokens,
                totalTokens: stats.totalTokens,
                startTs: stats.startTs,
                endTs: stats.endTs,
                cwd: stats.cwd,
            };
        };

        for (const filePath of codexFiles) processFile(filePath, "codex");
        for (const filePath of claudeFiles) processFile(filePath, "claude");

        state.files = files;
        writeUsageState(statePath, state);
    } finally {
        releaseLock(lockPath, lockFd);
    }
}

/**
 * Codex CLI status line integration
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Config } from "../types";
import { expandEnv, resolvePath } from "../shell/utils";
import { askConfirm, createReadline } from "../ui";

const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const DEFAULT_STATUSLINE_COMMAND = [
    "codenv",
    "statusline",
    "--type",
    "codex",
    "--sync-usage",
];
const DEFAULT_SHOW_HINTS = false;
const DEFAULT_UPDATE_INTERVAL_MS = 300;
const DEFAULT_TIMEOUT_MS = 1000;

interface ParsedStatusLineConfig {
    command: string | string[] | null;
    showHints: boolean | null;
    updateIntervalMs: number | null;
    timeoutMs: number | null;
}

interface DesiredStatusLineConfig {
    command: string | string[];
    showHints: boolean;
    updateIntervalMs: number;
    timeoutMs: number;
    configPath: string;
}

interface StatusLineSection {
    start: number;
    end: number;
    sectionText: string;
    config: ParsedStatusLineConfig;
}

function parseBooleanEnv(value: string | undefined): boolean | null {
    if (value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
}

function resolveCodexConfigPath(config: Config): string {
    const envOverride = process.env.CODE_ENV_CODEX_CONFIG_PATH;
    if (envOverride && String(envOverride).trim()) {
        const expanded = expandEnv(String(envOverride).trim());
        return resolvePath(expanded) || DEFAULT_CODEX_CONFIG_PATH;
    }
    const configOverride = config.codexStatusline?.configPath;
    if (configOverride && String(configOverride).trim()) {
        const expanded = expandEnv(String(configOverride).trim());
        return resolvePath(expanded) || DEFAULT_CODEX_CONFIG_PATH;
    }
    return DEFAULT_CODEX_CONFIG_PATH;
}

function readConfig(filePath: string): string {
    if (!fs.existsSync(filePath)) return "";
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return "";
    }
}

function stripInlineComment(value: string): string {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === "\"" && !inSingle && value[i - 1] !== "\\") {
            inDouble = !inDouble;
            continue;
        }
        if (ch === "'" && !inDouble && value[i - 1] !== "\\") {
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && !inDouble && (ch === "#" || ch === ";")) {
            return value.slice(0, i).trim();
        }
    }
    return value.trim();
}

function unquote(value: string): string {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseCommandValue(raw: string): string | string[] | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
        const items: string[] = [];
        const regex = /"((?:\\.|[^"\\])*)"/g;
        let match: RegExpExecArray | null = null;
        while ((match = regex.exec(trimmed))) {
            const item = match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
            items.push(item);
        }
        return items.length > 0 ? items : null;
    }
    return unquote(trimmed);
}

function tokenizeCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;
    let escape = false;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (escape) {
            current += ch;
            escape = false;
            continue;
        }
        if (ch === "\\" && !inSingle) {
            escape = true;
            continue;
        }
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === "\"" && !inSingle) {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && /\s/.test(ch)) {
            if (current) {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
}

function parseBooleanValue(raw: string): boolean | null {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return null;
}

function parseNumberValue(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
}

function parseStatusLineSection(text: string): StatusLineSection | null {
    const headerRegex = /^\s*\[tui\.status_line\]\s*$/m;
    const match = headerRegex.exec(text);
    if (!match || match.index === undefined) return null;
    const start = match.index;
    const afterHeader = start + match[0].length;
    const rest = text.slice(afterHeader);
    const nextHeaderMatch = rest.match(/^\s*\[.*?\]\s*$/m);
    const end = nextHeaderMatch
        ? afterHeader + (nextHeaderMatch.index ?? rest.length)
        : text.length;
    const sectionText = text.slice(start, end).trimEnd();
    const lines = sectionText.split(/\r?\n/).slice(1);

    const config: ParsedStatusLineConfig = {
        command: null,
        showHints: null,
        updateIntervalMs: null,
        timeoutMs: null,
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
        const matchLine = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);
        if (!matchLine) continue;
        const key = matchLine[1];
        const rawValue = stripInlineComment(matchLine[2]);
        if (key === "command") {
            config.command = parseCommandValue(rawValue);
        } else if (key === "show_hints") {
            config.showHints = parseBooleanValue(rawValue);
        } else if (key === "update_interval_ms") {
            config.updateIntervalMs = parseNumberValue(rawValue);
        } else if (key === "timeout_ms") {
            config.timeoutMs = parseNumberValue(rawValue);
        }
    }

    return {
        start,
        end,
        sectionText,
        config,
    };
}

function commandToArray(value: string | string[] | null): string[] | null {
    if (!value) return null;
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry));
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    return tokenizeCommand(trimmed);
}

function commandMatches(
    existing: string | string[] | null,
    desired: string | string[]
): boolean {
    if (!existing) return false;
    const existingTokens = commandToArray(existing);
    const desiredTokens = commandToArray(desired);
    if (existingTokens && desiredTokens) {
        if (existingTokens.length !== desiredTokens.length) return false;
        for (let i = 0; i < desiredTokens.length; i++) {
            if (existingTokens[i] !== desiredTokens[i]) return false;
        }
        return true;
    }
    if (typeof existing === "string" && typeof desired === "string") {
        return existing.trim() === desired.trim();
    }
    return false;
}

function configMatches(
    config: ParsedStatusLineConfig,
    desired: DesiredStatusLineConfig
): boolean {
    if (!commandMatches(config.command, desired.command)) return false;
    if (config.showHints !== desired.showHints) return false;
    if (config.updateIntervalMs !== desired.updateIntervalMs) return false;
    if (config.timeoutMs !== desired.timeoutMs) return false;
    return true;
}

function resolveDesiredCommand(
    config: Config
): string | string[] {
    const raw = config.codexStatusline?.command;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed) return trimmed;
    } else if (Array.isArray(raw)) {
        const cleaned = raw
            .map((entry) => String(entry).trim())
            .filter((entry) => entry);
        if (cleaned.length > 0) return cleaned;
    }
    return DEFAULT_STATUSLINE_COMMAND;
}

function resolveDesiredStatusLineConfig(config: Config): DesiredStatusLineConfig {
    const showHints =
        config.codexStatusline?.showHints ?? DEFAULT_SHOW_HINTS;
    const updateIntervalMs =
        config.codexStatusline?.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
    const timeoutMs =
        config.codexStatusline?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const command = resolveDesiredCommand(config);
    const configPath = resolveCodexConfigPath(config);
    return {
        command,
        showHints,
        updateIntervalMs,
        timeoutMs,
        configPath,
    };
}

function formatCommandValue(command: string | string[]): string {
    if (Array.isArray(command)) {
        const parts = command.map((part) => JSON.stringify(part)).join(", ");
        return `[${parts}]`;
    }
    return JSON.stringify(command);
}

function buildStatusLineSection(desired: DesiredStatusLineConfig): string {
    const commandText = formatCommandValue(desired.command);
    return (
        `[tui.status_line]\n` +
        `command = ${commandText}\n` +
        `show_hints = ${desired.showHints ? "true" : "false"}\n` +
        `update_interval_ms = ${desired.updateIntervalMs}\n` +
        `timeout_ms = ${desired.timeoutMs}\n`
    );
}

function upsertSection(
    text: string,
    section: StatusLineSection | null,
    newSection: string
): string {
    if (!section) {
        let base = text;
        if (base && !base.endsWith("\n")) base += "\n";
        if (base && !base.endsWith("\n\n")) base += "\n";
        return `${base}${newSection}`;
    }
    let prefix = text.slice(0, section.start);
    let suffix = text.slice(section.end);
    if (prefix && !prefix.endsWith("\n")) prefix += "\n";
    if (suffix && !suffix.startsWith("\n")) suffix = `\n${suffix}`;
    return `${prefix}${newSection}${suffix}`;
}

function writeConfig(filePath: string, text: string): boolean {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
        return true;
    } catch {
        return false;
    }
}

export async function ensureCodexStatuslineConfig(
    config: Config,
    enabled: boolean
): Promise<boolean> {
    const disabled =
        parseBooleanEnv(process.env.CODE_ENV_CODEX_STATUSLINE_DISABLE) === true;
    if (!enabled || disabled) return false;

    const desired = resolveDesiredStatusLineConfig(config);
    const configPath = desired.configPath;
    const raw = readConfig(configPath);
    const section = parseStatusLineSection(raw);

    if (section && configMatches(section.config, desired)) return false;

    const force =
        parseBooleanEnv(process.env.CODE_ENV_CODEX_STATUSLINE_FORCE) === true;

    if (section && !force) {
        console.log(`codenv: existing Codex status_line config in ${configPath}:`);
        console.log(section.sectionText);
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            console.warn(
                "codenv: no TTY available to confirm status_line overwrite."
            );
            return false;
        }
        const rl = createReadline();
        try {
            const confirm = await askConfirm(
                rl,
                "Overwrite Codex status_line config? (y/N): "
            );
            if (!confirm) return false;
        } finally {
            rl.close();
        }
    }

    const updated = upsertSection(raw, section, buildStatusLineSection(desired));
    if (!writeConfig(configPath, updated)) {
        console.error(
            "codenv: failed to write Codex config; status_line not updated."
        );
        return false;
    }
    return true;
}

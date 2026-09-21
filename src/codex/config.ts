/**
 * Codex provider configuration management
 *
 * codenv owns two things inside config.toml: the root `model_provider` line and
 * a sentinel-delimited block holding its provider section. Everything else is
 * the user's and is never rewritten, so no snapshot/restore is needed — which
 * is what used to lose a login that happened while an API profile was active.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Config, EnvValue, Profile } from "../types";
import {
    CODENV_BLOCK_START,
    CODENV_BLOCK_END,
    CODEX_PROVIDER_NAME,
} from "../constants";
import { isLoginProfile } from "../profile/type";
import { expandEnv, resolvePath } from "../shell/utils";
import { escapeRegex } from "../utils";

const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const CODEX_PROVIDER_WIRE_API = "responses";

export interface TomlSectionRange {
    start: number;
    end: number;
    sectionText: string;
}

/** Shape written by codenv <= 0.1.14, read only so `migrate` can undo it. */
export interface LegacyCodexBackup {
    modelProviderLine: string | null;
    providerSectionText: string | null;
    authText: string | null;
}

function normalizeEnvValue(value: EnvValue): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized ? normalized : null;
}

function readTextIfExists(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return null;
    }
}

function writeText(filePath: string, text: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, text, "utf8");
}

export function parseSectionByHeader(
    text: string,
    headerRegex: RegExp
): TomlSectionRange | null {
    const match = headerRegex.exec(text);
    if (!match || match.index === undefined) return null;
    const start = match.index;
    const afterHeader = start + match[0].length;
    const rest = text.slice(afterHeader);
    const nextHeaderMatch = rest.match(/^[^\S\r\n]*\[.*?\][^\S\r\n]*$/m);
    const end = nextHeaderMatch
        ? afterHeader + (nextHeaderMatch.index ?? rest.length)
        : text.length;
    return { start, end, sectionText: text.slice(start, end).trimEnd() };
}

function getFirstSectionIndex(text: string): number {
    const match = text.match(/^[^\S\r\n]*\[.*?\][^\S\r\n]*$/m);
    if (!match || match.index === undefined) return text.length;
    return match.index;
}

function getRootText(text: string): { root: string; rest: string } {
    const index = getFirstSectionIndex(text);
    return { root: text.slice(0, index), rest: text.slice(index) };
}

export function readModelProviderLine(text: string): string | null {
    const { root } = getRootText(text);
    const match = root.match(/^[^\S\r\n]*model_provider[^\S\r\n]*=.*$/m);
    return match ? match[0].trimEnd() : null;
}

function removeModelProviderLine(text: string): string {
    const { root, rest } = getRootText(text);
    const updatedRoot = root.replace(
        /^[^\S\r\n]*model_provider[^\S\r\n]*=.*(?:\r?\n)?/m,
        ""
    );
    return `${updatedRoot}${rest}`;
}

/** Insert a root-level line before the first section header, as TOML requires. */
function insertRootLine(text: string, line: string): string {
    const { root, rest } = getRootText(text);
    const trimmedRoot = root.trimEnd();
    const trimmedRest = rest.trimStart();
    if (!trimmedRoot) {
        if (!trimmedRest) return `${line}\n`;
        return `${line}\n\n${trimmedRest}`;
    }
    if (!trimmedRest) return `${trimmedRoot}\n${line}\n`;
    return `${trimmedRoot}\n${line}\n\n${trimmedRest}`;
}

function removeSection(text: string, headerRegex: RegExp): string {
    const range = parseSectionByHeader(text, headerRegex);
    if (!range) return text;
    const before = text.slice(0, range.start).trimEnd();
    const after = text.slice(range.end).trimStart();
    if (before && after) return `${before}\n\n${after}`;
    if (before) return `${before}\n`;
    if (after) return `${after}\n`;
    return "";
}

function getProviderHeaderRegex(): RegExp {
    return new RegExp(
        `^[^\\S\\r\\n]*\\[model_providers\\.${escapeRegex(CODEX_PROVIDER_NAME)}\\][^\\S\\r\\n]*$`,
        "m"
    );
}

function getBlockRegex(): RegExp {
    return new RegExp(
        `${escapeRegex(CODENV_BLOCK_START)}[\\s\\S]*?${escapeRegex(CODENV_BLOCK_END)}[^\\S\\r\\n]*(?:\\r?\\n)?`,
        "m"
    );
}

/** Replace, append, or (with `body === null`) drop codenv's block. */
function upsertBlock(text: string, body: string | null): string {
    const regex = getBlockRegex();
    if (body === null) {
        const stripped = text.replace(regex, "").trimEnd();
        return stripped ? `${stripped}\n` : "";
    }
    const block = `${CODENV_BLOCK_START}\n${body}\n${CODENV_BLOCK_END}`;
    if (regex.test(text)) return text.replace(regex, `${block}\n`);
    const trimmed = text.trimEnd();
    return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

function renderProviderSection(baseUrl: string | null): string {
    const lines = [
        `[model_providers.${CODEX_PROVIDER_NAME}]`,
        `name = ${JSON.stringify(CODEX_PROVIDER_NAME)}`,
    ];
    if (baseUrl) lines.push(`base_url = ${JSON.stringify(baseUrl)}`);
    lines.push(`wire_api = ${JSON.stringify(CODEX_PROVIDER_WIRE_API)}`);
    lines.push("requires_openai_auth = true");
    return lines.join("\n");
}

export function resolveCodexConfigPath(config: Config): string {
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

export function getLegacyBackupPath(config: Config): string {
    return `${resolveCodexConfigPath(config)}.codenv-provider-backup.json`;
}

export function readLegacyCodexBackup(config: Config): LegacyCodexBackup | null {
    const raw = readTextIfExists(getLegacyBackupPath(config));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<LegacyCodexBackup>;
        return {
            modelProviderLine:
                typeof parsed.modelProviderLine === "string"
                    ? parsed.modelProviderLine
                    : null,
            providerSectionText:
                typeof parsed.providerSectionText === "string"
                    ? parsed.providerSectionText
                    : null,
            authText: typeof parsed.authText === "string" ? parsed.authText : null,
        };
    } catch {
        return null;
    }
}

export function removeLegacyCodexBackup(config: Config): void {
    const backupPath = getLegacyBackupPath(config);
    if (!fs.existsSync(backupPath)) return;
    try {
        fs.unlinkSync(backupPath);
    } catch {
        // leaving a stale backup behind is harmless; it is no longer read
    }
}

/** The `model_provider` value to restore whenever no API profile is active. */
export function getCodexBaseModelProvider(config: Config): string | null {
    const raw = config.codexBaseModelProvider;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
}

/**
 * Point config.toml at either codenv's provider (API profile) or the user's
 * own base provider (login profile). Only the root line and codenv's block move.
 */
export function applyCodexConfigToml(config: Config, profile: Profile): void {
    const configPath = resolveCodexConfigPath(config);
    const login = isLoginProfile(profile);
    let text = readTextIfExists(configPath) || "";

    text = upsertBlock(text, null);
    // Sections written before sentinels existed are dropped too, so a migrated
    // config converges on the managed form without a second pass.
    text = removeSection(text, getProviderHeaderRegex());
    text = removeModelProviderLine(text);

    if (login) {
        const base = getCodexBaseModelProvider(config);
        if (base) text = insertRootLine(text, `model_provider = ${JSON.stringify(base)}`);
        writeText(configPath, text);
        return;
    }

    text = insertRootLine(
        text,
        `model_provider = ${JSON.stringify(CODEX_PROVIDER_NAME)}`
    );
    const baseUrl = normalizeEnvValue((profile.env || {}).OPENAI_BASE_URL);
    text = upsertBlock(text, renderProviderSection(baseUrl));
    writeText(configPath, text);
}

/**
 * The auth.json body for an API profile, derived from its configured key.
 * Returns null when there is no key, leaving the vault file absent so codex
 * simply sees "not logged in" instead of a stale credential.
 */
export function buildCodexApiAuthJson(profile: Profile): string | null {
    const apiKey = normalizeEnvValue((profile.env || {}).OPENAI_API_KEY);
    if (!apiKey) return null;
    return `${JSON.stringify({ OPENAI_API_KEY: apiKey, auth_mode: "apikey" }, null, 2)}\n`;
}

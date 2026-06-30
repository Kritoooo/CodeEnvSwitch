/**
 * Codex provider configuration management
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Config, EnvValue } from "../types";
import { CODEX_AUTH_PATH } from "../constants";
import { getProfileDisplayName, inferProfileType } from "../profile/type";
import { expandEnv, resolvePath } from "../shell/utils";

const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const CODEX_PROVIDER_NAME = "OpenAI";
const CODEX_PROVIDER_WIRE_API = "responses";

interface TomlSectionRange {
    start: number;
    end: number;
    sectionText: string;
}

interface CodexProviderBackup {
    version: number;
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

function removeFileIfExists(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    try {
        fs.unlinkSync(filePath);
    } catch {
        // ignore cleanup failures
    }
}

function getBackupPath(configPath: string): string {
    return `${configPath}.codenv-provider-backup.json`;
}

function readBackup(backupPath: string): CodexProviderBackup | null {
    const raw = readTextIfExists(backupPath);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<CodexProviderBackup>;
        return {
            version:
                typeof parsed.version === "number" ? parsed.version : 1,
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

function writeBackup(backupPath: string, backup: CodexProviderBackup): void {
    writeText(backupPath, `${JSON.stringify(backup, null, 2)}\n`);
}

function parseSectionByHeader(
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
    return {
        start,
        end,
        sectionText: text.slice(start, end).trimEnd(),
    };
}

function getFirstSectionIndex(text: string): number {
    const match = text.match(/^[^\S\r\n]*\[.*?\][^\S\r\n]*$/m);
    if (!match || match.index === undefined) return text.length;
    return match.index;
}

function getRootText(text: string): { root: string; rest: string } {
    const index = getFirstSectionIndex(text);
    return {
        root: text.slice(0, index),
        rest: text.slice(index),
    };
}

function readModelProviderLine(text: string): string | null {
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

function insertRootLine(text: string, line: string): string {
    const { root, rest } = getRootText(text);
    const trimmedRoot = root.trimEnd();
    const trimmedRest = rest.trimStart();

    if (!trimmedRoot) {
        if (!trimmedRest) return `${line}\n`;
        return `${line}\n\n${trimmedRest}`;
    }

    if (!trimmedRest) {
        return `${trimmedRoot}\n${line}\n`;
    }

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

function replaceSection(
    text: string,
    range: TomlSectionRange,
    sectionText: string
): string {
    const before = text.slice(0, range.start).trimEnd();
    const after = text.slice(range.end).trimStart();
    const normalizedSection = sectionText.trimEnd();
    if (before && after) return `${before}\n\n${normalizedSection}\n\n${after}`;
    if (before) return `${before}\n\n${normalizedSection}\n`;
    if (after) return `${normalizedSection}\n\n${after}`;
    return `${normalizedSection}\n`;
}

function appendSection(text: string, sectionText: string): string {
    const trimmed = text.trimEnd();
    if (!trimmed) return `${sectionText}\n`;
    return `${trimmed}\n\n${sectionText}\n`;
}

function getProviderHeaderRegex(): RegExp {
    return /^[^\S\r\n]*\[model_providers\.OpenAI\][^\S\r\n]*$/m;
}

function readProviderSectionText(text: string): string | null {
    const range = parseSectionByHeader(text, getProviderHeaderRegex());
    return range ? range.sectionText : null;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTomlKeyRegex(key: string): RegExp {
    return new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
}

function getLeadingWhitespace(value: string): string {
    const match = value.match(/^\s*/);
    return match ? match[0] : "";
}

function hasTomlKey(sectionText: string, key: string): boolean {
    const keyRegex = getTomlKeyRegex(key);
    return sectionText
        .split(/\r?\n/)
        .slice(1)
        .some((line) => keyRegex.test(line));
}

function setTomlKey(sectionText: string, key: string, value: string): string {
    const lines = sectionText.split(/\r?\n/);
    const keyRegex = getTomlKeyRegex(key);
    const rendered = `${key} = ${value}`;
    let replaced = false;

    for (let i = 1; i < lines.length; i++) {
        if (!keyRegex.test(lines[i])) continue;
        if (!replaced) {
            lines[i] = `${getLeadingWhitespace(lines[i])}${rendered}`;
            replaced = true;
            continue;
        }
        lines.splice(i, 1);
        i--;
    }

    if (!replaced) lines.push(rendered);
    return lines.join("\n").trimEnd();
}

function ensureTomlKey(sectionText: string, key: string, value: string): string {
    if (hasTomlKey(sectionText, key)) return sectionText;
    return setTomlKey(sectionText, key, value);
}

function removeTomlKey(sectionText: string, key: string): string {
    const keyRegex = getTomlKeyRegex(key);
    return sectionText
        .split(/\r?\n/)
        .filter((line, index) => index === 0 || !keyRegex.test(line))
        .join("\n")
        .trimEnd();
}

function renderProviderSection(baseUrl: string | null): string {
    const lines = [
        `[model_providers.${CODEX_PROVIDER_NAME}]`,
        `name = ${JSON.stringify(CODEX_PROVIDER_NAME)}`,
    ];
    if (baseUrl) {
        lines.push(`base_url = ${JSON.stringify(baseUrl)}`);
    }
    lines.push(`wire_api = ${JSON.stringify(CODEX_PROVIDER_WIRE_API)}`);
    lines.push("requires_openai_auth = true");
    return lines.join("\n");
}

function mergeProviderSection(
    sectionText: string,
    baseUrl: string | null
): string {
    let merged = sectionText;
    merged = ensureTomlKey(
        merged,
        "name",
        JSON.stringify(CODEX_PROVIDER_NAME)
    );
    if (baseUrl) {
        merged = setTomlKey(merged, "base_url", JSON.stringify(baseUrl));
    } else {
        merged = removeTomlKey(merged, "base_url");
    }
    merged = setTomlKey(
        merged,
        "wire_api",
        JSON.stringify(CODEX_PROVIDER_WIRE_API)
    );
    merged = setTomlKey(merged, "requires_openai_auth", "true");
    return merged;
}

function ensureBackup(configPath: string, currentConfigText: string): void {
    const backupPath = getBackupPath(configPath);
    if (readBackup(backupPath)) return;
    writeBackup(backupPath, {
        version: 1,
        modelProviderLine: readModelProviderLine(currentConfigText),
        providerSectionText: readProviderSectionText(currentConfigText),
        authText: readTextIfExists(CODEX_AUTH_PATH),
    });
}

function writeManagedConfig(configPath: string, baseUrl: string | null): void {
    const currentText = readTextIfExists(configPath) || "";
    ensureBackup(configPath, currentText);

    let updated = currentText;
    updated = removeModelProviderLine(updated);
    updated = insertRootLine(
        updated,
        `model_provider = ${JSON.stringify(CODEX_PROVIDER_NAME)}`
    );
    const providerRange = parseSectionByHeader(updated, getProviderHeaderRegex());
    if (providerRange) {
        updated = replaceSection(
            updated,
            providerRange,
            mergeProviderSection(providerRange.sectionText, baseUrl)
        );
    } else {
        updated = appendSection(updated, renderProviderSection(baseUrl));
    }
    writeText(configPath, updated);
}

function writeManagedAuth(apiKey: string | null): void {
    const currentText = readTextIfExists(CODEX_AUTH_PATH);
    let auth: Record<string, unknown> | null = null;

    if (currentText) {
        try {
            const parsed = JSON.parse(currentText);
            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                auth = parsed as Record<string, unknown>;
            }
        } catch {
            auth = null;
        }
    }

    if (auth) {
        if (apiKey === null) {
            delete auth.OPENAI_API_KEY;
        } else {
            auth.OPENAI_API_KEY = apiKey;
        }
        writeText(CODEX_AUTH_PATH, `${JSON.stringify(auth, null, 2)}\n`);
        return;
    }

    const authJson =
        apiKey === null
            ? "null"
            : JSON.stringify({ OPENAI_API_KEY: apiKey });
    writeText(CODEX_AUTH_PATH, `${authJson}\n`);
}

function restoreAuth(authText: string | null): void {
    if (authText === null) {
        removeFileIfExists(CODEX_AUTH_PATH);
        return;
    }
    writeText(CODEX_AUTH_PATH, authText);
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

export function syncCodexProfile(config: Config, profileName: string): void {
    const profile = config.profiles && config.profiles[profileName];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileName}`);
    }
    const env = profile.env || {};
    const baseUrl = normalizeEnvValue(env.OPENAI_BASE_URL);
    const apiKey = normalizeEnvValue(env.OPENAI_API_KEY);
    const configPath = resolveCodexConfigPath(config);
    writeManagedConfig(configPath, baseUrl);
    writeManagedAuth(apiKey);
}

export function clearManagedCodexProfile(config: Config): void {
    const configPath = resolveCodexConfigPath(config);
    const backupPath = getBackupPath(configPath);
    const backup = readBackup(backupPath);
    if (!backup) return;

    let updated = readTextIfExists(configPath) || "";
    updated = removeSection(updated, getProviderHeaderRegex());
    updated = removeModelProviderLine(updated);
    if (backup.modelProviderLine) {
        updated = insertRootLine(updated, backup.modelProviderLine);
    }
    if (backup.providerSectionText) {
        updated = appendSection(updated, backup.providerSectionText);
    }

    const trimmed = updated.trimEnd();
    if (trimmed) {
        writeText(configPath, `${trimmed}\n`);
    } else {
        removeFileIfExists(configPath);
    }

    restoreAuth(backup.authText);
    removeFileIfExists(backupPath);
}

export function resolveCodexProfileFromEnv(
    config: Config,
    profileKey: string | null,
    profileName: string | null
): string | null {
    const profiles = config.profiles || {};
    if (profileKey && profiles[profileKey]) return profileKey;
    if (!profileName) return null;

    for (const [key, profile] of Object.entries(profiles)) {
        if (inferProfileType(key, profile || {}, null) !== "codex") continue;
        const displayName = getProfileDisplayName(key, profile || {}, "codex");
        if (displayName === profileName || key === profileName) {
            return key;
        }
    }

    return null;
}

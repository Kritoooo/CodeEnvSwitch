/**
 * Codex CLI status line integration (official schema)
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Config } from "../types";
import { expandEnv, resolvePath } from "../shell/utils";
import { askConfirm, createReadline } from "../ui";

const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");

interface ParsedTuiConfig {
    statusLineItems: string[] | null;
}

interface DesiredStatusLineConfig {
    statusLineItems: string[];
    configPath: string;
}

interface TuiSection {
    start: number;
    end: number;
    sectionText: string;
    config: ParsedTuiConfig;
}

interface TomlSectionRange {
    start: number;
    end: number;
    sectionText: string;
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

function resolveDesiredStatusLineItems(config: Config): string[] | null {
    const raw = config.codexStatusline?.items;
    if (!Array.isArray(raw)) return null;
    return raw
        .map((entry) => String(entry).trim())
        .filter((entry) => entry);
}

function resolveDesiredStatusLineConfig(
    config: Config
): DesiredStatusLineConfig | null {
    const statusLineItems = resolveDesiredStatusLineItems(config);
    if (statusLineItems === null) return null;
    return {
        statusLineItems,
        configPath: resolveCodexConfigPath(config),
    };
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

function hasUnquotedClosingBracket(value: string): boolean {
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
        if (!inSingle && !inDouble && ch === "]") {
            return true;
        }
    }
    return false;
}

function parseTomlStringArray(raw: string): string[] | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("[") || !hasUnquotedClosingBracket(trimmed)) {
        return null;
    }
    if (/^\[\s*\]$/.test(trimmed)) return [];

    const items: string[] = [];
    const regex = /"((?:\\.|[^"\\])*)"|'([^']*)'/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(trimmed))) {
        if (match[0].startsWith("\"")) {
            items.push(match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\"));
            continue;
        }
        items.push(match[2] || "");
    }

    if (items.length === 0) return null;
    return items;
}

function parseStatusLineItems(sectionText: string): string[] | null {
    const lines = sectionText.split(/\r?\n/).slice(1);

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;

        const matchLine = /^status_line\s*=\s*(.*)$/.exec(trimmed);
        if (!matchLine) continue;

        const value = stripInlineComment(matchLine[1]);
        if (!value.startsWith("[")) return null;

        const parts = [value];
        if (!hasUnquotedClosingBracket(value)) {
            for (let j = i + 1; j < lines.length; j++) {
                const next = stripInlineComment(lines[j]);
                if (!next) continue;
                parts.push(next);
                if (hasUnquotedClosingBracket(next)) break;
            }
        }

        return parseTomlStringArray(parts.join(" "));
    }

    return null;
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
    const nextHeaderMatch = rest.match(/^\s*\[.*?\]\s*$/m);
    const end = nextHeaderMatch
        ? afterHeader + (nextHeaderMatch.index ?? rest.length)
        : text.length;
    return {
        start,
        end,
        sectionText: text.slice(start, end).trimEnd(),
    };
}

function parseTuiSection(text: string): TuiSection | null {
    const section = parseSectionByHeader(text, /^\s*\[tui\]\s*$/m);
    if (!section) return null;

    return {
        start: section.start,
        end: section.end,
        sectionText: section.sectionText,
        config: {
            statusLineItems: parseStatusLineItems(section.sectionText),
        },
    };
}

function parseLegacyStatusLineSection(text: string): TomlSectionRange | null {
    return parseSectionByHeader(text, /^\s*\[tui\.status_line\]\s*$/m);
}

function statusLineItemsMatch(
    existing: string[] | null,
    desired: string[]
): boolean {
    if (!existing) return false;
    if (existing.length !== desired.length) return false;
    for (let i = 0; i < desired.length; i++) {
        if (existing[i] !== desired[i]) return false;
    }
    return true;
}

function configMatches(
    config: ParsedTuiConfig,
    desired: DesiredStatusLineConfig
): boolean {
    return statusLineItemsMatch(config.statusLineItems, desired.statusLineItems);
}

function formatStatusLineItems(items: string[]): string {
    const parts = items.map((item) => JSON.stringify(item)).join(", ");
    return `[${parts}]`;
}

function removeStatusLineSettingLines(lines: string[]): string[] {
    const kept: string[] = [];
    let inMultilineArray = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (inMultilineArray) {
            const value = stripInlineComment(trimmed);
            if (hasUnquotedClosingBracket(value)) {
                inMultilineArray = false;
            }
            continue;
        }

        const matchLine = /^status_line\s*=\s*(.*)$/.exec(trimmed);
        if (!matchLine) {
            kept.push(line);
            continue;
        }

        const value = stripInlineComment(matchLine[1]);
        if (value.startsWith("[") && !hasUnquotedClosingBracket(value)) {
            inMultilineArray = true;
        }
    }

    return kept;
}

function buildTuiSection(
    section: TuiSection | null,
    desired: DesiredStatusLineConfig
): string {
    const statusLine = `status_line = ${formatStatusLineItems(desired.statusLineItems)}`;

    if (!section) {
        return `[tui]\n${statusLine}\n`;
    }

    const lines = section.sectionText.split(/\r?\n/);
    const header = lines[0].trim() === "[tui]" ? lines[0] : "[tui]";
    const body = removeStatusLineSettingLines(lines.slice(1));

    while (body.length > 0 && body[body.length - 1].trim() === "") {
        body.pop();
    }

    body.push(statusLine);
    return `${header}\n${body.join("\n")}\n`;
}

function upsertSection(
    text: string,
    section: TuiSection | null,
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

function removeSection(
    text: string,
    section: TomlSectionRange
): string {
    let prefix = text.slice(0, section.start);
    let suffix = text.slice(section.end);
    if (prefix && !prefix.endsWith("\n")) prefix += "\n";
    if (suffix && !suffix.startsWith("\n")) suffix = `\n${suffix}`;
    return `${prefix}${suffix}`;
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
    if (!desired) return false;

    const configPath = desired.configPath;
    const raw = readConfig(configPath);
    const legacySection = parseLegacyStatusLineSection(raw);
    const base = legacySection ? removeSection(raw, legacySection) : raw;
    const section = parseTuiSection(base);

    if (section && configMatches(section.config, desired)) return false;

    const force =
        parseBooleanEnv(process.env.CODE_ENV_CODEX_STATUSLINE_FORCE) === true;
    const hasExistingStatusLine = Boolean(
        (section && Array.isArray(section.config.statusLineItems)) || legacySection
    );

    if (hasExistingStatusLine && !force) {
        console.log(`codenv: existing Codex tui.status_line config in ${configPath}:`);
        if (section && Array.isArray(section.config.statusLineItems)) {
            console.log(section.sectionText);
        } else if (legacySection) {
            console.log(legacySection.sectionText);
        }
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            console.warn(
                "codenv: no TTY available to confirm tui.status_line overwrite."
            );
            return false;
        }
        const rl = createReadline();
        try {
            const confirm = await askConfirm(
                rl,
                "Overwrite Codex tui.status_line config? (y/N): "
            );
            if (!confirm) return false;
        } finally {
            rl.close();
        }
    }

    const updated = upsertSection(base, section, buildTuiSection(section, desired));
    if (!writeConfig(configPath, updated)) {
        console.error(
            "codenv: failed to write Codex config; tui.status_line not updated."
        );
        return false;
    }
    return true;
}

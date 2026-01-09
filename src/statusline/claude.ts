/**
 * Claude Code statusline integration
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Config } from "../types";
import { expandEnv, resolvePath } from "../shell/utils";
import { askConfirm, createReadline } from "../ui";

const DEFAULT_CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const DEFAULT_STATUSLINE_COMMAND = "codenv statusline --type claude --sync-usage";
const DEFAULT_STATUSLINE_TYPE = "command";
const DEFAULT_STATUSLINE_PADDING = 0;

interface DesiredStatusLineConfig {
    type: string;
    command: string;
    padding: number;
    settingsPath: string;
}

function parseBooleanEnv(value: string | undefined): boolean | null {
    if (value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
}

function resolveClaudeSettingsPath(config: Config): string {
    const override = process.env.CODE_ENV_CLAUDE_SETTINGS_PATH;
    if (override && String(override).trim()) {
        const expanded = expandEnv(String(override).trim());
        return resolvePath(expanded) || DEFAULT_CLAUDE_SETTINGS_PATH;
    }
    const configOverride = config.claudeStatusline?.settingsPath;
    if (configOverride && String(configOverride).trim()) {
        const expanded = expandEnv(String(configOverride).trim());
        return resolvePath(expanded) || DEFAULT_CLAUDE_SETTINGS_PATH;
    }
    return DEFAULT_CLAUDE_SETTINGS_PATH;
}

function readSettings(filePath: string): Record<string, unknown> | null {
    if (!fs.existsSync(filePath)) return {};
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const trimmed = raw.trim();
        if (!trimmed) return {};
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return null;
    } catch {
        return null;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommandStatusLine(
    value: unknown
): value is { type: string; command: string; padding?: number } {
    if (!isPlainObject(value)) return false;
    const type = value.type;
    const command = value.command;
    return typeof type === "string" && typeof command === "string";
}

function resolveCommand(command: string | string[] | undefined): string {
    if (typeof command === "string") {
        const trimmed = command.trim();
        if (trimmed) return trimmed;
    }
    if (Array.isArray(command)) {
        const cleaned = command
            .map((entry) => String(entry).trim())
            .filter((entry) => entry);
        if (cleaned.length > 0) return cleaned.join(" ");
    }
    return DEFAULT_STATUSLINE_COMMAND;
}

function resolveDesiredStatusLineConfig(config: Config): DesiredStatusLineConfig {
    const type = config.claudeStatusline?.type || DEFAULT_STATUSLINE_TYPE;
    const command = resolveCommand(config.claudeStatusline?.command);
    const paddingRaw = config.claudeStatusline?.padding;
    const padding =
        typeof paddingRaw === "number" && Number.isFinite(paddingRaw)
            ? Math.floor(paddingRaw)
            : DEFAULT_STATUSLINE_PADDING;
    const settingsPath = resolveClaudeSettingsPath(config);
    return { type, command, padding, settingsPath };
}

function statusLineMatches(
    existing: unknown,
    desired: DesiredStatusLineConfig
): boolean {
    if (!isCommandStatusLine(existing)) return false;
    if (existing.type !== desired.type) return false;
    if (existing.command !== desired.command) return false;
    const existingPadding =
        typeof existing.padding === "number" ? existing.padding : undefined;
    if (existingPadding !== desired.padding) return false;
    return true;
}

export async function ensureClaudeStatusline(
    config: Config,
    enabled: boolean
): Promise<boolean> {
    const disabled =
        parseBooleanEnv(process.env.CODE_ENV_CLAUDE_STATUSLINE_DISABLE) === true;
    if (!enabled || disabled) return false;
    const desired = resolveDesiredStatusLineConfig(config);
    const settingsPath = desired.settingsPath;
    const force =
        parseBooleanEnv(process.env.CODE_ENV_CLAUDE_STATUSLINE_FORCE) === true;

    const settings = readSettings(settingsPath);
    if (!settings) {
        console.error(
            "codenv: unable to read Claude settings; skipping statusLine update."
        );
        return false;
    }

    const existing = settings.statusLine;
    if (existing && statusLineMatches(existing, desired)) {
        return false;
    }

    if (typeof existing !== "undefined" && !force) {
        console.log(`codenv: existing Claude statusLine config in ${settingsPath}:`);
        console.log(JSON.stringify(existing, null, 2));
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            console.warn("codenv: no TTY available to confirm statusLine overwrite.");
            return false;
        }
        const rl = createReadline();
        try {
            const confirm = await askConfirm(
                rl,
                "Overwrite Claude statusLine config? (y/N): "
            );
            if (!confirm) return false;
        } finally {
            rl.close();
        }
    }

    settings.statusLine = {
        type: desired.type,
        command: desired.command,
        padding: desired.padding,
    };
    try {
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
        return true;
    } catch {
        console.error(
            "codenv: failed to write Claude settings; statusLine not updated."
        );
        return false;
    }
}

/**
 * Interactive UI components
 */
import * as readline from "readline";
import type { Config, ProfileType } from "../types";
import { readConfigIfExists, writeConfig, getResolvedDefaultProfileKeys } from "../config";
import { generateProfileKey } from "../profile/resolve";
import { normalizeType, inferProfileType } from "../profile/type";
import { buildListRows } from "../profile/display";
import { createReadline, askRequired, askType, askProfileName } from "./readline";

export async function runInteractiveAdd(configPath: string): Promise<void> {
    const config = readConfigIfExists(configPath);
    const rl = createReadline();
    try {
        const type = await askType(rl);
        const defaultName = "default";
        const profileInfo = await askProfileName(rl, config, defaultName, type);
        const profileKey = profileInfo.key || generateProfileKey(config);
        const baseUrl = await askRequired(rl, "Base URL (required): ");
        const apiKey = await askRequired(rl, "API key (required): ");

        if (!config.profiles || typeof config.profiles !== "object") {
            config.profiles = {};
        }
        if (!config.profiles[profileKey]) {
            config.profiles[profileKey] = {};
        }
        const profile = config.profiles[profileKey];
        profile.name = profileInfo.name;
        profile.type = type;
        if (!profile.env || typeof profile.env !== "object") {
            profile.env = {};
        }

        if (type === "codex") {
            profile.env.OPENAI_BASE_URL = baseUrl;
            profile.env.OPENAI_API_KEY = apiKey;
        } else {
            profile.env.ANTHROPIC_BASE_URL = baseUrl;
            profile.env.ANTHROPIC_API_KEY = apiKey;
            console.log(
                "Note: ANTHROPIC_AUTH_TOKEN will be set to the same value when applying."
            );
        }

        writeConfig(configPath, config);
        console.log(`Updated config: ${configPath}`);
    } finally {
        rl.close();
    }
}

export async function runInteractiveUse(
    config: Config,
    printUse: (config: Config, profileName: string, requestedType: ProfileType | null) => void
): Promise<void> {
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        throw new Error("Interactive selection requires a TTY. Provide a profile name.");
    }
    const rows = buildListRows(config, getResolvedDefaultProfileKeys);
    if (rows.length === 0) {
        throw new Error("No profiles found.");
    }

    const nameTypeCounts = new Map<string, number>();
    for (const row of rows) {
        const key = `${row.name}||${row.type}`;
        nameTypeCounts.set(key, (nameTypeCounts.get(key) || 0) + 1);
    }

    const displayRows = rows.map((row) => {
        const key = `${row.name}||${row.type}`;
        const displayName =
            (nameTypeCounts.get(key) || 0) > 1 ? `${row.name} [${row.key}]` : row.name;
        const noteText = row.note;
        const profile = config.profiles && config.profiles[row.key];
        const inferredType = inferProfileType(row.key, profile, null);
        const resolvedType = inferredType || normalizeType(row.type) || null;
        return { ...row, displayName, noteText, resolvedType };
    });

    const headerName = "PROFILE";
    const headerType = "TYPE";
    const headerNote = "NOTE";
    const nameWidth = Math.max(
        headerName.length,
        ...displayRows.map((row) => row.displayName.length)
    );
    const typeWidth = Math.max(
        headerType.length,
        ...displayRows.map((row) => row.type.length)
    );
    const noteWidth = Math.max(
        headerNote.length,
        ...displayRows.map((row) => row.noteText.length)
    );
    const formatRow = (name: string, type: string, note: string) =>
        `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${note.padEnd(
            noteWidth
        )}`;

    const activeKeys = new Set<string>();
    const keyToType = new Map<string, ProfileType | null>();
    for (const row of displayRows) {
        keyToType.set(row.key, row.resolvedType || null);
        if (row.active) activeKeys.add(row.key);
    }

    let index = displayRows.findIndex((row) => row.active);
    if (index < 0) index = 0;

    const ANSI_CLEAR = "\x1b[2J\x1b[H";
    const ANSI_HIDE_CURSOR = "\x1b[?25l";
    const ANSI_SHOW_CURSOR = "\x1b[?25h";
    const ANSI_INVERT = "\x1b[7m";
    const ANSI_GREEN = "\x1b[32m";
    const ANSI_RESET = "\x1b[0m";

    const render = () => {
        const lines: string[] = [];
        lines.push("Select profile (up/down, Enter to apply, q to exit)");
        lines.push(formatRow(headerName, headerType, headerNote));
        lines.push(
            formatRow(
                "-".repeat(nameWidth),
                "-".repeat(typeWidth),
                "-".repeat(noteWidth)
            )
        );
        for (let i = 0; i < displayRows.length; i++) {
            const row = displayRows[i];
            const isActive = activeKeys.has(row.key);
            const line = ` ${formatRow(row.displayName, row.type, row.noteText)}`;
            if (i === index) {
                const prefix = isActive ? `${ANSI_INVERT}${ANSI_GREEN}` : ANSI_INVERT;
                lines.push(`${prefix}${line}${ANSI_RESET}`);
            } else {
                if (isActive) {
                    lines.push(`${ANSI_GREEN}${line}${ANSI_RESET}`);
                } else {
                    lines.push(line);
                }
            }
        }
        process.stderr.write(`${ANSI_CLEAR}${ANSI_HIDE_CURSOR}${lines.join("\n")}\n`);
    };

    return await new Promise<void>((resolve) => {
        readline.emitKeypressEvents(process.stdin);
        const stdin = process.stdin;
        const wasRaw = !!stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();

        const cleanup = () => {
            stdin.removeListener("keypress", onKeypress);
            if (!wasRaw) stdin.setRawMode(false);
            stdin.pause();
            process.stderr.write(`${ANSI_RESET}${ANSI_SHOW_CURSOR}`);
        };

        const finish = () => {
            cleanup();
            resolve();
        };

        const onKeypress = (str: string, key: readline.Key | undefined) => {
            if (key && key.ctrl && key.name === "c") {
                finish();
                return;
            }
            if (key && key.name === "up") {
                index = (index - 1 + displayRows.length) % displayRows.length;
                render();
                return;
            }
            if (key && key.name === "down") {
                index = (index + 1) % displayRows.length;
                render();
                return;
            }
            if (key && key.name === "home") {
                index = 0;
                render();
                return;
            }
            if (key && key.name === "end") {
                index = displayRows.length - 1;
                render();
                return;
            }
            if (key && (key.name === "return" || key.name === "enter")) {
                const selectedKey = displayRows[index].key;
                const selectedType = keyToType.get(selectedKey) || null;
                if (selectedType) {
                    for (const activeKey of Array.from(activeKeys)) {
                        if (keyToType.get(activeKey) === selectedType) {
                            activeKeys.delete(activeKey);
                        }
                    }
                }
                activeKeys.add(selectedKey);
                printUse(config, selectedKey, null);
                render();
                return;
            }
            if (key && key.name === "escape") {
                finish();
                return;
            }
            if (str === "q" || str === "Q") {
                finish();
            }
        };

        stdin.on("keypress", onKeypress);
        render();
    });
}

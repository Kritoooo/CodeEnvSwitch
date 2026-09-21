/**
 * Profile browser and editor
 *
 * Runs inside the sourced `codenv use` path, so applying a profile still works
 * by writing shell lines to stdout while the UI draws on stderr.
 */
import type * as readline from "readline";
import type { Config, ListRow, Profile, ProfileType } from "../types";
import { readConfig, writeConfig } from "../config/io";
import { getResolvedDefaultProfileKeys } from "../config/defaults";
import { buildListRows } from "../profile/display";
import { generateProfileKey } from "../profile/resolve";
import { inferProfileType, isLoginProfile, normalizeType } from "../profile/type";
import { describeCredential, readVaultCredential } from "../accounts";
import {
    createForm,
    fromDraft,
    handleFormKey,
    renderForm,
    type ProfileForm,
} from "./form";
import { createEditor, handleEditorKey, renderEditor, type LineEditor } from "./input";
import { DIM, GREEN, INVERT, RESET, YELLOW, fit, isInteractive, runTui } from "./screen";

export type ApplyProfile = (
    config: Config,
    profileKey: string,
    requestedType: ProfileType | null
) => void;

interface Entry {
    row: ListRow;
    account: string;
    type: ProfileType | null;
}

interface AppState {
    canApply: boolean;
    config: Config;
    entries: Entry[];
    index: number;
    filter: LineEditor | null;
    filterText: string;
    form: ProfileForm | null;
    formKey: string | null;
    pendingDelete: string | null;
    message: string | null;
    appliedKeys: Set<string>;
}

function hostOf(value: string): string {
    try {
        return new URL(value).host;
    } catch {
        return value;
    }
}

/** What the profile currently authenticates as, for the ACCOUNT column. */
function accountLabel(
    config: Config,
    configPath: string | null,
    key: string,
    profile: Profile,
    type: ProfileType | null
): string {
    if (!type) return "-";
    if (isLoginProfile(profile)) {
        const label = describeCredential(type, readVaultCredential(configPath, type, key));
        return label || "not signed in";
    }
    const env = profile.env || {};
    const base = env.OPENAI_BASE_URL || env.ANTHROPIC_BASE_URL;
    return base ? hostOf(String(base)) : "API key";
}

function buildEntries(config: Config, configPath: string | null): Entry[] {
    return buildListRows(config, getResolvedDefaultProfileKeys).map((row) => {
        const profile = (config.profiles || {})[row.key] || {};
        const type = row.usageType || inferProfileType(row.key, profile, null);
        return {
            row,
            type,
            account: accountLabel(config, configPath, row.key, profile, type),
        };
    });
}

function visibleEntries(state: AppState): Entry[] {
    const needle = state.filterText.trim().toLowerCase();
    if (!needle) return state.entries;
    return state.entries.filter((entry) =>
        `${entry.row.name} ${entry.row.type} ${entry.account} ${entry.row.note}`
            .toLowerCase()
            .includes(needle)
    );
}

/**
 * Re-read the config before writing so a `codenv use` from another terminal is
 * not clobbered; only the edited profile is carried over.
 */
function saveProfile(
    configPath: string,
    profileKey: string | null,
    profile: Profile
): { config: Config; key: string } {
    const fresh = readConfig(configPath);
    if (!fresh.profiles || typeof fresh.profiles !== "object") fresh.profiles = {};
    const key = profileKey || generateProfileKey(fresh);
    fresh.profiles[key] = profile;
    writeConfig(configPath, fresh);
    return { config: fresh, key };
}

function deleteProfile(configPath: string, profileKey: string): Config {
    const fresh = readConfig(configPath);
    if (fresh.profiles) delete fresh.profiles[profileKey];
    writeConfig(configPath, fresh);
    return fresh;
}

function renderList(state: AppState, width: number, rows: number): string[] {
    const entries = visibleEntries(state);
    const lines: string[] = [];
    const nameWidth = Math.max(7, ...entries.map((e) => e.row.name.length));
    const typeWidth = Math.max(4, ...entries.map((e) => e.row.type.length));
    const accountWidth = Math.min(
        28,
        Math.max(7, ...entries.map((e) => e.account.length))
    );
    const format = (name: string, type: string, account: string, note: string) =>
        `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${fit(
            account,
            accountWidth
        ).padEnd(accountWidth)}  ${note}`;

    lines.push(format("PROFILE", "TYPE", "ACCOUNT", "NOTE"));
    lines.push(
        format(
            "-".repeat(nameWidth),
            "-".repeat(typeWidth),
            "-".repeat(accountWidth),
            "----"
        )
    );

    // Keep the cursor on screen without a full scroll implementation.
    const budget = Math.max(3, rows - 8);
    let start = 0;
    if (entries.length > budget) {
        start = Math.min(
            Math.max(0, state.index - Math.floor(budget / 2)),
            entries.length - budget
        );
    }
    const slice = entries.slice(start, start + budget);
    for (let i = 0; i < slice.length; i++) {
        const entry = slice[i];
        const absolute = start + i;
        const applied = state.appliedKeys.has(entry.row.key) || entry.row.active;
        const line = ` ${fit(
            format(entry.row.name, entry.row.type, entry.account, entry.row.note),
            width - 1
        )}`;
        if (absolute === state.index) {
            lines.push(`${INVERT}${applied ? GREEN : ""}${line}${RESET}`);
        } else {
            lines.push(applied ? `${GREEN}${line}${RESET}` : line);
        }
    }
    if (entries.length === 0) lines.push(`${DIM} (no matching profiles)${RESET}`);

    lines.push("");
    if (state.filter) {
        lines.push(`filter: ${renderEditor(state.filter)}`);
    } else if (state.pendingDelete) {
        const entry = state.entries.find((e) => e.row.key === state.pendingDelete);
        lines.push(`${YELLOW}Delete "${entry?.row.name}"? (y/N)${RESET}`);
    } else if (state.message) {
        lines.push(`${YELLOW}${state.message}${RESET}`);
    } else {
        lines.push("");
    }
    lines.push(
        `${DIM}↑↓ move   ${
            state.canApply ? "Enter apply   " : ""
        }e edit   n new   d delete   / filter   q quit${RESET}`
    );
    return lines;
}

export interface ProfileTuiOptions {
    /** Open straight into a blank form and leave once it is saved or cancelled. */
    startNew?: boolean;
}

export async function runProfileTui(
    initialConfig: Config,
    configPath: string | null,
    applyProfile: ApplyProfile,
    options: ProfileTuiOptions = {}
): Promise<void> {
    if (!isInteractive()) {
        throw new Error("Interactive selection requires a TTY. Provide a profile name.");
    }
    if (!configPath) {
        throw new Error("No config path available for editing.");
    }

    const state: AppState = {
        // Sourced through the shell helper, stdout is a pipe. A TTY here means
        // the shell cannot receive the exports, so applying would do nothing.
        canApply: !process.stdout.isTTY,
        config: initialConfig,
        entries: buildEntries(initialConfig, configPath),
        index: 0,
        filter: null,
        filterText: "",
        form: null,
        formKey: null,
        pendingDelete: null,
        message: null,
        appliedKeys: new Set(),
    };

    const active = state.entries.findIndex((entry) => entry.row.active);
    if (active >= 0) state.index = active;
    if (options.startNew) state.form = createForm(null, "codex", true);

    let savedNewProfile = false;

    const refresh = () => {
        state.entries = buildEntries(state.config, configPath);
        if (state.index >= visibleEntries(state).length) {
            state.index = Math.max(0, visibleEntries(state).length - 1);
        }
    };

    await runTui((session) => {
        const draw = () => {
            const width = session.columns();
            session.render(
                state.form
                    ? renderForm(state.form, width)
                    : renderList(state, width, session.rows())
            );
        };

        const handler = (str: string, key: readline.Key | undefined) => {
            if (key?.name === "__resize") {
                draw();
                return;
            }

            if (state.form) {
                const outcome = handleFormKey(state.form, str, key);
                if (outcome === "cancel") {
                    state.form = null;
                    state.formKey = null;
                    if (options.startNew) {
                        session.stop();
                        return;
                    }
                } else if (outcome === "save") {
                    const profile = fromDraft(state.form.draft);
                    const saved = saveProfile(configPath, state.formKey, profile);
                    state.config = saved.config;
                    state.form = null;
                    state.formKey = null;
                    state.message = `Saved. Config: ${configPath}`;
                    refresh();
                    const idx = visibleEntries(state).findIndex(
                        (entry) => entry.row.key === saved.key
                    );
                    if (idx >= 0) state.index = idx;
                    if (options.startNew) {
                        session.stop();
                        savedNewProfile = true;
                        return;
                    }
                }
                draw();
                return;
            }

            if (state.filter) {
                const result = handleEditorKey(state.filter, str, key);
                if (result === "cancel") {
                    state.filter = null;
                    state.filterText = "";
                } else if (result === "commit") {
                    state.filterText = state.filter.value;
                    state.filter = null;
                } else {
                    state.filterText = state.filter.value;
                }
                state.index = 0;
                draw();
                return;
            }

            if (state.pendingDelete) {
                if (str === "y" || str === "Y") {
                    state.config = deleteProfile(configPath, state.pendingDelete);
                    state.message = "Deleted.";
                    refresh();
                }
                state.pendingDelete = null;
                draw();
                return;
            }

            const entries = visibleEntries(state);
            const current = entries[state.index];
            const name = key?.name;
            state.message = null;

            if ((key?.ctrl && name === "c") || str === "q" || name === "escape") {
                session.stop();
                return;
            }
            if (name === "up") {
                state.index = (state.index - 1 + entries.length) % (entries.length || 1);
            } else if (name === "down") {
                state.index = (state.index + 1) % (entries.length || 1);
            } else if (name === "home") {
                state.index = 0;
            } else if (name === "end") {
                state.index = Math.max(0, entries.length - 1);
            } else if (str === "/") {
                state.filter = createEditor(state.filterText);
            } else if (str === "n") {
                state.form = createForm(null, "codex", true);
                state.formKey = null;
            } else if (str === "e" && current) {
                const profile = (state.config.profiles || {})[current.row.key] || {};
                const type =
                    current.type || normalizeType(current.row.type) || "codex";
                state.form = createForm(profile, type, false);
                state.formKey = current.row.key;
            } else if (str === "d" && current) {
                state.pendingDelete = current.row.key;
            } else if ((name === "return" || name === "enter") && current) {
                if (!state.canApply) {
                    state.message =
                        "Not running through the shell helper; run `codenv init` to enable apply.";
                    draw();
                    return;
                }
                // Only one profile per type can be active, so drop the others.
                for (const key of Array.from(state.appliedKeys)) {
                    const entry = state.entries.find((item) => item.row.key === key);
                    if (entry && entry.type === current.type) state.appliedKeys.delete(key);
                }
                state.appliedKeys.add(current.row.key);
                applyProfile(state.config, current.row.key, null);
            }
            draw();
        };

        draw();
        return handler;
    });

    if (options.startNew && savedNewProfile) {
        console.error(`Updated config: ${configPath}`);
    }
}

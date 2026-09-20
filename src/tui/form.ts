/**
 * Profile edit form - pure state machine, rendered by the caller
 *
 * Covers what the `add` flags cannot express: removing an env key, dropping a
 * removeFiles/commands entry, and renaming a profile.
 */
import type * as readline from "readline";
import type { EnvValue, Profile, ProfileType } from "../types";
import { isLoginProfile } from "../profile/type";
import {
    createEditor,
    handleEditorKey,
    maskSecret,
    renderEditor,
    type LineEditor,
} from "./input";
import { DIM, INVERT, RESET, YELLOW, fit, pad } from "./screen";

type SectionName = "env" | "removeFiles" | "commands";

export interface EnvPair {
    key: string;
    value: string;
}

export interface DraftProfile {
    name: string;
    type: ProfileType;
    authMode: "api" | "login";
    baseUrl: string;
    apiKey: string;
    note: string;
    env: EnvPair[];
    removeFiles: string[];
    commands: string[];
}

type Row =
    | { kind: "field"; label: string; field: "name" | "baseUrl" | "apiKey" | "note" }
    | { kind: "radio"; label: string; field: "type" | "authMode" }
    | { kind: "section"; label: string; section: SectionName }
    | { kind: "item"; section: SectionName; itemIndex: number }
    | { kind: "text"; label: string };

export interface ProfileForm {
    draft: DraftProfile;
    originalAuthMode: "api" | "login";
    isNew: boolean;
    index: number;
    editor: LineEditor | null;
    editTarget:
        | { kind: "field"; field: "name" | "baseUrl" | "apiKey" | "note" }
        | { kind: "item"; section: SectionName; itemIndex: number }
        | { kind: "newItem"; section: SectionName }
        | null;
    message: string | null;
}

const CREDENTIAL_KEYS: Record<ProfileType, { base: string; key: string }> = {
    codex: { base: "OPENAI_BASE_URL", key: "OPENAI_API_KEY" },
    claude: { base: "ANTHROPIC_BASE_URL", key: "ANTHROPIC_API_KEY" },
};

function managedKeys(type: ProfileType): Set<string> {
    const pair = CREDENTIAL_KEYS[type];
    const keys = new Set([pair.base, pair.key]);
    if (type === "claude") keys.add("ANTHROPIC_AUTH_TOKEN");
    return keys;
}

export function toDraft(profile: Profile, type: ProfileType): DraftProfile {
    const env = profile.env || {};
    const pair = CREDENTIAL_KEYS[type];
    const managed = managedKeys(type);
    const extras: EnvPair[] = [];
    for (const [key, value] of Object.entries(env)) {
        if (managed.has(key)) continue;
        extras.push({ key, value: value === null || value === undefined ? "" : String(value) });
    }
    const readEnv = (key: string): string => {
        const value = env[key as keyof typeof env] as EnvValue;
        return value === null || value === undefined ? "" : String(value);
    };
    return {
        name: profile.name ? String(profile.name) : "",
        type,
        authMode: isLoginProfile(profile) ? "login" : "api",
        baseUrl: readEnv(pair.base),
        apiKey: readEnv(pair.key),
        note: profile.note ? String(profile.note) : "",
        env: extras,
        removeFiles: Array.isArray(profile.removeFiles) ? [...profile.removeFiles] : [],
        commands: Array.isArray(profile.commands) ? [...profile.commands] : [],
    };
}

/** Rebuild a profile from the draft, dropping anything the draft cleared. */
export function fromDraft(draft: DraftProfile): Profile {
    const pair = CREDENTIAL_KEYS[draft.type];
    const env: Record<string, EnvValue> = {};
    if (draft.authMode === "api") {
        if (draft.baseUrl) env[pair.base] = draft.baseUrl;
        if (draft.apiKey) env[pair.key] = draft.apiKey;
    }
    for (const entry of draft.env) {
        if (entry.key) env[entry.key] = entry.value;
    }
    const profile: Profile = { name: draft.name, type: draft.type, env };
    if (draft.authMode === "login") profile.authMode = "login";
    if (draft.note) profile.note = draft.note;
    if (draft.removeFiles.length > 0) profile.removeFiles = [...draft.removeFiles];
    if (draft.commands.length > 0) profile.commands = [...draft.commands];
    return profile;
}

export function createForm(
    profile: Profile | null,
    type: ProfileType,
    isNew: boolean
): ProfileForm {
    const draft = toDraft(profile || {}, type);
    return {
        draft,
        originalAuthMode: draft.authMode,
        isNew,
        index: 0,
        editor: null,
        editTarget: null,
        message: null,
    };
}

function sectionItems(draft: DraftProfile, section: SectionName): string[] {
    if (section === "env") return draft.env.map((entry) => `${entry.key}=${entry.value}`);
    if (section === "removeFiles") return draft.removeFiles;
    return draft.commands;
}

function buildRows(form: ProfileForm): Row[] {
    const { draft } = form;
    const pair = CREDENTIAL_KEYS[draft.type];
    const rows: Row[] = [
        { kind: "field", label: "name", field: "name" },
        { kind: "radio", label: "type", field: "type" },
        { kind: "radio", label: "auth", field: "authMode" },
    ];
    if (draft.authMode === "api") {
        rows.push({ kind: "field", label: pair.base, field: "baseUrl" });
        rows.push({ kind: "field", label: pair.key, field: "apiKey" });
    }
    rows.push({ kind: "field", label: "note", field: "note" });
    const sections: [SectionName, string][] = [
        ["env", "env (extra keys)"],
        ["removeFiles", "removeFiles"],
        ["commands", "commands"],
    ];
    for (const [section, label] of sections) {
        rows.push({ kind: "text", label: "" });
        rows.push({ kind: "section", label, section });
        const items = sectionItems(draft, section);
        for (let i = 0; i < items.length; i++) {
            rows.push({ kind: "item", section, itemIndex: i });
        }
    }
    return rows;
}

function isFocusable(row: Row): boolean {
    return row.kind !== "text";
}

function move(form: ProfileForm, delta: number): void {
    const rows = buildRows(form);
    let next = form.index;
    for (let i = 0; i < rows.length; i++) {
        next = (next + delta + rows.length) % rows.length;
        if (isFocusable(rows[next])) break;
    }
    form.index = next;
}

function fieldValue(draft: DraftProfile, field: string): string {
    if (field === "name") return draft.name;
    if (field === "baseUrl") return draft.baseUrl;
    if (field === "apiKey") return draft.apiKey;
    return draft.note;
}

function setFieldValue(draft: DraftProfile, field: string, value: string): void {
    if (field === "name") draft.name = value;
    else if (field === "baseUrl") draft.baseUrl = value;
    else if (field === "apiKey") draft.apiKey = value;
    else draft.note = value;
}

function setSectionItem(draft: DraftProfile, section: SectionName, index: number, value: string): void {
    if (section === "env") {
        const idx = value.indexOf("=");
        if (idx <= 0) return;
        draft.env[index] = { key: value.slice(0, idx).trim(), value: value.slice(idx + 1) };
        return;
    }
    if (section === "removeFiles") draft.removeFiles[index] = value;
    else draft.commands[index] = value;
}

function addSectionItem(draft: DraftProfile, section: SectionName, value: string): boolean {
    if (!value.trim()) return false;
    if (section === "env") {
        const idx = value.indexOf("=");
        if (idx <= 0) return false;
        draft.env.push({ key: value.slice(0, idx).trim(), value: value.slice(idx + 1) });
        return true;
    }
    if (section === "removeFiles") draft.removeFiles.push(value);
    else draft.commands.push(value);
    return true;
}

function removeSectionItem(draft: DraftProfile, section: SectionName, index: number): void {
    if (section === "env") draft.env.splice(index, 1);
    else if (section === "removeFiles") draft.removeFiles.splice(index, 1);
    else draft.commands.splice(index, 1);
}

export type FormOutcome = "save" | "cancel" | "continue";

export function handleFormKey(
    form: ProfileForm,
    str: string,
    key: readline.Key | undefined
): FormOutcome {
    if (form.editor && form.editTarget) {
        const result = handleEditorKey(form.editor, str, key);
        if (result === "cancel") {
            form.editor = null;
            form.editTarget = null;
            return "continue";
        }
        if (result !== "commit") return "continue";
        const value = form.editor.value;
        const target = form.editTarget;
        if (target.kind === "field") setFieldValue(form.draft, target.field, value);
        else if (target.kind === "item") {
            setSectionItem(form.draft, target.section, target.itemIndex, value);
        } else if (!addSectionItem(form.draft, target.section, value)) {
            form.message =
                target.section === "env" ? "Expected KEY=VALUE." : "Value cannot be empty.";
        }
        form.editor = null;
        form.editTarget = null;
        return "continue";
    }

    const rows = buildRows(form);
    const row = rows[form.index];
    const name = key?.name;
    form.message = null;

    if (key?.ctrl && name === "c") return "cancel";
    if (name === "up") {
        move(form, -1);
        return "continue";
    }
    if (name === "down") {
        move(form, 1);
        return "continue";
    }
    if (name === "escape" || str === "q") return "cancel";
    if (str === "s") {
        if (!form.draft.name.trim()) {
            form.message = "Name is required.";
            return "continue";
        }
        return "save";
    }
    if (str === "d" && row?.kind === "item") {
        removeSectionItem(form.draft, row.section, row.itemIndex);
        move(form, -1);
        return "continue";
    }
    if (str === "a") {
        const section =
            row?.kind === "section" ? row.section : row?.kind === "item" ? row.section : null;
        if (section) {
            form.editTarget = { kind: "newItem", section };
            form.editor = createEditor("");
        }
        return "continue";
    }
    if (name === "return" || name === "enter" || name === "space" || str === " ") {
        if (row?.kind === "radio") {
            if (row.field === "type") {
                form.draft.type = form.draft.type === "codex" ? "claude" : "codex";
            } else {
                form.draft.authMode = form.draft.authMode === "api" ? "login" : "api";
            }
            return "continue";
        }
        if (row?.kind === "field") {
            form.editTarget = { kind: "field", field: row.field };
            form.editor = createEditor(
                fieldValue(form.draft, row.field),
                row.field === "apiKey"
            );
            return "continue";
        }
        if (row?.kind === "item") {
            const items = sectionItems(form.draft, row.section);
            form.editTarget = { kind: "item", section: row.section, itemIndex: row.itemIndex };
            form.editor = createEditor(items[row.itemIndex] || "");
            return "continue";
        }
        if (row?.kind === "section") {
            form.editTarget = { kind: "newItem", section: row.section };
            form.editor = createEditor("");
            return "continue";
        }
    }
    return "continue";
}

/** Consequences of an auth switch, shown before the user saves rather than after. */
export function authChangeWarning(form: ProfileForm): string | null {
    if (form.isNew || form.draft.authMode === form.originalAuthMode) return null;
    if (form.draft.authMode === "api") {
        return "Saving moves this profile's account login aside (kept as auth.json.login-<timestamp>).";
    }
    return "Saving clears the derived API credential; run `codenv login` to sign in.";
}

export function renderForm(form: ProfileForm, width: number): string[] {
    const rows = buildRows(form);
    const labelWidth = 22;
    const lines: string[] = [];
    lines.push(form.isNew ? "New profile" : `Edit profile: ${form.draft.name || "(unnamed)"}`);
    lines.push("");

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const focused = i === form.index;
        const editing = focused && form.editor !== null;
        let text: string;
        if (row.kind === "text") {
            lines.push(row.label);
            continue;
        }
        if (row.kind === "section") {
            const count = sectionItems(form.draft, row.section).length;
            text = `${row.label}${count === 0 ? `  ${DIM}(none)${RESET}` : ""}`;
        } else if (row.kind === "item") {
            const items = sectionItems(form.draft, row.section);
            text = `  ${editing ? renderEditor(form.editor!) : items[row.itemIndex]}`;
        } else if (row.kind === "radio") {
            const value =
                row.field === "type"
                    ? form.draft.type
                    : form.draft.authMode === "api"
                    ? "API key"
                    : "account login";
            text = `${pad(row.label, labelWidth)}${value}   ${DIM}(space toggles)${RESET}`;
        } else {
            const raw = fieldValue(form.draft, row.field);
            const shown = editing
                ? renderEditor(form.editor!)
                : row.field === "apiKey"
                ? maskSecret(raw) || `${DIM}(empty)${RESET}`
                : raw || `${DIM}(empty)${RESET}`;
            text = `${pad(row.label, labelWidth)}${shown}`;
        }
        const prefixed = ` ${text}`;
        lines.push(focused && !editing ? `${INVERT}${fit(prefixed, width)}${RESET}` : prefixed);
    }

    lines.push("");
    const warning = authChangeWarning(form);
    if (warning) lines.push(`${YELLOW}! ${warning}${RESET}`);
    if (form.message) lines.push(`${YELLOW}! ${form.message}${RESET}`);
    lines.push(
        `${DIM}↑↓ move   Enter edit/toggle   a add   d delete   s save   q cancel${RESET}`
    );
    return lines;
}

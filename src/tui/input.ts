/**
 * Single-line editor used for in-place field editing
 */
import type * as readline from "readline";

export interface LineEditor {
    value: string;
    cursor: number;
    masked: boolean;
    reveal: boolean;
}

export type EditorResult = "commit" | "cancel" | "edit" | "ignore";

export function createEditor(value: string, masked = false): LineEditor {
    return { value, cursor: value.length, masked, reveal: false };
}

export function handleEditorKey(
    editor: LineEditor,
    str: string,
    key: readline.Key | undefined
): EditorResult {
    const name = key?.name;
    if (key?.ctrl && name === "c") return "cancel";
    if (name === "escape") return "cancel";
    if (name === "return" || name === "enter") return "commit";
    if (key?.ctrl && name === "r") {
        editor.reveal = !editor.reveal;
        return "edit";
    }
    if (key?.ctrl && name === "u") {
        editor.value = "";
        editor.cursor = 0;
        return "edit";
    }
    if (name === "backspace") {
        if (editor.cursor > 0) {
            editor.value =
                editor.value.slice(0, editor.cursor - 1) + editor.value.slice(editor.cursor);
            editor.cursor--;
        }
        return "edit";
    }
    if (name === "delete") {
        editor.value =
            editor.value.slice(0, editor.cursor) + editor.value.slice(editor.cursor + 1);
        return "edit";
    }
    if (name === "left") {
        editor.cursor = Math.max(0, editor.cursor - 1);
        return "edit";
    }
    if (name === "right") {
        editor.cursor = Math.min(editor.value.length, editor.cursor + 1);
        return "edit";
    }
    if (name === "home") {
        editor.cursor = 0;
        return "edit";
    }
    if (name === "end") {
        editor.cursor = editor.value.length;
        return "edit";
    }
    if (str && !key?.ctrl && !key?.meta && str >= " " && str !== "\x7f") {
        editor.value =
            editor.value.slice(0, editor.cursor) + str + editor.value.slice(editor.cursor);
        editor.cursor += str.length;
        return "edit";
    }
    return "ignore";
}

/** Show a caret inline; the real cursor stays hidden for flicker-free redraws. */
export function renderEditor(editor: LineEditor): string {
    const shown =
        editor.masked && !editor.reveal ? maskSecret(editor.value) : editor.value;
    if (editor.masked && !editor.reveal) return `${shown}▏`;
    const before = shown.slice(0, editor.cursor);
    const at = shown.slice(editor.cursor, editor.cursor + 1) || " ";
    const after = shown.slice(editor.cursor + 1);
    return `${before}\x1b[7m${at}\x1b[27m${after}`;
}

/** Keep the tail visible so a key can be recognised without exposing it. */
export function maskSecret(value: string): string {
    if (!value) return "";
    if (value.length <= 4) return "•".repeat(value.length);
    return `${"•".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}

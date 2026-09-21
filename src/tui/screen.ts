/**
 * Minimal terminal UI kernel
 *
 * Drawing goes to stderr because stdout carries the shell code that `codenv
 * use` is sourced for. The alternate screen buffer keeps API keys out of the
 * terminal's scrollback once the session ends.
 */
import * as readline from "readline";

export type KeyHandler = (str: string, key: readline.Key | undefined) => void;

export interface TuiSession {
    render(lines: string[]): void;
    /** Rows available for content, excluding nothing; callers page themselves. */
    rows(): number;
    columns(): number;
    stop(): void;
}

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR = "\x1b[H\x1b[2J";
export const RESET = "\x1b[0m";
export const INVERT = "\x1b[7m";
export const GREEN = "\x1b[32m";
export const DIM = "\x1b[2m";
export const YELLOW = "\x1b[33m";

export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

/**
 * Run a full-screen session until `stop()` is called.
 *
 * `init` receives the session and returns the key handler; it should draw the
 * first frame itself so the screen is never blank.
 */
export async function runTui(init: (session: TuiSession) => KeyHandler): Promise<void> {
    if (!isInteractive()) {
        throw new Error("Interactive mode requires a TTY.");
    }
    const out = process.stderr;
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);

    let finished = false;
    let onKey: KeyHandler = () => undefined;
    let onResize: (() => void) | null = null;

    const session: TuiSession = {
        render(lines: string[]) {
            if (finished) return;
            out.write(`${CLEAR}${HIDE_CURSOR}${lines.join("\n")}\n`);
        },
        rows: () => out.rows || 24,
        columns: () => out.columns || 80,
        stop() {
            finished = true;
        },
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    out.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);

    await new Promise<void>((resolve) => {
        const cleanup = () => {
            stdin.removeListener("keypress", dispatch);
            if (onResize) out.removeListener("resize", onResize);
            if (!wasRaw) stdin.setRawMode(false);
            stdin.pause();
            out.write(`${RESET}${SHOW_CURSOR}${LEAVE_ALT_SCREEN}`);
        };

        const dispatch: KeyHandler = (str, key) => {
            if (finished) return;
            onKey(str, key);
            if (finished) {
                cleanup();
                resolve();
            }
        };

        onResize = () => {
            if (!finished) onKey("", { name: "__resize" } as readline.Key);
        };

        stdin.on("keypress", dispatch);
        out.on("resize", onResize);
        onKey = init(session);
        if (finished) {
            cleanup();
            resolve();
        }
    });
}

/** Truncate to a column budget so a narrow terminal never wraps a row. */
export function fit(text: string, width: number): string {
    if (width <= 0) return "";
    if (text.length <= width) return text;
    if (width <= 1) return text.slice(0, width);
    return `${text.slice(0, width - 1)}…`;
}

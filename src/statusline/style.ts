const COLOR_ENABLED = !process.env.NO_COLOR && process.env.TERM !== "dumb";
const ANSI_RESET = "\x1b[0m";

export const ICON_GIT = "⎇";
export const ICON_PROFILE = "👤";
export const ICON_MODEL = "⚙";
export const ICON_USAGE = "⚡";
export const ICON_CONTEXT = "🧠";
export const ICON_REVIEW = "📝";
export const ICON_CWD = "📁";

export function colorize(text: string, colorCode: string): string {
    if (!COLOR_ENABLED) return text;
    return `\x1b[${colorCode}m${text}${ANSI_RESET}`;
}

export function dim(text: string): string {
    return colorize(text, "2");
}

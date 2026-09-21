/**
 * Small, dependency-free predicates shared across the CLI, the statusline and
 * the usage pipeline. Keep this module free of imports so any layer can use it.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

export function coerceNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

export function firstNumber(...values: Array<unknown>): number | null {
    for (const value of values) {
        const num = coerceNumber(value);
        if (num !== null) return num;
    }
    return null;
}

/** Tri-state env flag: true/false when recognized, null when unset or unknown. */
export function parseBooleanEnv(value: string | undefined): boolean | null {
    if (value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
}

/** Escape a string for literal use inside a RegExp. */
export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

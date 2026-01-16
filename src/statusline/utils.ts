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

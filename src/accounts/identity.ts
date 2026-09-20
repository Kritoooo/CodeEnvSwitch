/**
 * Reading a human-recognisable account label out of a credential file
 */
import type { ProfileType } from "../types";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    try {
        const json = Buffer.from(
            parts[1].replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
        ).toString("utf8");
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }
    return null;
}

function findEmail(value: unknown, depth = 0): string | null {
    if (depth > 4 || !value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.email === "string" && record.email) return record.email;
    for (const nested of Object.values(record)) {
        const found = findEmail(nested, depth + 1);
        if (found) return found;
    }
    return null;
}

/** Best-effort label for the account a credential file belongs to. */
export function describeCredential(type: ProfileType, text: string | null): string | null {
    if (!text) return null;
    let parsed: Record<string, unknown>;
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        parsed = value as Record<string, unknown>;
    } catch {
        return null;
    }

    if (type === "codex") {
        const tokens = parsed.tokens as Record<string, unknown> | undefined;
        if (tokens && typeof tokens.id_token === "string") {
            const claims = decodeJwtPayload(tokens.id_token);
            const email = findEmail(claims);
            if (email) return email;
        }
        if (tokens && typeof tokens.account_id === "string") {
            return `account ${tokens.account_id}`;
        }
        if (parsed.OPENAI_API_KEY) return "API key";
        return null;
    }

    const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
    if (oauth) {
        const tier = oauth.subscriptionType;
        return typeof tier === "string" && tier ? `${tier} account` : "account login";
    }
    return null;
}

/** Which auth path a credential file represents, judged by its contents. */
export function detectAuthMode(
    type: ProfileType,
    text: string | null
): "login" | "api" | null {
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") return null;
        const record = parsed as Record<string, unknown>;
        if (type === "codex") {
            if (record.tokens) return "login";
            if (record.OPENAI_API_KEY) return "api";
            return null;
        }
        return record.claudeAiOauth ? "login" : null;
    } catch {
        return null;
    }
}

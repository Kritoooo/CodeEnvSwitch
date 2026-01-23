import type { Config, Profile, TokenPricing } from "../types";

const TOKENS_PER_MILLION = 1_000_000;

export const DEFAULT_MODEL_PRICING: Record<string, TokenPricing> = {
    "Claude Sonnet 4.5": {
        input: 3.0,
        output: 15.0,
        cacheWrite: 3.75,
        cacheRead: 0.3,
        description: "Balanced performance and speed for daily use.",
    },
    "Sonnet 4.5": {
        input: 3.0,
        output: 15.0,
        cacheWrite: 3.75,
        cacheRead: 0.3,
        description: "Balanced performance and speed for daily use.",
    },
    "Claude Opus 4.5": {
        input: 5.0,
        output: 25.0,
        cacheWrite: 6.25,
        cacheRead: 0.5,
        description: "Most capable model for agents and coding.",
    },
    "Opus 4.5": {
        input: 5.0,
        output: 25.0,
        cacheWrite: 6.25,
        cacheRead: 0.5,
        description: "Most capable model for agents and coding.",
    },
    "Claude Haiku 4.5": {
        input: 1.0,
        output: 5.0,
        cacheWrite: 1.25,
        cacheRead: 0.1,
        description: "Fast responses for lightweight tasks.",
    },
    "Haiku 4.5": {
        input: 1.0,
        output: 5.0,
        cacheWrite: 1.25,
        cacheRead: 0.1,
        description: "Fast responses for lightweight tasks.",
    },
    "claude-opus-4-5-20251101": {
        input: 5.0,
        output: 25.0,
        cacheWrite: 6.25,
        cacheRead: 0.5,
        description: "Most capable model for agents and coding.",
    },
    "claude-sonnet-4-5-20251022": {
        input: 3.0,
        output: 15.0,
        cacheWrite: 3.75,
        cacheRead: 0.3,
        description: "Balanced performance and speed for daily use.",
    },
    "claude-haiku-4-5-20251022": {
        input: 1.0,
        output: 5.0,
        cacheWrite: 1.25,
        cacheRead: 0.1,
        description: "Fast responses for lightweight tasks.",
    },
    "gpt-5.1": {
        input: 1.25,
        output: 10.0,
        cacheRead: 0.125,
        description: "Base model for daily development work.",
    },
    "gpt-5.1-codex": {
        input: 1.25,
        output: 10.0,
        cacheRead: 0.125,
        description: "Code-focused model for programming workflows.",
    },
    "gpt-5.1-codex-max": {
        input: 1.25,
        output: 10.0,
        cacheRead: 0.125,
        description: "Flagship code model for complex projects.",
    },
    "gpt-5.2": {
        input: 1.75,
        output: 14.0,
        cacheRead: 0.175,
        description: "Latest flagship model with improved performance.",
    },
    "gpt-5.2-codex": {
        input: 1.75,
        output: 14.0,
        cacheRead: 0.175,
        description: "Latest flagship code model.",
    },
};

export interface UsageTokenBreakdown {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
    todayTokens?: number | null;
    totalTokens?: number | null;
}

function normalizeModelKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parsePriceValue(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
        if (match) {
            const parsed = Number(match[0]);
            return Number.isFinite(parsed) ? parsed : null;
        }
    }
    return null;
}

function compactPricing(value: TokenPricing | null | undefined): TokenPricing | null {
    if (!value || typeof value !== "object") return null;
    const input = parsePriceValue(value.input);
    const output = parsePriceValue(value.output);
    const cacheRead = parsePriceValue(value.cacheRead);
    const cacheWrite = parsePriceValue(value.cacheWrite);
    const description =
        typeof value.description === "string" && value.description.trim()
            ? value.description.trim()
            : undefined;
    const pricing: TokenPricing = {};
    let hasNumber = false;
    if (input !== null) {
        pricing.input = input;
        hasNumber = true;
    }
    if (output !== null) {
        pricing.output = output;
        hasNumber = true;
    }
    if (cacheRead !== null) {
        pricing.cacheRead = cacheRead;
        hasNumber = true;
    }
    if (cacheWrite !== null) {
        pricing.cacheWrite = cacheWrite;
        hasNumber = true;
    }
    if (description) pricing.description = description;
    return hasNumber ? pricing : null;
}

function resolveMultiplier(value: unknown): number | null {
    const parsed = parsePriceValue(value);
    if (parsed === null) return null;
    if (parsed < 0) return null;
    return parsed;
}

function applyMultiplier(
    pricing: TokenPricing | null,
    multiplier: number | null
): TokenPricing | null {
    if (!pricing) return null;
    if (multiplier === null) return pricing;
    const scaled: TokenPricing = {};
    if (pricing.input !== undefined) scaled.input = pricing.input * multiplier;
    if (pricing.output !== undefined) scaled.output = pricing.output * multiplier;
    if (pricing.cacheRead !== undefined) scaled.cacheRead = pricing.cacheRead * multiplier;
    if (pricing.cacheWrite !== undefined) scaled.cacheWrite = pricing.cacheWrite * multiplier;
    if (pricing.description) scaled.description = pricing.description;
    return scaled;
}

function buildModelIndex(
    models: Record<string, TokenPricing> | undefined
): Map<string, { model: string; pricing: TokenPricing }> {
    const index = new Map<string, { model: string; pricing: TokenPricing }>();
    if (!models) return index;
    for (const [model, pricing] of Object.entries(models)) {
        const key = normalizeModelKey(model);
        if (!key) continue;
        const cleaned = compactPricing(pricing);
        if (!cleaned) continue;
        index.set(key, { model, pricing: cleaned });
    }
    return index;
}

function resolveModelPricing(
    config: Config,
    model: string | null
): { model: string; pricing: TokenPricing } | null {
    if (!model) return null;
    const key = normalizeModelKey(model);
    if (!key) return null;
    const configIndex = buildModelIndex(config.pricing?.models);
    const fromConfig = configIndex.get(key);
    if (fromConfig) return fromConfig;
    const defaultsIndex = buildModelIndex(DEFAULT_MODEL_PRICING);
    return defaultsIndex.get(key) || null;
}

function mergePricing(
    base: TokenPricing | null,
    override: TokenPricing | null
): TokenPricing | null {
    if (!base && !override) return null;
    return compactPricing({ ...(base || {}), ...(override || {}) });
}

function getProfilePricing(profile: Profile | null): {
    model: string | null;
    pricing: TokenPricing | null;
    multiplier: unknown;
} {
    if (!profile || !profile.pricing || typeof profile.pricing !== "object") {
        return { model: null, pricing: null, multiplier: null };
    }
    const raw = profile.pricing as TokenPricing & {
        model?: unknown;
        multiplier?: unknown;
    };
    const model =
        typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : null;
    return {
        model,
        pricing: compactPricing(raw),
        multiplier: raw.multiplier ?? null,
    };
}

export function resolvePricingForProfile(
    config: Config,
    profile: Profile | null,
    model: string | null
): TokenPricing | null {
    const profilePricing = getProfilePricing(profile);
    const baseFromProfileModel = profilePricing.model
        ? resolveModelPricing(config, profilePricing.model)
        : null;
    const mergedProfile = mergePricing(
        baseFromProfileModel ? baseFromProfileModel.pricing : null,
        profilePricing.pricing
    );
    const resolvedPricing =
        mergedProfile ||
        (baseFromProfileModel ? baseFromProfileModel.pricing : null) ||
        (resolveModelPricing(config, model)?.pricing ?? null);
    if (!resolvedPricing) return null;
    const multiplier = resolveMultiplier(profilePricing.multiplier);
    return applyMultiplier(resolvedPricing, multiplier);
}

function toFiniteNumber(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

export function calculateUsageCost(
    usage: UsageTokenBreakdown | null,
    pricing: TokenPricing | null
): number | null {
    if (!usage || !pricing) return null;
    const inputTokens = toFiniteNumber(usage.inputTokens);
    const outputTokens = toFiniteNumber(usage.outputTokens);
    const cacheReadTokens = toFiniteNumber(usage.cacheReadTokens);
    const cacheWriteTokens = toFiniteNumber(usage.cacheWriteTokens);
    if (
        inputTokens === null &&
        outputTokens === null &&
        cacheReadTokens === null &&
        cacheWriteTokens === null
    ) {
        return null;
    }
    const tokens = {
        input: Math.max(0, inputTokens || 0),
        output: Math.max(0, outputTokens || 0),
        cacheRead: Math.max(0, cacheReadTokens || 0),
        cacheWrite: Math.max(0, cacheWriteTokens || 0),
    };
    const knownTotal = toFiniteNumber(
        usage.todayTokens ?? usage.totalTokens ?? null
    );
    const breakdownTotal =
        tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
    if (breakdownTotal === 0 && knownTotal !== null && knownTotal > 0) {
        return null;
    }
    if (tokens.input > 0 && pricing.input === undefined) return null;
    if (tokens.output > 0 && pricing.output === undefined) return null;
    if (tokens.cacheRead > 0 && pricing.cacheRead === undefined) return null;
    if (tokens.cacheWrite > 0 && pricing.cacheWrite === undefined) return null;
    const total =
        (tokens.input * (pricing.input ?? 0) +
            tokens.output * (pricing.output ?? 0) +
            tokens.cacheRead * (pricing.cacheRead ?? 0) +
            tokens.cacheWrite * (pricing.cacheWrite ?? 0)) /
        TOKENS_PER_MILLION;
    return Number.isFinite(total) ? total : null;
}

export function formatUsdAmount(amount: number | null): string {
    if (amount === null || !Number.isFinite(amount)) return "-";
    const normalized = Math.abs(amount) < 1e-12 ? 0 : amount;
    const abs = Math.abs(normalized);
    let decimals = 2;
    if (abs < 1) decimals = 4;
    if (abs < 0.1) decimals = 5;
    if (abs < 0.01) decimals = 6;
    let text = normalized.toFixed(decimals);
    text = text.replace(/\.?0+$/, "");
    return `$${text}`;
}

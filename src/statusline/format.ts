import { formatTokenCount } from "../usage";
import { formatUsdAmount } from "../usage/pricing";
import {
    ICON_CONTEXT,
    ICON_CWD,
    ICON_MODEL,
    ICON_PROFILE,
    ICON_REVIEW,
    ICON_USAGE,
    colorize,
    dim,
} from "./style";
import * as path from "path";

export function getCwdSegment(cwd: string): string | null {
    if (!cwd) return null;
    const base = path.basename(cwd) || cwd;
    const segment = `${ICON_CWD} ${base}`;
    return dim(segment);
}

export function formatUsageSegment(
    todayCost: number | null,
    sessionCost: number | null
): string | null {
    if (todayCost === null && sessionCost === null) return null;
    const todayText = `T ${formatUsdAmount(todayCost)}`;
    const sessionText = `S ${formatUsdAmount(sessionCost)}`;
    const text = `${todayText} / ${sessionText}`;
    return colorize(`${ICON_USAGE} ${text}`, "33");
}

export function formatModelSegment(
    model: string | null,
    provider: string | null
): string | null {
    if (!model) return null;
    const providerLabel = provider ? `${provider}:${model}` : model;
    return colorize(`${ICON_MODEL} ${providerLabel}`, "35");
}

export function formatProfileSegment(
    type: string | null,
    profileKey: string | null,
    profileName: string | null
): string | null {
    const name = profileName || profileKey;
    if (!name) return null;
    const label = type ? `${type}:${name}` : name;
    return colorize(`${ICON_PROFILE} ${label}`, "37");
}

export function formatContextSegment(contextLeft: number | null): string | null {
    if (contextLeft === null) return null;
    const left = Math.max(0, Math.min(100, Math.round(contextLeft)));
    return colorize(`${ICON_CONTEXT} ${left}% left`, "36");
}

export function formatContextUsedSegment(usedTokens: number | null): string | null {
    if (usedTokens === null) return null;
    return colorize(`${ICON_CONTEXT} ${formatTokenCount(usedTokens)} used`, "36");
}

export function formatModeSegment(reviewMode: boolean): string | null {
    if (!reviewMode) return null;
    return colorize(`${ICON_REVIEW} review`, "34");
}

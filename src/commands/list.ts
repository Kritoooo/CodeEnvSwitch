/**
 * List command - show all profiles
 */
import type { Config } from "../types";
import { buildListRows } from "../profile/display";
import { getResolvedDefaultProfileKeys } from "../config/defaults";
import {
    formatTokenCount,
    readUsageTotalsIndex,
    resolveUsageTotalsForProfile,
} from "../usage";

export function printList(config: Config, configPath: string | null): void {
    const rows = buildListRows(config, getResolvedDefaultProfileKeys);
    if (rows.length === 0) {
        console.log("(no profiles found)");
        return;
    }
    try {
        const usageTotals = readUsageTotalsIndex(config, configPath, true);
        if (usageTotals) {
            for (const row of rows) {
                if (!row.usageType) continue;
                const usage = resolveUsageTotalsForProfile(
                    usageTotals,
                    row.usageType,
                    row.key,
                    row.name
                );
                if (!usage) continue;
                row.todayTokens = usage.today;
                row.totalTokens = usage.total;
            }
        }
    } catch {
        // ignore usage sync errors
    }
    const headerName = "PROFILE";
    const headerType = "TYPE";
    const headerToday = "TODAY";
    const headerTotal = "TOTAL";
    const headerNote = "NOTE";
    const todayTexts = rows.map((row) => formatTokenCount(row.todayTokens));
    const totalTexts = rows.map((row) => formatTokenCount(row.totalTokens));
    const nameWidth = Math.max(
        headerName.length,
        ...rows.map((row) => row.name.length)
    );
    const typeWidth = Math.max(
        headerType.length,
        ...rows.map((row) => row.type.length)
    );
    const todayWidth = Math.max(headerToday.length, ...todayTexts.map((v) => v.length));
    const totalWidth = Math.max(headerTotal.length, ...totalTexts.map((v) => v.length));
    const noteWidth = Math.max(
        headerNote.length,
        ...rows.map((row) => row.note.length)
    );
    const formatRow = (
        name: string,
        type: string,
        today: string,
        total: string,
        note: string
    ) =>
        `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${today.padStart(
            todayWidth
        )}  ${total.padStart(totalWidth)}  ${note.padEnd(noteWidth)}`;

    console.log(formatRow(headerName, headerType, headerToday, headerTotal, headerNote));
    console.log(
        formatRow(
            "-".repeat(nameWidth),
            "-".repeat(typeWidth),
            "-".repeat(todayWidth),
            "-".repeat(totalWidth),
            "-".repeat(noteWidth)
        )
    );
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const todayText = todayTexts[i] || "-";
        const totalText = totalTexts[i] || "-";
        const line = formatRow(row.name, row.type, todayText, totalText, row.note);
        if (row.active) {
            console.log(`\x1b[32m${line}\x1b[0m`);
        } else {
            console.log(line);
        }
    }
}

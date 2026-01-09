/**
 * Statusline command - output statusline text or JSON
 */
import type { Config, StatuslineArgs } from "../types";
import { buildStatuslineResult } from "../statusline";

export function printStatusline(
    config: Config,
    configPath: string | null,
    args: StatuslineArgs
): void {
    const result = buildStatuslineResult(args, config, configPath);
    if (args.format === "json") {
        console.log(JSON.stringify(result.json));
        return;
    }
    console.log(result.text);
}

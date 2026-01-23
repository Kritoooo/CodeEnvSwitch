/**
 * Usage history reset command
 */
import type { Config, UsageResetArgs } from "../types";
import { clearUsageHistory } from "../usage";
import { askConfirm, createReadline } from "../ui";

export async function runUsageReset(
    config: Config,
    configPath: string | null,
    args: UsageResetArgs
): Promise<void> {
    if (!args.yes) {
        const rl = createReadline();
        try {
            const confirmed = await askConfirm(
                rl,
                "Clear all usage history files? This cannot be undone. (y/N): "
            );
            if (!confirmed) return;
        } finally {
            rl.close();
        }
    }

    const result = clearUsageHistory(config, configPath);
    const removed = result.removed.sort();
    const missing = result.missing.sort();
    const failed = result.failed.sort((a, b) => a.path.localeCompare(b.path));

    if (removed.length === 0 && failed.length === 0) {
        console.log("No usage files found.");
        return;
    }

    if (removed.length > 0) {
        console.log(`Removed ${removed.length} file(s):`);
        for (const filePath of removed) {
            console.log(`- ${filePath}`);
        }
    }

    if (missing.length > 0) {
        console.log(`Skipped ${missing.length} missing file(s).`);
    }

    if (failed.length > 0) {
        for (const failure of failed) {
            console.error(`Failed to remove ${failure.path}: ${failure.error}`);
        }
        process.exitCode = 1;
    }
}

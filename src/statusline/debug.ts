import * as fs from "fs";
import * as path from "path";
import { resolvePath } from "../shell/utils";
import { getConfigDir } from "../config/io";

function isStatuslineDebugEnabled(): boolean {
    const raw = process.env.CODE_ENV_STATUSLINE_DEBUG;
    if (!raw) return false;
    const value = String(raw).trim().toLowerCase();
    if (!value) return false;
    return !["0", "false", "no", "off"].includes(value);
}

export function getStatuslineDebugPath(configPath: string | null): string {
    const envPath = resolvePath(process.env.CODE_ENV_STATUSLINE_DEBUG_PATH);
    if (envPath) return envPath;
    return path.join(getConfigDir(configPath), "statusline-debug.jsonl");
}

export function appendStatuslineDebug(
    configPath: string | null,
    payload: Record<string, unknown>
) {
    if (!isStatuslineDebugEnabled()) return;
    try {
        const debugPath = getStatuslineDebugPath(configPath);
        const dir = path.dirname(debugPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(debugPath, `${JSON.stringify(payload)}\n`, "utf8");
    } catch {
        // ignore debug logging failures
    }
}

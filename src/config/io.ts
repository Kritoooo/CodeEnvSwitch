/**
 * Config I/O utilities
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Config } from "../types";
import { resolvePath } from "../shell/utils";

export function getDefaultConfigPath(): string {
    return path.join(os.homedir(), ".config", "code-env", "config.json");
}

export function findConfigPath(explicitPath: string | null): string | null {
    if (explicitPath) {
        const resolved = resolvePath(explicitPath);
        if (fs.existsSync(resolved)) return resolved;
        return resolved; // let readConfig raise a helpful error
    }

    if (process.env.CODE_ENV_CONFIG) {
        const fromEnv = resolvePath(process.env.CODE_ENV_CONFIG);
        if (fs.existsSync(fromEnv)) return fromEnv;
        return fromEnv;
    }
    return getDefaultConfigPath();
}

export function findConfigPathForWrite(explicitPath: string | null): string {
    if (explicitPath) return resolvePath(explicitPath)!;
    if (process.env.CODE_ENV_CONFIG) return resolvePath(process.env.CODE_ENV_CONFIG)!;
    return getDefaultConfigPath();
}

export function readConfig(configPath: string): Config {
    if (!configPath) {
        throw new Error(
            "No config file found. Use --config or set CODE_ENV_CONFIG."
        );
    }
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const raw = fs.readFileSync(configPath, "utf8");
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`Invalid JSON in config: ${configPath}`);
    }
}

export function readConfigIfExists(configPath: string | null): Config {
    if (!configPath || !fs.existsSync(configPath)) {
        return { unset: [], profiles: {} };
    }
    return readConfig(configPath);
}

export function writeConfig(configPath: string, config: Config): void {
    if (!configPath) {
        throw new Error("Missing config path for write.");
    }
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, `${data}\n`, "utf8");
}

/**
 * Shell utility functions
 */
import * as path from "path";
import * as os from "os";

export function shellEscape(value: string | number | boolean): string {
    const str = String(value);
    return `'${str.replace(/'/g, `'\\''`)}'`;
}

export function expandEnv(input: string | null | undefined): string | null | undefined {
    if (!input) return input;
    let out = String(input);
    if (out.startsWith("~")) {
        out = path.join(os.homedir(), out.slice(1));
    }
    out = out.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || "");
    out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => process.env[key] || "");
    return out;
}

export function resolvePath(p: string | null | undefined): string | null {
    if (!p) return null;
    if (p.startsWith("~")) {
        return path.join(os.homedir(), p.slice(1));
    }
    if (path.isAbsolute(p)) return p;
    return path.resolve(process.cwd(), p);
}

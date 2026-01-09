/**
 * Shell detection utilities
 */
import * as path from "path";
import * as os from "os";

export function normalizeShell(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (raw === "bash") return "bash";
    if (raw === "zsh") return "zsh";
    if (raw === "fish") return "fish";
    return null;
}

export function detectShell(explicitShell: string | null | undefined): string | null {
    if (explicitShell) return normalizeShell(explicitShell);
    const envShell = process.env.SHELL ? path.basename(process.env.SHELL) : "";
    return normalizeShell(envShell);
}

export function getShellRcPath(shellName: string | null): string | null {
    if (shellName === "bash") return path.join(os.homedir(), ".bashrc");
    if (shellName === "zsh") return path.join(os.homedir(), ".zshrc");
    if (shellName === "fish") {
        return path.join(os.homedir(), ".config", "fish", "config.fish");
    }
    return null;
}

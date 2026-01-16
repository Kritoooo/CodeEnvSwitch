import { spawnSync } from "child_process";
import type { GitStatus } from "./types";
import { colorize } from "./style";
import { ICON_GIT } from "./style";

export function getGitStatus(cwd: string): GitStatus | null {
    if (!cwd) return null;
    const result = spawnSync("git", ["-C", cwd, "status", "--porcelain=v2", "-b"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || !result.stdout) return null;
    const status: GitStatus = {
        branch: null,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };

    const lines = result.stdout.split(/\r?\n/);
    for (const line of lines) {
        if (!line) continue;
        if (line.startsWith("# branch.head ")) {
            status.branch = line.slice("# branch.head ".length).trim();
            continue;
        }
        if (line.startsWith("# branch.ab ")) {
            const parts = line
                .slice("# branch.ab ".length)
                .trim()
                .split(/\s+/);
            for (const part of parts) {
                if (part.startsWith("+")) status.ahead = Number(part.slice(1)) || 0;
                if (part.startsWith("-")) status.behind = Number(part.slice(1)) || 0;
            }
            continue;
        }
        if (line.startsWith("? ")) {
            status.untracked += 1;
            continue;
        }
        if (line.startsWith("u ")) {
            status.conflicted += 1;
            continue;
        }
        if (line.startsWith("1 ") || line.startsWith("2 ")) {
            const parts = line.split(/\s+/);
            const xy = parts[1] || "";
            const staged = xy[0];
            const unstaged = xy[1];
            if (staged && staged !== ".") status.staged += 1;
            if (unstaged && unstaged !== ".") status.unstaged += 1;
            continue;
        }
    }

    if (!status.branch) {
        status.branch = "HEAD";
    }
    return status;
}

export function formatGitSegment(status: GitStatus | null): string | null {
    if (!status || !status.branch) return null;
    const meta: string[] = [];
    const dirtyCount = status.staged + status.unstaged + status.untracked;
    if (status.ahead > 0) meta.push(`↑${status.ahead}`);
    if (status.behind > 0) meta.push(`↓${status.behind}`);
    if (status.conflicted > 0) meta.push(`✖${status.conflicted}`);
    if (dirtyCount > 0) meta.push(`+${dirtyCount}`);
    const suffix = meta.length > 0 ? ` [${meta.join("")}]` : "";
    const text = `${ICON_GIT} ${status.branch}${suffix}`;
    const hasConflicts = status.conflicted > 0;
    const isDirty = dirtyCount > 0;
    if (hasConflicts) return colorize(text, "31");
    if (isDirty) return colorize(text, "33");
    if (status.ahead > 0 || status.behind > 0) return colorize(text, "36");
    return colorize(text, "32");
}

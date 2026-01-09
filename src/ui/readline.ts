/**
 * Readline utilities
 */
import * as readline from "readline";
import type { Config, ProfileType } from "../types";
import { findProfileKeysByName } from "../profile/match";

export function createReadline(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

export function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
    });
}

export async function askRequired(rl: readline.Interface, question: string): Promise<string> {
    while (true) {
        const answer = String(await ask(rl, question)).trim();
        if (answer) return answer;
    }
}

export async function askConfirm(rl: readline.Interface, question: string): Promise<boolean> {
    const answer = String(await ask(rl, question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
}

export async function askType(rl: readline.Interface): Promise<ProfileType> {
    while (true) {
        const answer = String(
            await ask(rl, "Select type (1=codex, 2=claude): ")
        )
            .trim()
            .toLowerCase();
        if (answer === "1") return "codex";
        if (answer === "2") return "claude";
        const normalized = answer.replace(/[\s-]+/g, "");
        if (normalized === "codex") return "codex";
        if (
            normalized === "claude" ||
            normalized === "claudecode" ||
            normalized === "cc"
        )
            return "claude";
    }
}

export async function askProfileName(
    rl: readline.Interface,
    config: Config,
    defaultName: string,
    type: ProfileType
): Promise<{ name: string; key: string | null }> {
    while (true) {
        const answer = String(
            await ask(rl, `Profile name (default: ${defaultName}): `)
        ).trim();
        const baseName = answer || defaultName;
        if (!baseName) continue;
        const matches = findProfileKeysByName(config, baseName, type);
        if (matches.length === 0) {
            return { name: baseName, key: null };
        }
        if (matches.length === 1) {
            const overwrite = String(
                await ask(rl, `Profile "${baseName}" exists. Overwrite? (y/N): `)
            )
                .trim()
                .toLowerCase();
            if (overwrite === "y" || overwrite === "yes") {
                return { name: baseName, key: matches[0] };
            }
            continue;
        }
        console.log(
            `Multiple profiles named "${baseName}" for type "${type}". ` +
            `Use a unique name or update by key in config.`
        );
    }
}

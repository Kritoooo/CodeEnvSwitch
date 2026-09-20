/**
 * Readline utilities
 */
import * as readline from "readline";

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

export async function askConfirm(rl: readline.Interface, question: string): Promise<boolean> {
    const answer = String(await ask(rl, question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
}

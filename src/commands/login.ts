/**
 * Login command - run the tool's own login flow against a profile's account
 */
import { spawn } from "child_process";
import type { Config, LoginArgs } from "../types";
import { resolveProfileByType } from "../profile/resolve";
import { getProfileDisplayName } from "../profile/type";
import { applyProfileAccount } from "../accounts";

export async function runLogin(
    config: Config,
    configPath: string | null,
    args: LoginArgs
): Promise<number> {
    if (!args.type) {
        throw new Error("Missing type. Use: codenv login <codex|claude> <name>.");
    }
    if (!args.name) {
        throw new Error("Missing profile name. Use: codenv login <codex|claude> <name>.");
    }
    const profileKey = resolveProfileByType(config, args.type, args.name, args.type);
    const profile = (config.profiles || {})[profileKey];
    if (!profile) throw new Error(`Unknown profile: ${args.name}`);

    const report = applyProfileAccount(config, configPath, profileKey, args.type);
    for (const warning of report.warnings) console.error(`codenv: ${warning}`);

    const displayName = getProfileDisplayName(profileKey, profile, args.type);
    console.log(`Logging in for ${args.type} profile "${displayName}".`);
    const command = args.type === "codex" ? "codex" : "claude";
    const commandArgs = args.type === "codex" ? ["login"] : [];
    if (args.type === "claude") {
        console.log("Run /login inside Claude Code to finish, then exit.");
    }

    return await new Promise<number>((resolve) => {
        const child = spawn(command, commandArgs, { stdio: "inherit", env: process.env });
        child.on("error", (err) => {
            console.error(`codenv: failed to launch ${command}: ${err.message}`);
            resolve(1);
        });
        child.on("exit", (code) => resolve(typeof code === "number" ? code : 0));
    });
}

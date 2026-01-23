#!/usr/bin/env node
/**
 * codenv - switch Claude/Codex env vars
 * Main entry point
 */
import * as fs from "fs";
import type { Config, ProfileType } from "./types";
import { DEFAULT_PROFILE_TYPES } from "./constants";
import {
    parseArgs,
    parseInitArgs,
    parseAddArgs,
    parseUsageResetArgs,
    parseStatuslineArgs,
    printHelp,
} from "./cli";
import { detectShell, getShellRcPath, getShellSnippet, upsertShellSnippet } from "./shell";
import {
    findConfigPath,
    findConfigPathForWrite,
    readConfig,
    readConfigIfExists,
    writeConfig,
    getDefaultProfiles,
    deleteDefaultProfileEntry,
    resolveDefaultProfileForType,
} from "./config";
import { normalizeType, inferProfileType, resolveProfileName } from "./profile";
import {
    addConfig,
    printList,
    printShow,
    printUse,
    printUnset,
    runLaunch,
    printStatusline,
    runUsageReset,
} from "./commands";
import { logProfileUse } from "./usage";
import { createReadline, askConfirm, runInteractiveAdd, runInteractiveUse } from "./ui";

function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
        printHelp();
        return;
    }

    const args = parsed.args || [];

    if (args.length === 0) {
        printHelp();
        return;
    }

    const cmd = args[0];
    try {
        if (cmd === "init") {
            const initArgs = parseInitArgs(args.slice(1));
            const shellName = detectShell(initArgs.shell);
            if (!shellName) {
                throw new Error(
                    "Unknown shell. Use --shell <bash|zsh|fish> to specify."
                );
            }
            const snippet = getShellSnippet(shellName);
            if (initArgs.apply) {
                const rcPath = getShellRcPath(shellName);
                upsertShellSnippet(rcPath!, snippet);
                console.log(`Updated shell config: ${rcPath}`);
            } else {
                console.log(snippet);
            }
            return;
        }

        if (cmd === "add") {
            const writePath = findConfigPathForWrite(parsed.configPath);
            const addArgsRaw = args.slice(1);
            const hasInteractive = addArgsRaw.length === 0;
            if (hasInteractive) {
                await runInteractiveAdd(writePath);
                return;
            }
            const addArgsResult = parseAddArgs(addArgsRaw);
            const config = readConfigIfExists(writePath);
            const updated = addConfig(config, addArgsResult);
            writeConfig(writePath, updated);
            console.log(`Updated config: ${writePath}`);
            return;
        }

        if (cmd === "auto") {
            const configPath = findConfigPath(parsed.configPath);
            if (!configPath || !fs.existsSync(configPath)) return;
            const config = readConfig(configPath);
            const defaults = getDefaultProfiles(config);
            const hasDefaults = DEFAULT_PROFILE_TYPES.some((type) => defaults[type]);
            if (!hasDefaults) return;

            let includeGlobalUnset = true;
            for (const type of DEFAULT_PROFILE_TYPES) {
                const value = defaults[type];
                if (!value) continue;
                try {
                    const profileName = resolveDefaultProfileForType(
                        config,
                        type,
                        value
                    );
                    if (!profileName) continue;
                    logProfileUse(
                        config,
                        configPath,
                        profileName,
                        type,
                        process.env.CODE_ENV_TERMINAL_TAG || null,
                        process.cwd()
                    );
                    printUse(config, profileName, type, includeGlobalUnset, configPath);
                    includeGlobalUnset = false;
                } catch (err: unknown) {
                    console.error(`codenv: ${getErrorMessage(err)}`);
                }
            }
            return;
        }

        if (cmd === "launch") {
            const params = args.slice(1);
            if (params.length === 0) {
                throw new Error("Missing launch target.");
            }
            const target = params[0];
            const passArgs = params.slice(1);
            if (passArgs[0] === "--") passArgs.shift();
            const configPath =
                process.env.CODE_ENV_CONFIG_PATH || findConfigPath(parsed.configPath);
            const config = readConfigIfExists(configPath);
            const exitCode = await runLaunch(config, configPath, target, passArgs);
            process.exit(exitCode);
        }

        if (cmd === "statusline") {
            const statuslineArgs = parseStatuslineArgs(args.slice(1));
            const configPath =
                process.env.CODE_ENV_CONFIG_PATH || findConfigPath(parsed.configPath);
            const config = readConfigIfExists(configPath);
            printStatusline(config, configPath, statuslineArgs);
            return;
        }

        if (cmd === "usage-reset" || cmd === "reset-usage") {
            const resetArgs = parseUsageResetArgs(args.slice(1));
            const configPath =
                process.env.CODE_ENV_CONFIG_PATH || findConfigPath(parsed.configPath);
            const config = readConfigIfExists(configPath);
            await runUsageReset(config, configPath, resetArgs);
            return;
        }

        const configPath = findConfigPath(parsed.configPath);
        const config = readConfig(configPath!);

        if (cmd === "default") {
            const params = args.slice(1);
            if (params.length === 0) {
                throw new Error("Missing profile name.");
            }
            const clear =
                params.length === 1 &&
                (params[0] === "--clear" || params[0] === "--unset");
            if (clear) {
                const rl = createReadline();
                try {
                    const confirmed = await askConfirm(
                        rl,
                        "Clear all default profiles? (y/N): "
                    );
                    if (!confirmed) return;
                } finally {
                    rl.close();
                }
                let changed = false;
                if (Object.prototype.hasOwnProperty.call(config, "defaultProfiles")) {
                    delete config.defaultProfiles;
                    changed = true;
                }
                if (changed) {
                    writeConfig(configPath!, config);
                    console.log(`Updated config: ${configPath}`);
                }
                return;
            }
            const requestedType =
                params.length >= 2 ? normalizeType(params[0]) : null;
            const profileName = resolveProfileName(config, params);
            let targetType = requestedType;
            if (!targetType) {
                const profile = config.profiles && config.profiles[profileName];
                targetType = inferProfileType(profileName, profile, null);
            }
            if (!targetType) {
                throw new Error(
                    "Unable to infer profile type. Use: codenv default <type> <name>."
                );
            }
            if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
                config.defaultProfiles = {};
            }
            config.defaultProfiles[targetType] = profileName;
            writeConfig(configPath!, config);
            console.log(`Updated config: ${configPath}`);
            return;
        }

        if (cmd === "remove") {
            const params = args.slice(1);
            if (params.length === 0) {
                throw new Error("Missing profile name.");
            }
            const isAll = params.length === 1 && params[0] === "--all";
            if (isAll) {
                if (!config.profiles || typeof config.profiles !== "object") {
                    config.profiles = {};
                } else {
                    config.profiles = {};
                }
                if (Object.prototype.hasOwnProperty.call(config, "defaultProfiles")) {
                    delete config.defaultProfiles;
                }
                writeConfig(configPath!, config);
                console.log(`Updated config: ${configPath}`);
                return;
            }

            const targets: string[] = [];
            const allPairs =
                params.length >= 2 &&
                params.length % 2 === 0 &&
                params.every((value, idx) =>
                    idx % 2 === 0 ? normalizeType(value) : true
                );
            if (allPairs) {
                for (let i = 0; i < params.length; i += 2) {
                    targets.push(resolveProfileName(config, params.slice(i, i + 2)));
                }
            } else {
                for (const param of params) {
                    targets.push(resolveProfileName(config, [param]));
                }
            }

            const uniqueTargets = Array.from(new Set(targets));
            const missing = uniqueTargets.filter(
                (name) => !config.profiles || !config.profiles[name]
            );
            if (missing.length > 0) {
                throw new Error(`Unknown profile(s): ${missing.join(", ")}`);
            }

            for (const name of uniqueTargets) {
                delete config.profiles![name];
            }

            const defaults = getDefaultProfiles(config);
            let changedDefaults = false;
            for (const type of DEFAULT_PROFILE_TYPES) {
                const value = defaults[type];
                if (!value) continue;
                try {
                    const resolved = resolveDefaultProfileForType(config, type, value);
                    if (resolved && uniqueTargets.includes(resolved)) {
                        if (deleteDefaultProfileEntry(config, type)) {
                            changedDefaults = true;
                        }
                    }
                } catch (err) {
                    // keep defaults that cannot be resolved
                }
            }
            if (
                changedDefaults &&
                config.defaultProfiles &&
                Object.keys(config.defaultProfiles).length === 0
            ) {
                delete config.defaultProfiles;
            }
            writeConfig(configPath!, config);
            console.log(`Updated config: ${configPath}`);
            return;
        }

        if (cmd === "config") {
            const cfgPath = findConfigPath(parsed.configPath);
            if (!cfgPath) {
                console.log("(no config found)");
                return;
            }
            console.log(cfgPath);
            return;
        }

        if (cmd === "list" || cmd === "ls") {
            printList(config, configPath);
            return;
        }

        if (cmd === "use") {
            const params = args.slice(1);
            if (params.length === 0) {
                const printUseWithLog = (
                    cfg: Config,
                    profileName: string,
                    requestedType: ProfileType | null
                ) => {
                    logProfileUse(
                        cfg,
                        configPath,
                        profileName,
                        requestedType,
                        process.env.CODE_ENV_TERMINAL_TAG || null,
                        process.cwd()
                    );
                    printUse(cfg, profileName, requestedType, true, configPath);
                };
                await runInteractiveUse(config, printUseWithLog);
                return;
            }
            const requestedType =
                params.length >= 2 ? normalizeType(params[0]) : null;
            const profileName = resolveProfileName(config, params);
            logProfileUse(
                config,
                configPath,
                profileName,
                requestedType,
                process.env.CODE_ENV_TERMINAL_TAG || null,
                process.cwd()
            );
            printUse(config, profileName, requestedType, true, configPath);
            return;
        }

        if (cmd === "show") {
            const profileName = resolveProfileName(config, args.slice(1));
            printShow(config, profileName);
            return;
        }

        if (cmd === "unset") {
            printUnset(config);
            return;
        }

        throw new Error(`Unknown command: ${cmd}`);
    } catch (err: unknown) {
        console.error(`codenv: ${getErrorMessage(err)}`);
        process.exit(1);
    }
}

main().catch((err: unknown) => {
    console.error(`codenv: ${getErrorMessage(err)}`);
    process.exit(1);
});

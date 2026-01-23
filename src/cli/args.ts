/**
 * CLI argument parsing
 */
import type {
    ParsedArgs,
    InitArgs,
    AddArgs,
    UsageResetArgs,
    ProfileType,
    StatuslineArgs,
} from "../types";
import { normalizeType } from "../profile/type";

export function parseArgs(argv: string[]): ParsedArgs {
    let configPath: string | null = null;
    const args: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            return { args: [], configPath: null, help: true };
        }
        if (arg === "-c" || arg === "--config") {
            configPath = argv[i + 1];
            i++;
            continue;
        }
        if (arg.startsWith("--config=")) {
            configPath = arg.slice("--config=".length);
            continue;
        }
        args.push(arg);
    }
    return { args, configPath, help: false };
}

export function parseInitArgs(args: string[]): InitArgs {
    const result: InitArgs = { apply: true, print: false, shell: null };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--apply") {
            result.apply = true;
            result.print = false;
            continue;
        }
        if (arg === "--print") {
            result.print = true;
            result.apply = false;
            continue;
        }
        if (arg === "--shell") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --shell.");
            result.shell = val;
            i++;
            continue;
        }
        if (arg.startsWith("--shell=")) {
            result.shell = arg.slice("--shell=".length);
            continue;
        }
        throw new Error(`Unknown init argument: ${arg}`);
    }
    return result;
}

export function parseAddArgs(args: string[]): AddArgs {
    const result: AddArgs = {
        profile: null,
        pairs: [],
        note: null,
        removeFiles: [],
        commands: [],
        unset: [],
        type: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!result.profile && !arg.startsWith("-")) {
            result.profile = arg;
            continue;
        }
        if (arg === "-n" || arg === "--note") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --note.");
            result.note = val;
            i++;
            continue;
        }
        if (arg.startsWith("--note=")) {
            result.note = arg.slice("--note=".length);
            continue;
        }
        if (arg === "-t" || arg === "--type") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --type.");
            result.type = val as ProfileType;
            i++;
            continue;
        }
        if (arg.startsWith("--type=")) {
            result.type = arg.slice("--type=".length) as ProfileType;
            continue;
        }
        if (arg === "-r" || arg === "--remove-file") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --remove-file.");
            result.removeFiles.push(val);
            i++;
            continue;
        }
        if (arg.startsWith("--remove-file=")) {
            result.removeFiles.push(arg.slice("--remove-file=".length));
            continue;
        }
        if (arg === "-x" || arg === "--command") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --command.");
            result.commands.push(val);
            i++;
            continue;
        }
        if (arg.startsWith("--command=")) {
            result.commands.push(arg.slice("--command=".length));
            continue;
        }
        if (arg === "-u" || arg === "--unset") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --unset.");
            result.unset.push(val);
            i++;
            continue;
        }
        if (arg.startsWith("--unset=")) {
            result.unset.push(arg.slice("--unset=".length));
            continue;
        }
        if (arg.includes("=")) {
            result.pairs.push(arg);
            continue;
        }
        throw new Error(`Unknown add argument: ${arg}`);
    }

    if (!result.profile) {
        throw new Error("Missing profile name.");
    }

    if (result.type) {
        const normalized = normalizeType(result.type);
        if (!normalized) {
            throw new Error(`Unknown type: ${result.type}`);
        }
        result.type = normalized;
    }

    return result;
}

export function parseUsageResetArgs(args: string[]): UsageResetArgs {
    const result: UsageResetArgs = { yes: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-y" || arg === "--yes") {
            result.yes = true;
            continue;
        }
        throw new Error(`Unknown usage-reset argument: ${arg}`);
    }
    return result;
}

function parseNumberFlag(value: string | null | undefined, flag: string): number {
    if (value === null || value === undefined || value === "") {
        throw new Error(`Missing value for ${flag}.`);
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid number for ${flag}: ${value}`);
    }
    return num;
}

export function parseStatuslineArgs(args: string[]): StatuslineArgs {
    const result: StatuslineArgs = {
        format: "text",
        cwd: null,
        type: null,
        profileKey: null,
        profileName: null,
        model: null,
        usageToday: null,
        usageTotal: null,
        usageInput: null,
        usageOutput: null,
        syncUsage: false,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--format") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --format.");
            const normalized = val.toLowerCase();
            if (normalized !== "text" && normalized !== "json") {
                throw new Error(`Unknown format: ${val}`);
            }
            result.format = normalized as "text" | "json";
            i++;
            continue;
        }
        if (arg.startsWith("--format=")) {
            const val = arg.slice("--format=".length);
            const normalized = val.toLowerCase();
            if (normalized !== "text" && normalized !== "json") {
                throw new Error(`Unknown format: ${val}`);
            }
            result.format = normalized as "text" | "json";
            continue;
        }
        if (arg === "--cwd") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --cwd.");
            result.cwd = val;
            i++;
            continue;
        }
        if (arg.startsWith("--cwd=")) {
            result.cwd = arg.slice("--cwd=".length);
            continue;
        }
        if (arg === "--type") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --type.");
            result.type = val;
            i++;
            continue;
        }
        if (arg.startsWith("--type=")) {
            result.type = arg.slice("--type=".length);
            continue;
        }
        if (arg === "--profile-key") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --profile-key.");
            result.profileKey = val;
            i++;
            continue;
        }
        if (arg.startsWith("--profile-key=")) {
            result.profileKey = arg.slice("--profile-key=".length);
            continue;
        }
        if (arg === "--profile-name") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --profile-name.");
            result.profileName = val;
            i++;
            continue;
        }
        if (arg.startsWith("--profile-name=")) {
            result.profileName = arg.slice("--profile-name=".length);
            continue;
        }
        if (arg === "--model") {
            const val = args[i + 1];
            if (!val) throw new Error("Missing value for --model.");
            result.model = val;
            i++;
            continue;
        }
        if (arg.startsWith("--model=")) {
            result.model = arg.slice("--model=".length);
            continue;
        }
        if (arg === "--usage-today") {
            result.usageToday = parseNumberFlag(args[i + 1], "--usage-today");
            i++;
            continue;
        }
        if (arg.startsWith("--usage-today=")) {
            result.usageToday = parseNumberFlag(
                arg.slice("--usage-today=".length),
                "--usage-today"
            );
            continue;
        }
        if (arg === "--usage-total") {
            result.usageTotal = parseNumberFlag(args[i + 1], "--usage-total");
            i++;
            continue;
        }
        if (arg.startsWith("--usage-total=")) {
            result.usageTotal = parseNumberFlag(
                arg.slice("--usage-total=".length),
                "--usage-total"
            );
            continue;
        }
        if (arg === "--usage-input") {
            result.usageInput = parseNumberFlag(args[i + 1], "--usage-input");
            i++;
            continue;
        }
        if (arg.startsWith("--usage-input=")) {
            result.usageInput = parseNumberFlag(
                arg.slice("--usage-input=".length),
                "--usage-input"
            );
            continue;
        }
        if (arg === "--usage-output") {
            result.usageOutput = parseNumberFlag(args[i + 1], "--usage-output");
            i++;
            continue;
        }
        if (arg.startsWith("--usage-output=")) {
            result.usageOutput = parseNumberFlag(
                arg.slice("--usage-output=".length),
                "--usage-output"
            );
            continue;
        }
        if (arg === "--sync-usage") {
            result.syncUsage = true;
            continue;
        }
        throw new Error(`Unknown statusline argument: ${arg}`);
    }

    return result;
}

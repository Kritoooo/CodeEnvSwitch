#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");
const DEFAULT_PROFILE_TYPES = ["codex", "claude"];
const DEFAULT_UNSET_KEYS = {
    codex: ["OPENAI_BASE_URL", "OPENAI_API_KEY"],
    claude: ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
};
function printHelp() {
    const msg = `codenv - switch Claude/Codex env vars\n\nUsage:\n  codenv list\n  codenv ls\n  codenv config\n  codenv auto\n  codenv use\n  codenv use <profile>\n  codenv use <type> <name>\n  codenv show <profile>\n  codenv show <type> <name>\n  codenv default <profile>\n  codenv default <type> <name>\n  codenv default --clear\n  codenv remove <profile> [<profile> ...]\n  codenv remove <type> <name> [<type> <name> ...]\n  codenv remove --all\n  codenv unset\n  codenv add <profile> KEY=VALUE [KEY=VALUE ...]\n  codenv add\n  codenv init\n\nOptions:\n  -c, --config <path>   Path to config JSON\n  -h, --help            Show help\n\nInit options:\n  --apply                 Append shell helper to your shell rc (default)\n  --print                 Print helper snippet to stdout\n  --shell <bash|zsh|fish> Explicitly set the target shell\n\nAdd options:\n  -t, --type <codex|claude>   Set profile type (alias: cc)\n  -n, --note <text>           Set profile note\n  -r, --remove-file <path>    Add a removeFiles entry (repeat)\n  -x, --command <cmd>         Add a commands entry (repeat)\n  -u, --unset <KEY>           Add a global unset key (repeat)\n\nExamples:\n  codenv init\n  codenv use codex primary\n  codenv list\n  codenv default codex primary\n  codenv remove codex primary\n  codenv remove codex primary claude default\n  codenv remove --all\n  CODE_ENV_CONFIG=~/.config/code-env/config.json codenv use claude default\n  codenv add --type codex primary OPENAI_BASE_URL=https://api.example.com/v1 OPENAI_API_KEY=YOUR_API_KEY\n  codenv add\n`;
    console.log(msg);
}
function parseArgs(argv) {
    let configPath = null;
    const args = [];
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
function normalizeType(value) {
    if (!value)
        return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw)
        return null;
    const compact = raw.replace(/[\s_-]+/g, "");
    if (compact === "codex")
        return "codex";
    if (compact === "claude" || compact === "claudecode" || compact === "cc") {
        return "claude";
    }
    return null;
}
function hasTypePrefix(name, type) {
    if (!name)
        return false;
    const lowered = String(name).toLowerCase();
    const prefixes = type === "claude" ? [type, "cc"] : [type];
    for (const prefix of prefixes) {
        for (const sep of ["-", "_", "."]) {
            if (lowered.startsWith(`${prefix}${sep}`))
                return true;
        }
    }
    return false;
}
function hasEnvKeyPrefix(profile, prefix) {
    if (!profile || !profile.env)
        return false;
    const normalized = prefix.toUpperCase();
    for (const key of Object.keys(profile.env)) {
        if (key.toUpperCase().startsWith(normalized))
            return true;
    }
    return false;
}
function inferProfileType(profileName, profile, requestedType) {
    if (requestedType)
        return requestedType;
    const fromProfile = profile ? normalizeType(profile.type) : null;
    if (fromProfile)
        return fromProfile;
    if (hasEnvKeyPrefix(profile, "OPENAI_"))
        return "codex";
    if (hasEnvKeyPrefix(profile, "ANTHROPIC_"))
        return "claude";
    if (hasTypePrefix(profileName, "codex"))
        return "codex";
    if (hasTypePrefix(profileName, "claude"))
        return "claude";
    return null;
}
function shouldRemoveCodexAuth(profileName, profile, requestedType) {
    if (requestedType === "codex")
        return true;
    if (!profile)
        return false;
    if (normalizeType(profile.type) === "codex")
        return true;
    if (hasEnvKeyPrefix(profile, "OPENAI_"))
        return true;
    return hasTypePrefix(profileName, "codex");
}
function stripTypePrefixFromName(name, type) {
    if (!name)
        return name;
    const normalizedType = normalizeType(type);
    if (!normalizedType)
        return name;
    const lowered = String(name).toLowerCase();
    const prefixes = normalizedType === "claude" ? [normalizedType, "cc"] : [normalizedType];
    for (const prefix of prefixes) {
        for (const sep of ["-", "_", "."]) {
            const candidate = `${prefix}${sep}`;
            if (lowered.startsWith(candidate)) {
                const stripped = String(name).slice(candidate.length);
                return stripped || name;
            }
        }
    }
    return name;
}
function getProfileDisplayName(profileKey, profile, requestedType) {
    if (profile.name)
        return String(profile.name);
    const rawType = profile.type ? String(profile.type) : "";
    if (rawType)
        return stripTypePrefixFromName(profileKey, rawType);
    if (requestedType)
        return stripTypePrefixFromName(profileKey, requestedType);
    return profileKey;
}
function findProfileKeysByName(config, name, type) {
    const profiles = config && config.profiles ? config.profiles : {};
    const matches = [];
    for (const [key, profile] of Object.entries(profiles)) {
        const safeProfile = profile || {};
        if (type && !profileMatchesType(safeProfile, type))
            continue;
        const displayName = getProfileDisplayName(key, safeProfile, type || null);
        if (displayName === name)
            matches.push(key);
    }
    return matches;
}
function generateProfileKey(config) {
    const profiles = config && config.profiles ? config.profiles : {};
    for (let i = 0; i < 10; i++) {
        const key = `p_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        if (!profiles[key])
            return key;
    }
    let idx = 0;
    while (true) {
        const key = `p_${Date.now().toString(36)}_${idx}`;
        if (!profiles[key])
            return key;
        idx++;
    }
}
function normalizeShell(value) {
    if (!value)
        return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw)
        return null;
    if (raw === "bash")
        return "bash";
    if (raw === "zsh")
        return "zsh";
    if (raw === "fish")
        return "fish";
    return null;
}
function detectShell(explicitShell) {
    if (explicitShell)
        return normalizeShell(explicitShell);
    const envShell = process.env.SHELL ? path.basename(process.env.SHELL) : "";
    return normalizeShell(envShell);
}
function getShellRcPath(shellName) {
    if (shellName === "bash")
        return path.join(os.homedir(), ".bashrc");
    if (shellName === "zsh")
        return path.join(os.homedir(), ".zshrc");
    if (shellName === "fish") {
        return path.join(os.homedir(), ".config", "fish", "config.fish");
    }
    return null;
}
function getShellSnippet(shellName) {
    if (shellName === "fish") {
        return [
            "function codenv",
            "  if test (count $argv) -ge 1",
            "    switch $argv[1]",
            "      case use unset auto",
            "        command codenv $argv | source",
            "      case '*'",
            "        command codenv $argv",
            "    end",
            "  else",
            "    command codenv",
            "  end",
            "end",
            "codenv auto",
        ].join("\n");
    }
    return [
        "codenv() {",
        "  if [ \"$1\" = \"use\" ] || [ \"$1\" = \"unset\" ] || [ \"$1\" = \"auto\" ]; then",
        "    source <(command codenv \"$@\")",
        "  else",
        "    command codenv \"$@\"",
        "  fi",
        "}",
        "codenv auto",
    ].join("\n");
}
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function upsertShellSnippet(rcPath, snippet) {
    const markerStart = "# >>> codenv >>>";
    const markerEnd = "# <<< codenv <<<";
    const block = `${markerStart}\n${snippet}\n${markerEnd}`;
    const existing = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf8") : "";
    let updated = "";
    if (existing.includes(markerStart) && existing.includes(markerEnd)) {
        const re = new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`);
        updated = existing.replace(re, block);
    }
    else if (existing.trim().length === 0) {
        updated = `${block}\n`;
    }
    else {
        const sep = existing.endsWith("\n") ? "\n" : "\n\n";
        updated = `${existing}${sep}${block}\n`;
    }
    const dir = path.dirname(rcPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(rcPath, updated, "utf8");
}
function parseInitArgs(args) {
    const result = { apply: true, print: false, shell: null };
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
            if (!val)
                throw new Error("Missing value for --shell.");
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
function profileMatchesType(profile, type) {
    if (!profile)
        return false;
    if (!profile.type)
        return true;
    const t = normalizeType(profile.type);
    if (!t)
        return false;
    return t === type;
}
function getTypeDefaultUnsetKeys(type) {
    return DEFAULT_UNSET_KEYS[type] || [];
}
function getFilteredUnsetKeys(config, activeType) {
    const keys = Array.isArray(config.unset) ? config.unset : [];
    if (!activeType)
        return [...keys];
    const otherDefaults = new Set(DEFAULT_PROFILE_TYPES.filter((type) => type !== activeType).flatMap((type) => DEFAULT_UNSET_KEYS[type]));
    return keys.filter((key) => !otherDefaults.has(key));
}
function resolvePath(p) {
    if (!p)
        return null;
    if (p.startsWith("~")) {
        return path.join(os.homedir(), p.slice(1));
    }
    if (path.isAbsolute(p))
        return p;
    return path.resolve(process.cwd(), p);
}
function getDefaultConfigPath() {
    return path.join(os.homedir(), ".config", "code-env", "config.json");
}
function findConfigPath(explicitPath) {
    if (explicitPath) {
        const resolved = resolvePath(explicitPath);
        if (fs.existsSync(resolved))
            return resolved;
        return resolved; // let readConfig raise a helpful error
    }
    if (process.env.CODE_ENV_CONFIG) {
        const fromEnv = resolvePath(process.env.CODE_ENV_CONFIG);
        if (fs.existsSync(fromEnv))
            return fromEnv;
        return fromEnv;
    }
    return getDefaultConfigPath();
}
function findConfigPathForWrite(explicitPath) {
    if (explicitPath)
        return resolvePath(explicitPath);
    if (process.env.CODE_ENV_CONFIG)
        return resolvePath(process.env.CODE_ENV_CONFIG);
    return getDefaultConfigPath();
}
function readConfig(configPath) {
    if (!configPath) {
        throw new Error("No config file found. Use --config or set CODE_ENV_CONFIG.");
    }
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const raw = fs.readFileSync(configPath, "utf8");
    try {
        return JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`Invalid JSON in config: ${configPath}`);
    }
}
function readConfigIfExists(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return { unset: [], profiles: {} };
    }
    return readConfig(configPath);
}
function writeConfig(configPath, config) {
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
function shellEscape(value) {
    const str = String(value);
    return `'${str.replace(/'/g, `'\\''`)}'`;
}
function expandEnv(input) {
    if (!input)
        return input;
    let out = String(input);
    if (out.startsWith("~")) {
        out = path.join(os.homedir(), out.slice(1));
    }
    out = out.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || "");
    out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => process.env[key] || "");
    return out;
}
function parseAddArgs(args) {
    const result = {
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
            if (!val)
                throw new Error("Missing value for --note.");
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
            if (!val)
                throw new Error("Missing value for --type.");
            result.type = val;
            i++;
            continue;
        }
        if (arg.startsWith("--type=")) {
            result.type = arg.slice("--type=".length);
            continue;
        }
        if (arg === "-r" || arg === "--remove-file") {
            const val = args[i + 1];
            if (!val)
                throw new Error("Missing value for --remove-file.");
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
            if (!val)
                throw new Error("Missing value for --command.");
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
            if (!val)
                throw new Error("Missing value for --unset.");
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
function createReadline() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}
function ask(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
    });
}
async function askRequired(rl, question) {
    while (true) {
        const answer = String(await ask(rl, question)).trim();
        if (answer)
            return answer;
    }
}
async function askConfirm(rl, question) {
    const answer = String(await ask(rl, question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
}
async function askType(rl) {
    while (true) {
        const answer = String(await ask(rl, "Select type (1=codex, 2=claude): "))
            .trim()
            .toLowerCase();
        if (answer === "1")
            return "codex";
        if (answer === "2")
            return "claude";
        const normalized = answer.replace(/[\s-]+/g, "");
        if (normalized === "codex")
            return "codex";
        if (normalized === "claude" ||
            normalized === "claudecode" ||
            normalized === "cc")
            return "claude";
    }
}
async function askProfileName(rl, config, defaultName, type) {
    while (true) {
        const answer = String(await ask(rl, `Profile name (default: ${defaultName}): `)).trim();
        const baseName = answer || defaultName;
        if (!baseName)
            continue;
        const matches = findProfileKeysByName(config, baseName, type);
        if (matches.length === 0) {
            return { name: baseName, key: null };
        }
        if (matches.length === 1) {
            const overwrite = String(await ask(rl, `Profile "${baseName}" exists. Overwrite? (y/N): `))
                .trim()
                .toLowerCase();
            if (overwrite === "y" || overwrite === "yes") {
                return { name: baseName, key: matches[0] };
            }
            continue;
        }
        console.log(`Multiple profiles named "${baseName}" for type "${type}". ` +
            `Use a unique name or update by key in config.`);
    }
}
async function runInteractiveAdd(configPath) {
    const config = readConfigIfExists(configPath);
    const rl = createReadline();
    try {
        const type = await askType(rl);
        const defaultName = "default";
        const profileInfo = await askProfileName(rl, config, defaultName, type);
        const profileKey = profileInfo.key || generateProfileKey(config);
        const baseUrl = await askRequired(rl, "Base URL (required): ");
        const apiKey = await askRequired(rl, "API key (required): ");
        if (!config.profiles || typeof config.profiles !== "object") {
            config.profiles = {};
        }
        if (!config.profiles[profileKey]) {
            config.profiles[profileKey] = {};
        }
        const profile = config.profiles[profileKey];
        profile.name = profileInfo.name;
        profile.type = type;
        if (!profile.env || typeof profile.env !== "object") {
            profile.env = {};
        }
        if (type === "codex") {
            profile.env.OPENAI_BASE_URL = baseUrl;
            profile.env.OPENAI_API_KEY = apiKey;
        }
        else {
            profile.env.ANTHROPIC_BASE_URL = baseUrl;
            profile.env.ANTHROPIC_API_KEY = apiKey;
            console.log("Note: ANTHROPIC_AUTH_TOKEN will be set to the same value when applying.");
        }
        writeConfig(configPath, config);
        console.log(`Updated config: ${configPath}`);
    }
    finally {
        rl.close();
    }
}
function addConfig(config, addArgs) {
    if (!config.profiles || typeof config.profiles !== "object") {
        config.profiles = {};
    }
    let targetKey = null;
    let matchedByName = false;
    if (Object.prototype.hasOwnProperty.call(config.profiles, addArgs.profile)) {
        targetKey = addArgs.profile;
    }
    else {
        const matches = findProfileKeysByName(config, addArgs.profile, addArgs.type);
        if (matches.length === 1) {
            targetKey = matches[0];
            matchedByName = true;
        }
        else if (matches.length > 1) {
            const hint = addArgs.type
                ? `Use profile key: ${matches.join(", ")}`
                : `Use: codenv add --type <type> ${addArgs.profile} ... (or profile key: ${matches.join(", ")})`;
            throw new Error(`Multiple profiles named "${addArgs.profile}". ${hint}`);
        }
    }
    if (!targetKey) {
        targetKey = generateProfileKey(config);
        matchedByName = true;
    }
    if (!config.profiles[targetKey]) {
        config.profiles[targetKey] = {};
    }
    const profile = config.profiles[targetKey];
    if (!profile.env || typeof profile.env !== "object") {
        profile.env = {};
    }
    if (matchedByName) {
        profile.name = addArgs.profile;
    }
    if (addArgs.type) {
        profile.type = addArgs.type;
    }
    for (const pair of addArgs.pairs) {
        const idx = pair.indexOf("=");
        if (idx <= 0)
            throw new Error(`Invalid KEY=VALUE: ${pair}`);
        const key = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        profile.env[key] = value;
    }
    if (addArgs.note !== null && addArgs.note !== undefined) {
        profile.note = addArgs.note;
    }
    if (addArgs.removeFiles.length > 0) {
        if (!Array.isArray(profile.removeFiles))
            profile.removeFiles = [];
        for (const p of addArgs.removeFiles) {
            if (!profile.removeFiles.includes(p))
                profile.removeFiles.push(p);
        }
    }
    if (addArgs.commands.length > 0) {
        if (!Array.isArray(profile.commands))
            profile.commands = [];
        for (const cmd of addArgs.commands) {
            if (!profile.commands.includes(cmd))
                profile.commands.push(cmd);
        }
    }
    if (addArgs.unset.length > 0) {
        if (!Array.isArray(config.unset))
            config.unset = [];
        for (const key of addArgs.unset) {
            if (!config.unset.includes(key))
                config.unset.push(key);
        }
    }
    return config;
}
function buildListRows(config) {
    const profiles = config && config.profiles ? config.profiles : {};
    const entries = Object.entries(profiles);
    if (entries.length === 0)
        return [];
    const defaults = getResolvedDefaultProfileKeys(config);
    const rows = entries.map(([key, profile]) => {
        const safeProfile = profile || {};
        const rawType = safeProfile.type ? String(safeProfile.type) : "";
        const normalizedType = normalizeType(rawType);
        const type = normalizedType || rawType || "-";
        const displayName = getProfileDisplayName(key, safeProfile);
        const note = safeProfile.note ? String(safeProfile.note) : "";
        const defaultTypes = DEFAULT_PROFILE_TYPES.filter((profileType) => defaults[profileType] === key);
        const defaultLabel = defaultTypes.length > 0 ? "default" : "";
        const noteParts = [];
        if (defaultLabel)
            noteParts.push(defaultLabel);
        if (note)
            noteParts.push(note);
        const noteText = noteParts.join(" | ");
        const active = envMatchesProfile(safeProfile);
        return { key, name: displayName, type, note: noteText, active };
    });
    rows.sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0)
            return nameCmp;
        const typeCmp = a.type.localeCompare(b.type);
        if (typeCmp !== 0)
            return typeCmp;
        return a.key.localeCompare(b.key);
    });
    return rows;
}
function printList(config) {
    const rows = buildListRows(config);
    if (rows.length === 0) {
        console.log("(no profiles found)");
        return;
    }
    const headerName = "PROFILE";
    const headerType = "TYPE";
    const headerNote = "NOTE";
    const nameWidth = Math.max(headerName.length, ...rows.map((row) => row.name.length));
    const typeWidth = Math.max(headerType.length, ...rows.map((row) => row.type.length));
    const noteWidth = Math.max(headerNote.length, ...rows.map((row) => row.note.length));
    const formatRow = (name, type, note) => `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${note.padEnd(noteWidth)}`;
    console.log(formatRow(headerName, headerType, headerNote));
    console.log(formatRow("-".repeat(nameWidth), "-".repeat(typeWidth), "-".repeat(noteWidth)));
    for (const row of rows) {
        const line = formatRow(row.name, row.type, row.note);
        if (row.active) {
            console.log(`\x1b[32m${line}\x1b[0m`);
        }
        else {
            console.log(line);
        }
    }
}
async function runInteractiveUse(config) {
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        throw new Error("Interactive selection requires a TTY. Provide a profile name.");
    }
    const rows = buildListRows(config);
    if (rows.length === 0) {
        throw new Error("No profiles found.");
    }
    const nameTypeCounts = new Map();
    for (const row of rows) {
        const key = `${row.name}||${row.type}`;
        nameTypeCounts.set(key, (nameTypeCounts.get(key) || 0) + 1);
    }
    const displayRows = rows.map((row) => {
        const key = `${row.name}||${row.type}`;
        const displayName = (nameTypeCounts.get(key) || 0) > 1 ? `${row.name} [${row.key}]` : row.name;
        const noteText = row.note;
        const profile = config.profiles && config.profiles[row.key];
        const inferredType = inferProfileType(row.key, profile, null);
        const resolvedType = inferredType || normalizeType(row.type) || null;
        return { ...row, displayName, noteText, resolvedType };
    });
    const headerName = "PROFILE";
    const headerType = "TYPE";
    const headerNote = "NOTE";
    const nameWidth = Math.max(headerName.length, ...displayRows.map((row) => row.displayName.length));
    const typeWidth = Math.max(headerType.length, ...displayRows.map((row) => row.type.length));
    const noteWidth = Math.max(headerNote.length, ...displayRows.map((row) => row.noteText.length));
    const formatRow = (name, type, note) => `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${note.padEnd(noteWidth)}`;
    const activeKeys = new Set();
    const keyToType = new Map();
    for (const row of displayRows) {
        keyToType.set(row.key, row.resolvedType || null);
        if (row.active)
            activeKeys.add(row.key);
    }
    let index = displayRows.findIndex((row) => row.active);
    if (index < 0)
        index = 0;
    const ANSI_CLEAR = "\x1b[2J\x1b[H";
    const ANSI_HIDE_CURSOR = "\x1b[?25l";
    const ANSI_SHOW_CURSOR = "\x1b[?25h";
    const ANSI_INVERT = "\x1b[7m";
    const ANSI_GREEN = "\x1b[32m";
    const ANSI_RESET = "\x1b[0m";
    const render = () => {
        const lines = [];
        lines.push("Select profile (up/down, Enter to apply, q to exit)");
        lines.push(formatRow(headerName, headerType, headerNote));
        lines.push(formatRow("-".repeat(nameWidth), "-".repeat(typeWidth), "-".repeat(noteWidth)));
        for (let i = 0; i < displayRows.length; i++) {
            const row = displayRows[i];
            const isActive = activeKeys.has(row.key);
            const line = ` ${formatRow(row.displayName, row.type, row.noteText)}`;
            if (i === index) {
                const prefix = isActive ? `${ANSI_INVERT}${ANSI_GREEN}` : ANSI_INVERT;
                lines.push(`${prefix}${line}${ANSI_RESET}`);
            }
            else {
                if (isActive) {
                    lines.push(`${ANSI_GREEN}${line}${ANSI_RESET}`);
                }
                else {
                    lines.push(line);
                }
            }
        }
        process.stderr.write(`${ANSI_CLEAR}${ANSI_HIDE_CURSOR}${lines.join("\n")}\n`);
    };
    return await new Promise((resolve) => {
        readline.emitKeypressEvents(process.stdin);
        const stdin = process.stdin;
        const wasRaw = !!stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        const cleanup = () => {
            stdin.removeListener("keypress", onKeypress);
            if (!wasRaw)
                stdin.setRawMode(false);
            stdin.pause();
            process.stderr.write(`${ANSI_RESET}${ANSI_SHOW_CURSOR}`);
        };
        const finish = () => {
            cleanup();
            resolve();
        };
        const onKeypress = (str, key) => {
            if (key && key.ctrl && key.name === "c") {
                finish();
                return;
            }
            if (key && key.name === "up") {
                index = (index - 1 + displayRows.length) % displayRows.length;
                render();
                return;
            }
            if (key && key.name === "down") {
                index = (index + 1) % displayRows.length;
                render();
                return;
            }
            if (key && key.name === "home") {
                index = 0;
                render();
                return;
            }
            if (key && key.name === "end") {
                index = displayRows.length - 1;
                render();
                return;
            }
            if (key && (key.name === "return" || key.name === "enter")) {
                const selectedKey = displayRows[index].key;
                const selectedType = keyToType.get(selectedKey) || null;
                if (selectedType) {
                    for (const activeKey of Array.from(activeKeys)) {
                        if (keyToType.get(activeKey) === selectedType) {
                            activeKeys.delete(activeKey);
                        }
                    }
                }
                activeKeys.add(selectedKey);
                printUse(config, selectedKey, null);
                render();
                return;
            }
            if (key && key.name === "escape") {
                finish();
                return;
            }
            if (str === "q" || str === "Q") {
                finish();
            }
        };
        stdin.on("keypress", onKeypress);
        render();
    });
}
function printShow(config, profileName) {
    const profile = config.profiles && config.profiles[profileName];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileName}`);
    }
    console.log(JSON.stringify(profile, null, 2));
}
function printUnset(config) {
    const keySet = new Set();
    if (Array.isArray(config.unset)) {
        for (const key of config.unset)
            keySet.add(key);
    }
    for (const type of DEFAULT_PROFILE_TYPES) {
        for (const key of getTypeDefaultUnsetKeys(type))
            keySet.add(key);
    }
    if (keySet.size === 0)
        return;
    const lines = Array.from(keySet, (key) => `unset ${key}`);
    console.log(lines.join("\n"));
}
function resolveProfileName(config, params) {
    if (!params || params.length === 0) {
        throw new Error("Missing profile name.");
    }
    if (params.length >= 2) {
        const maybeType = normalizeType(params[0]);
        if (maybeType) {
            const name = params[1];
            return resolveProfileByType(config, maybeType, name, params[0]);
        }
    }
    const name = params[0];
    const profiles = config && config.profiles ? config.profiles : {};
    if (profiles[name])
        return name;
    const matches = findProfileKeysByName(config, name, null);
    if (matches.length === 1)
        return matches[0];
    if (matches.length > 1) {
        throw new Error(`Multiple profiles named "${name}". ` +
            `Use: codenv <type> ${name} (or profile key: ${matches.join(", ")})`);
    }
    return name;
}
function resolveProfileByType(config, type, name, rawType) {
    if (!name)
        throw new Error("Missing profile name.");
    const profiles = config && config.profiles ? config.profiles : {};
    if (profiles[name] && profileMatchesType(profiles[name], type)) {
        return name;
    }
    const matches = findProfileKeysByName(config, name, type);
    if (matches.length === 1)
        return matches[0];
    if (matches.length > 1) {
        throw new Error(`Multiple profiles named "${name}" for type "${type}". ` +
            `Use profile key: ${matches.join(", ")}`);
    }
    if (rawType) {
        const prefixes = [];
        const raw = String(rawType).trim();
        if (raw && raw.toLowerCase() !== type)
            prefixes.push(raw);
        prefixes.push(type);
        for (const prefix of prefixes) {
            for (const sep of ["-", "_", "."]) {
                const candidate = `${prefix}${sep}${name}`;
                if (profiles[candidate] && profileMatchesType(profiles[candidate], type)) {
                    return candidate;
                }
            }
        }
    }
    throw new Error(`Unknown profile for type "${type}": ${name}`);
}
function getDefaultProfiles(config) {
    const defaults = {};
    if (!config || typeof config !== "object")
        return defaults;
    if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
        return defaults;
    }
    for (const [rawType, rawValue] of Object.entries(config.defaultProfiles)) {
        const type = normalizeType(rawType);
        if (!type)
            continue;
        const trimmed = String(rawValue !== null && rawValue !== void 0 ? rawValue : "").trim();
        if (trimmed)
            defaults[type] = trimmed;
    }
    return defaults;
}
function deleteDefaultProfileEntry(config, type) {
    if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
        return false;
    }
    let changed = false;
    for (const key of Object.keys(config.defaultProfiles)) {
        if (normalizeType(key) === type) {
            delete config.defaultProfiles[key];
            changed = true;
        }
    }
    return changed;
}
function resolveDefaultProfileForType(config, type, value) {
    const trimmed = String(value !== null && value !== void 0 ? value : "").trim();
    if (!trimmed)
        return null;
    const params = trimmed.split(/\s+/).filter(Boolean);
    if (params.length === 0)
        return null;
    const explicitType = normalizeType(params[0]);
    if (explicitType) {
        if (explicitType !== type) {
            throw new Error(`Default profile for "${type}" must match type "${type}".`);
        }
        return resolveProfileName(config, params);
    }
    return resolveProfileName(config, [type, ...params]);
}
function getResolvedDefaultProfileKeys(config) {
    const defaults = getDefaultProfiles(config);
    const resolved = {};
    for (const type of DEFAULT_PROFILE_TYPES) {
        const value = defaults[type];
        if (!value)
            continue;
        try {
            const profileName = resolveDefaultProfileForType(config, type, value);
            if (profileName)
                resolved[type] = profileName;
        }
        catch (err) {
            // ignore invalid defaults for list output
        }
    }
    return resolved;
}
function isEnvValueUnset(value) {
    return value === null || value === undefined || value === "";
}
function buildEffectiveEnv(profile, activeType) {
    const env = profile && profile.env ? profile.env : {};
    if (!activeType)
        return env;
    if (activeType !== "claude")
        return env;
    const apiKey = env.ANTHROPIC_API_KEY;
    const authToken = env.ANTHROPIC_AUTH_TOKEN;
    if (isEnvValueUnset(apiKey) || !isEnvValueUnset(authToken))
        return env;
    return { ...env, ANTHROPIC_AUTH_TOKEN: apiKey };
}
function envMatchesProfile(profile) {
    if (!profile || !profile.env)
        return false;
    for (const key of Object.keys(profile.env)) {
        const expected = profile.env[key];
        const actual = process.env[key];
        if (isEnvValueUnset(expected)) {
            if (actual !== undefined && actual !== "")
                return false;
            continue;
        }
        if (actual !== String(expected))
            return false;
    }
    return Object.keys(profile.env).length > 0;
}
function buildUseLines(config, profileName, requestedType, includeGlobalUnset) {
    const profile = config.profiles && config.profiles[profileName];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileName}`);
    }
    const env = profile.env || {};
    const unsetLines = [];
    const exportLines = [];
    const postLines = [];
    const unsetKeys = new Set();
    const activeType = inferProfileType(profileName, profile, requestedType);
    const effectiveEnv = buildEffectiveEnv(profile, activeType);
    const addUnset = (key) => {
        if (unsetKeys.has(key))
            return;
        if (Object.prototype.hasOwnProperty.call(effectiveEnv, key))
            return;
        unsetKeys.add(key);
        unsetLines.push(`unset ${key}`);
    };
    if (includeGlobalUnset) {
        for (const key of getFilteredUnsetKeys(config, activeType)) {
            addUnset(key);
        }
    }
    if (activeType) {
        for (const key of getTypeDefaultUnsetKeys(activeType)) {
            addUnset(key);
        }
    }
    for (const key of Object.keys(effectiveEnv)) {
        const value = effectiveEnv[key];
        if (value === null || value === undefined || value === "") {
            if (!unsetKeys.has(key)) {
                unsetKeys.add(key);
                unsetLines.push(`unset ${key}`);
            }
        }
        else {
            exportLines.push(`export ${key}=${shellEscape(value)}`);
        }
    }
    if (shouldRemoveCodexAuth(profileName, profile, requestedType)) {
        postLines.push(`rm -f ${shellEscape(CODEX_AUTH_PATH)}`);
    }
    if (Array.isArray(profile.removeFiles)) {
        for (const p of profile.removeFiles) {
            const expanded = expandEnv(p);
            if (expanded)
                postLines.push(`rm -f ${shellEscape(expanded)}`);
        }
    }
    if (Array.isArray(profile.commands)) {
        for (const cmd of profile.commands) {
            if (cmd && String(cmd).trim())
                postLines.push(String(cmd));
        }
    }
    return [...unsetLines, ...exportLines, ...postLines];
}
function printUse(config, profileName, requestedType = null, includeGlobalUnset = true) {
    const lines = buildUseLines(config, profileName, requestedType, includeGlobalUnset);
    console.log(lines.join("\n"));
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
                throw new Error("Unknown shell. Use --shell <bash|zsh|fish> to specify.");
            }
            const snippet = getShellSnippet(shellName);
            if (initArgs.apply) {
                const rcPath = getShellRcPath(shellName);
                upsertShellSnippet(rcPath, snippet);
                console.log(`Updated shell config: ${rcPath}`);
            }
            else {
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
            const addArgs = parseAddArgs(addArgsRaw);
            const config = readConfigIfExists(writePath);
            const updated = addConfig(config, addArgs);
            writeConfig(writePath, updated);
            console.log(`Updated config: ${writePath}`);
            return;
        }
        if (cmd === "auto") {
            const configPath = findConfigPath(parsed.configPath);
            if (!configPath || !fs.existsSync(configPath))
                return;
            const config = readConfig(configPath);
            const defaults = getDefaultProfiles(config);
            const hasDefaults = DEFAULT_PROFILE_TYPES.some((type) => defaults[type]);
            if (!hasDefaults)
                return;
            let includeGlobalUnset = true;
            for (const type of DEFAULT_PROFILE_TYPES) {
                const value = defaults[type];
                if (!value)
                    continue;
                try {
                    const profileName = resolveDefaultProfileForType(config, type, value);
                    if (!profileName)
                        continue;
                    printUse(config, profileName, type, includeGlobalUnset);
                    includeGlobalUnset = false;
                }
                catch (err) {
                    console.error(`codenv: ${err.message}`);
                }
            }
            return;
        }
        const configPath = findConfigPath(parsed.configPath);
        const config = readConfig(configPath);
        if (cmd === "default") {
            const params = args.slice(1);
            if (params.length === 0) {
                throw new Error("Missing profile name.");
            }
            const clear = params.length === 1 &&
                (params[0] === "--clear" || params[0] === "--unset");
            if (clear) {
                const rl = createReadline();
                try {
                    const confirmed = await askConfirm(rl, "Clear all default profiles? (y/N): ");
                    if (!confirmed)
                        return;
                }
                finally {
                    rl.close();
                }
                let changed = false;
                if (Object.prototype.hasOwnProperty.call(config, "defaultProfiles")) {
                    delete config.defaultProfiles;
                    changed = true;
                }
                if (changed) {
                    writeConfig(configPath, config);
                    console.log(`Updated config: ${configPath}`);
                }
                return;
            }
            const requestedType = params.length >= 2 ? normalizeType(params[0]) : null;
            const profileName = resolveProfileName(config, params);
            let targetType = requestedType;
            if (!targetType) {
                const profile = config.profiles && config.profiles[profileName];
                targetType = inferProfileType(profileName, profile, null);
            }
            if (!targetType) {
                throw new Error("Unable to infer profile type. Use: codenv default <type> <name>.");
            }
            if (!config.defaultProfiles || typeof config.defaultProfiles !== "object") {
                config.defaultProfiles = {};
            }
            config.defaultProfiles[targetType] = profileName;
            writeConfig(configPath, config);
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
                }
                else {
                    config.profiles = {};
                }
                if (Object.prototype.hasOwnProperty.call(config, "defaultProfiles")) {
                    delete config.defaultProfiles;
                }
                writeConfig(configPath, config);
                console.log(`Updated config: ${configPath}`);
                return;
            }
            const targets = [];
            const allPairs = params.length >= 2 &&
                params.length % 2 === 0 &&
                params.every((value, idx) => idx % 2 === 0 ? normalizeType(value) : true);
            if (allPairs) {
                for (let i = 0; i < params.length; i += 2) {
                    targets.push(resolveProfileName(config, params.slice(i, i + 2)));
                }
            }
            else {
                for (const param of params) {
                    targets.push(resolveProfileName(config, [param]));
                }
            }
            const uniqueTargets = Array.from(new Set(targets));
            const missing = uniqueTargets.filter((name) => !config.profiles || !config.profiles[name]);
            if (missing.length > 0) {
                throw new Error(`Unknown profile(s): ${missing.join(", ")}`);
            }
            for (const name of uniqueTargets) {
                delete config.profiles[name];
            }
            const defaults = getDefaultProfiles(config);
            let changedDefaults = false;
            for (const type of DEFAULT_PROFILE_TYPES) {
                const value = defaults[type];
                if (!value)
                    continue;
                try {
                    const resolved = resolveDefaultProfileForType(config, type, value);
                    if (resolved && uniqueTargets.includes(resolved)) {
                        if (deleteDefaultProfileEntry(config, type)) {
                            changedDefaults = true;
                        }
                    }
                }
                catch (err) {
                    // keep defaults that cannot be resolved
                }
            }
            if (changedDefaults &&
                config.defaultProfiles &&
                Object.keys(config.defaultProfiles).length === 0) {
                delete config.defaultProfiles;
            }
            writeConfig(configPath, config);
            console.log(`Updated config: ${configPath}`);
            return;
        }
        if (cmd === "config") {
            const configPath = findConfigPath(parsed.configPath);
            if (!configPath) {
                console.log("(no config found)");
                return;
            }
            console.log(configPath);
            return;
        }
        if (cmd === "list" || cmd === "ls") {
            printList(config);
            return;
        }
        if (cmd === "use") {
            const params = args.slice(1);
            if (params.length === 0) {
                await runInteractiveUse(config);
                return;
            }
            const requestedType = params.length >= 2 ? normalizeType(params[0]) : null;
            const profileName = resolveProfileName(config, params);
            printUse(config, profileName, requestedType);
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
    }
    catch (err) {
        console.error(`codenv: ${err.message}`);
        process.exit(1);
    }
}
main().catch((err) => {
    console.error(`codenv: ${err.message}`);
    process.exit(1);
});

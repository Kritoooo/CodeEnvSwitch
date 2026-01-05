#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

function printHelp() {
  const msg = `codenv - switch Claude/Codex env vars\n\nUsage:\n  codenv list\n  codenv use <profile>\n  codenv use <type> <name>\n  codenv show <profile>\n  codenv show <type> <name>\n  codenv unset\n  codenv add <profile> KEY=VALUE [KEY=VALUE ...]\n  codenv add --interactive\n\nOptions:\n  -c, --config <path>   Path to config JSON\n  -h, --help            Show help\n\nAdd options:\n  -i, --interactive           Add profile via prompts\n  -t, --type <codex|claude>   Set profile type (alias: cc)\n  -n, --note <text>           Set profile note\n  -r, --remove-file <path>    Add a removeFiles entry (repeat)\n  -x, --command <cmd>         Add a commands entry (repeat)\n  -u, --unset <KEY>           Add a global unset key (repeat)\n\nExamples:\n  eval "$(codenv use codex-88)"\n  eval "$(codenv use codex 88)"\n  codenv list\n  CODE_ENV_CONFIG=./code-env.json codenv use claude 88\n  codenv add --type codex 88 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=YOUR_API_KEY\n  codenv add --interactive\n`;
  console.log(msg);
}

function parseArgs(argv) {
  let configPath = null;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
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
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s_-]+/g, "");
  if (compact === "codex") return "codex";
  if (compact === "claude" || compact === "claudecode" || compact === "cc") {
    return "claude";
  }
  return null;
}

function profileMatchesType(profile, type) {
  if (!profile) return false;
  if (!profile.type) return true;
  const t = normalizeType(profile.type);
  if (!t) return false;
  return t === type;
}

function applyTypeDefaults(config, type) {
  const t = normalizeType(type);
  if (!t) return;
  if (!Array.isArray(config.unset)) config.unset = [];
  const keys =
    t === "codex"
      ? ["OPENAI_BASE_URL", "OPENAI_API_KEY", "CODEX_PROVIDER"]
      : ["CLAUDE_CODE_BASE_URL", "ANTHROPIC_API_KEY"];
  for (const key of keys) {
    if (!config.unset.includes(key)) config.unset.push(key);
  }
}

function resolvePath(p) {
  if (!p) return null;
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

function findConfigPath(explicitPath) {
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

  const candidates = [
    path.resolve(process.cwd(), "code-env.json"),
    path.resolve(process.cwd(), "profiles.json"),
    path.resolve(process.cwd(), "code-env.config.json"),
    path.join(os.homedir(), ".config", "code-env", "config.json"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function findConfigPathForWrite(explicitPath) {
  if (explicitPath) return resolvePath(explicitPath);
  if (process.env.CODE_ENV_CONFIG) return resolvePath(process.env.CODE_ENV_CONFIG);
  const existing = findConfigPath(null);
  if (existing) return existing;
  return path.resolve(process.cwd(), "code-env.json");
}

function readConfig(configPath) {
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
  if (!input) return input;
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
    if (answer) return answer;
  }
}

async function askType(rl) {
  while (true) {
    const answer = String(
      await ask(rl, "Select type (codex/claude/cc): ")
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

async function askProfileName(rl, config, defaultName) {
  while (true) {
    const answer = String(
      await ask(rl, `Profile name (default: ${defaultName}): `)
    ).trim();
    const name = answer || defaultName;
    if (!name) continue;
    if (!config.profiles || !config.profiles[name]) return name;
    const overwrite = String(
      await ask(rl, `Profile "${name}" exists. Overwrite? (y/N): `)
    )
      .trim()
      .toLowerCase();
    if (overwrite === "y" || overwrite === "yes") return name;
  }
}

async function runInteractiveAdd(configPath) {
  const config = readConfigIfExists(configPath);
  const rl = createReadline();
  try {
    const type = await askType(rl);
    const profileName = await askProfileName(rl, config, type);
    const baseUrl = await askRequired(rl, "Base URL (required): ");
    const apiKey = await askRequired(rl, "API key (required): ");

    if (!config.profiles || typeof config.profiles !== "object") {
      config.profiles = {};
    }
    if (!config.profiles[profileName]) {
      config.profiles[profileName] = {};
    }
    const profile = config.profiles[profileName];
    profile.type = type;
    if (!profile.env || typeof profile.env !== "object") {
      profile.env = {};
    }

    if (type === "codex") {
      profile.env.OPENAI_BASE_URL = baseUrl;
      profile.env.OPENAI_API_KEY = apiKey;
    } else {
      profile.env.CLAUDE_CODE_BASE_URL = baseUrl;
      profile.env.ANTHROPIC_API_KEY = apiKey;
    }
    applyTypeDefaults(config, type);

    writeConfig(configPath, config);
    console.log(`Updated config: ${configPath}`);
  } finally {
    rl.close();
  }
}

function addConfig(config, addArgs) {
  if (!config.profiles || typeof config.profiles !== "object") {
    config.profiles = {};
  }
  if (!config.profiles[addArgs.profile]) {
    config.profiles[addArgs.profile] = {};
  }
  const profile = config.profiles[addArgs.profile];
  if (!profile.env || typeof profile.env !== "object") {
    profile.env = {};
  }

  if (addArgs.type) {
    profile.type = addArgs.type;
  }

  for (const pair of addArgs.pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) throw new Error(`Invalid KEY=VALUE: ${pair}`);
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    profile.env[key] = value;
  }

  if (addArgs.note !== null && addArgs.note !== undefined) {
    profile.note = addArgs.note;
  }

  if (addArgs.removeFiles.length > 0) {
    if (!Array.isArray(profile.removeFiles)) profile.removeFiles = [];
    for (const p of addArgs.removeFiles) {
      if (!profile.removeFiles.includes(p)) profile.removeFiles.push(p);
    }
  }

  if (addArgs.commands.length > 0) {
    if (!Array.isArray(profile.commands)) profile.commands = [];
    for (const cmd of addArgs.commands) {
      if (!profile.commands.includes(cmd)) profile.commands.push(cmd);
    }
  }

  if (addArgs.unset.length > 0) {
    if (!Array.isArray(config.unset)) config.unset = [];
    for (const key of addArgs.unset) {
      if (!config.unset.includes(key)) config.unset.push(key);
    }
  }

  if (profile.type) {
    applyTypeDefaults(config, profile.type);
  }

  return config;
}

function printList(config) {
  const profiles = config && config.profiles ? config.profiles : {};
  const names = Object.keys(profiles).sort();
  if (names.length === 0) {
    console.log("(no profiles found)");
    return;
  }
  for (const name of names) {
    const note = profiles[name] && profiles[name].note ? `\t${profiles[name].note}` : "";
    console.log(`${name}${note}`);
  }
}

function printShow(config, profileName) {
  const profile = config.profiles && config.profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`);
  }
  console.log(JSON.stringify(profile, null, 2));
}

function printUnset(config) {
  const keys = Array.isArray(config.unset) ? config.unset : [];
  if (keys.length === 0) return;
  const lines = keys.map((k) => `unset ${k}`);
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
  return params[0];
}

function resolveProfileByType(config, type, name, rawType) {
  if (!name) throw new Error("Missing profile name.");
  const profiles = config && config.profiles ? config.profiles : {};

  if (profiles[name] && profileMatchesType(profiles[name], type)) {
    return name;
  }

  const prefixes = [];
  if (rawType) {
    const raw = String(rawType).trim();
    if (raw && raw.toLowerCase() !== type) prefixes.push(raw);
  }
  prefixes.push(type);

  const candidates = [];
  for (const prefix of prefixes) {
    candidates.push(`${prefix}-${name}`, `${prefix}_${name}`, `${prefix}.${name}`);
  }

  for (const candidate of candidates) {
    if (profiles[candidate] && profileMatchesType(profiles[candidate], type)) {
      return candidate;
    }
  }

  throw new Error(`Unknown profile for type "${type}": ${name}`);
}

function printUse(config, profileName) {
  const profile = config.profiles && config.profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  const env = profile.env || {};
  const lines = [];

  if (Array.isArray(config.unset)) {
    for (const key of config.unset) {
      if (!Object.prototype.hasOwnProperty.call(env, key)) {
        lines.push(`unset ${key}`);
      }
    }
  }

  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value === null || value === undefined || value === "") {
      lines.push(`unset ${key}`);
    } else {
      lines.push(`export ${key}=${shellEscape(value)}`);
    }
  }

  if (Array.isArray(profile.removeFiles)) {
    for (const p of profile.removeFiles) {
      const expanded = expandEnv(p);
      if (expanded) lines.push(`rm -f ${shellEscape(expanded)}`);
    }
  }

  if (Array.isArray(profile.commands)) {
    for (const cmd of profile.commands) {
      if (cmd && String(cmd).trim()) lines.push(String(cmd));
    }
  }

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
    if (cmd === "add") {
      const writePath = findConfigPathForWrite(parsed.configPath);
      const addArgsRaw = args.slice(1);
      const hasInteractive =
        addArgsRaw.length === 0 ||
        addArgsRaw.includes("-i") ||
        addArgsRaw.includes("--interactive");
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

    const configPath = findConfigPath(parsed.configPath);
    const config = readConfig(configPath);
    if (cmd === "list") {
      printList(config);
      return;
    }
    if (cmd === "use") {
      const profileName = resolveProfileName(config, args.slice(1));
      printUse(config, profileName);
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
  } catch (err) {
    console.error(`codenv: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`codenv: ${err.message}`);
  process.exit(1);
});

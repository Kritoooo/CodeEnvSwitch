/**
 * Constants for codenv
 */
import * as path from "path";
import * as os from "os";
import type { ProfileType } from "./types";

export const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");

export const DEFAULT_PROFILE_TYPES: ProfileType[] = ["codex", "claude"];

export const DEFAULT_UNSET_KEYS: Record<ProfileType, string[]> = {
    codex: [
        "OPENAI_BASE_URL",
        "OPENAI_API_KEY",
        "CODE_ENV_PROFILE_KEY_CODEX",
        "CODE_ENV_PROFILE_NAME_CODEX",
        "CODE_ENV_CONFIG_PATH",
    ],
    claude: [
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "CODE_ENV_PROFILE_KEY_CLAUDE",
        "CODE_ENV_PROFILE_NAME_CLAUDE",
        "CODE_ENV_CONFIG_PATH",
    ],
};

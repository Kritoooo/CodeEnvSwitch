/**
 * Constants for codenv
 */
import type { ProfileType } from "./types";

/** Comment markers delimiting the block codenv owns inside a file it edits. */
export const CODENV_BLOCK_START = "# >>> codenv >>>";
export const CODENV_BLOCK_END = "# <<< codenv <<<";

/** Provider id codenv creates for API profiles, distinct from codex's built-in "openai". */
export const CODEX_PROVIDER_NAME = "OpenAI";

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

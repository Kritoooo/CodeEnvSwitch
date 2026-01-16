export interface StatuslineInputProfile {
    key?: string;
    name?: string;
    type?: string;
}

export interface StatuslineInputUsage {
    todayTokens?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
}

export interface StatuslineInputContextWindowUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
}

export interface StatuslineInputContextWindow {
    current_usage?: StatuslineInputContextWindowUsage | null;
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    currentUsage?: StatuslineInputContextWindowUsage | null;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    contextWindowSize?: number;
}

export interface StatuslineInputModel {
    id?: string;
    displayName?: string;
    display_name?: string;
}

export interface StatuslineInput {
    cwd?: string;
    type?: string;
    profile?: StatuslineInputProfile;
    model?: string | StatuslineInputModel;
    model_provider?: string;
    usage?: StatuslineInputUsage;
    token_usage?: StatuslineInputUsage | number | Record<string, unknown>;
    git_branch?: string;
    task_running?: boolean;
    review_mode?: boolean;
    context_window_percent?: number;
    context_window_used_tokens?: number;
    context_window?: StatuslineInputContextWindow | Record<string, unknown> | null;
    contextWindow?: StatuslineInputContextWindow | Record<string, unknown> | null;
    workspace?: {
        current_dir?: string;
        project_dir?: string;
    };
    cost?: Record<string, unknown>;
    version?: string;
    output_style?: { name?: string };
    session_id?: string;
    sessionId?: string;
    transcript_path?: string;
    hook_event_name?: string;
}

export interface StatuslineUsage {
    todayTokens: number | null;
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
}

export interface StatuslineUsageTotals {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
}

export interface GitStatus {
    branch: string | null;
    ahead: number;
    behind: number;
    staged: number;
    unstaged: number;
    untracked: number;
    conflicted: number;
}

export interface StatuslineJson {
    cwd: string;
    type: string | null;
    profile: { key: string | null; name: string | null };
    model: string | null;
    usage: StatuslineUsage | null;
    git: GitStatus | null;
}

export interface StatuslineResult {
    text: string;
    json: StatuslineJson;
}

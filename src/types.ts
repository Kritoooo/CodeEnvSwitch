/**
 * Type definitions for codenv
 */

export type EnvValue = string | null | undefined;

export type ProfileType = "codex" | "claude";

export type DefaultProfiles = Partial<Record<ProfileType, string>>;

export interface Profile {
    name?: string;
    type?: string;
    note?: string;
    env?: Record<string, EnvValue>;
    removeFiles?: string[];
    commands?: string[];
    pricing?: ProfilePricing;
}

export interface CodexStatuslineConfig {
    command?: string | string[];
    showHints?: boolean;
    updateIntervalMs?: number;
    timeoutMs?: number;
    configPath?: string;
}

export interface ClaudeStatuslineConfig {
    command?: string | string[];
    type?: string;
    padding?: number;
    settingsPath?: string;
}

export interface Config {
    unset?: string[];
    profiles?: Record<string, Profile>;
    defaultProfiles?: DefaultProfiles;
    usagePath?: string;
    usageStatePath?: string;
    profileLogPath?: string;
    codexSessionsPath?: string;
    claudeSessionsPath?: string;
    codexStatusline?: CodexStatuslineConfig;
    claudeStatusline?: ClaudeStatuslineConfig;
    pricing?: PricingConfig;
}

export interface TokenPricing {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    description?: string;
}

export interface PricingConfig {
    models?: Record<string, TokenPricing>;
}

export interface ProfilePricing extends TokenPricing {
    model?: string;
    multiplier?: number;
}

export interface ListRow {
    key: string;
    name: string;
    type: string;
    note: string;
    active: boolean;
    usageType?: ProfileType | null;
    todayTokens?: number;
    totalTokens?: number;
    todayCost?: number;
    totalCost?: number;
    todayBilledTokens?: number;
    totalBilledTokens?: number;
}

export interface ParsedArgs {
    args: string[];
    configPath: string | null;
    help: boolean;
}

export interface InitArgs {
    apply: boolean;
    print: boolean;
    shell: string | null;
}

export interface AddArgs {
    profile: string | null;
    pairs: string[];
    note: string | null;
    removeFiles: string[];
    commands: string[];
    unset: string[];
    type: ProfileType | null;
}

export interface UsageResetArgs {
    yes: boolean;
}

export type StatuslineFormat = "text" | "json";

export interface StatuslineArgs {
    format: StatuslineFormat;
    cwd: string | null;
    type: string | null;
    profileKey: string | null;
    profileName: string | null;
    model: string | null;
    usageToday: number | null;
    usageTotal: number | null;
    usageInput: number | null;
    usageOutput: number | null;
    syncUsage: boolean;
}

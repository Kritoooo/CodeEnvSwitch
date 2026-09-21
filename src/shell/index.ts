/**
 * Shell module exports
 */
export { normalizeShell, detectShell, getShellRcPath } from "./detect";
export { getShellSnippet, upsertShellSnippet } from "./snippet";
export { shellEscape, expandEnv, resolvePath } from "./utils";

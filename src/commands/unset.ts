/**
 * Unset command - print unset statements
 */
import type { Config } from "../types";
import { DEFAULT_PROFILE_TYPES } from "../constants";
import { getTypeDefaultUnsetKeys } from "../config/defaults";

export function printUnset(config: Config): void {
    const keySet = new Set<string>();
    if (Array.isArray(config.unset)) {
        for (const key of config.unset) keySet.add(key);
    }
    for (const type of DEFAULT_PROFILE_TYPES) {
        for (const key of getTypeDefaultUnsetKeys(type)) keySet.add(key);
    }
    if (keySet.size === 0) return;
    const lines = Array.from(keySet, (key) => `unset ${key}`);
    console.log(lines.join("\n"));
}

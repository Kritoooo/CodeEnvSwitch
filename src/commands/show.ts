/**
 * Show command - display profile details
 */
import type { Config } from "../types";

export function printShow(config: Config, profileName: string): void {
    const profile = config.profiles && config.profiles[profileName];
    if (!profile) {
        throw new Error(`Unknown profile: ${profileName}`);
    }
    console.log(JSON.stringify(profile, null, 2));
}

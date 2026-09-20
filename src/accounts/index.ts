/**
 * Account vault module exports
 */
export type { VaultMode, VaultState, VaultTypeState, ReconcileReport } from "./vault";
export {
    getVaultRoot,
    getVaultDir,
    getVaultCredentialPath,
    getLiveCredentialPath,
    readVaultState,
    writeVaultState,
    getTypeState,
    reconcileVault,
    checkoutVault,
    writeVaultCredential,
    readVaultCredential,
    isManagedLive,
    describeLive,
    adoptLiveCredential,
} from "./vault";
export { applyProfileAccount } from "./apply";
export type { ApplyReport } from "./apply";
export { describeCredential, detectAuthMode } from "./identity";
export { runAdopt } from "./adopt";
export {
    buildMigrateTypePlan,
    printMigratePlan,
    executeMigrateTypePlan,
    writeSafetyCopy,
    getMigrateTypes,
} from "./migrate";
export type { MigrateTypePlan } from "./migrate";

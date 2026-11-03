import { Injectable } from "@nestjs/common";
import { runtimeConfig } from "../config/runtime-config.js";

const features = [
  { id: "identity", label: "Customer identity and secure sessions", state: "not_implemented" },
  { id: "kyc", label: "KYC and screening", state: "not_implemented" },
  { id: "ledger", label: "Double-entry ledger and balances", state: "not_implemented" },
  { id: "fiat", label: "Fiat deposits and withdrawals", state: "not_implemented" },
  { id: "crypto", label: "Crypto deposits and withdrawals", state: "not_implemented" },
  { id: "transfers", label: "Transfers, invoices, and receipts", state: "not_implemented" },
  { id: "restrictions", label: "Account restrictions and dual control", state: "not_implemented" },
  { id: "history", label: "Transaction history and statements", state: "not_implemented" },
] as const;

@Injectable()
export class PlatformService {
  projection() {
    return {
      service: "fintech-api",
      version: runtimeConfig.version,
      mode: runtimeConfig.mode,
      source: "application-code" as const,
      financialOperationsEnabled: runtimeConfig.financialOperationsEnabled,
      storage: {
        activeBuild: runtimeConfig.activeDatabaseEngine,
        hostingTarget: runtimeConfig.hostingDatabaseTarget,
        hostingTargetConnected: false as const,
      },
      features: features.map((feature) => ({ ...feature, available: false as const })),
      policy: "No financial or identity capability is enabled in the foundation build.",
    };
  }
}

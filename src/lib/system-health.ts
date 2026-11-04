import { getConnection } from "@/db/client";
import { classifyHealthError } from "@/lib/health-diagnostic";

export type SafeIncidentCategory =
  | "none"
  | "connection"
  | "capacity"
  | "timeout"
  | "configuration"
  | "security"
  | "unknown";

export type SystemHealthSnapshot = {
  app: "responding";
  database: "connected" | "unavailable";
  category: SafeIncidentCategory;
  checkedAt: string;
};

function safeIncidentCategory(error: unknown): SafeIncidentCategory {
  // Only a fixed, coarse category leaves the server. Never return an error
  // message, SQL state, host, stack, connection string or driver metadata.
  switch (classifyHealthError(error).category) {
    case "authentication":
    case "permission":
    case "database_missing":
    case "connection_rejected":
      return "configuration";
    case "connection_limit":
      return "capacity";
    case "database_unavailable":
    case "connection_failed":
    case "connection_refused":
    case "connection_reset":
    case "dns":
      return "connection";
    case "timeout":
      return "timeout";
    case "tls":
      return "security";
    default:
      return "unknown";
  }
}

export async function checkSystemHealth(): Promise<SystemHealthSnapshot> {
  // Only called after verifying the System Admin principal and MFA.
  // A single read-only statement, the existing pool connection timeout,
  // no polling and no financial/personal tables keep this check lightweight.
  try {
    await getConnection().pool.query("SELECT 1");
    return { app: "responding", database: "connected", category: "none", checkedAt: new Date().toISOString() };
  } catch (error) {
    return {
      app: "responding",
      database: "unavailable",
      category: safeIncidentCategory(error),
      checkedAt: new Date().toISOString(),
    };
  }
}

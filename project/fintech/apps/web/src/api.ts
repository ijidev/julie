export type DatabaseState =
  | { state: "connected"; engine: "sqlite"; latencyMs: number; migrations: number }
  | { state: "unavailable"; engine: "sqlite"; latencyMs: number; reason: "integrity_check_failed" | "query_failed" };

export type HealthSnapshot = {
  ok: boolean;
  service: string;
  version: string;
  state: "ready" | "degraded";
  environment: "development" | "test" | "staging" | "production";
  mode: "foundation";
  financialOperationsEnabled: false;
  storage: {
    active: "sqlite";
    hostingTarget: "mysql";
    hostingTargetConnected: false;
  };
  uptimeSeconds: number;
  checkedAt: string;
  database: DatabaseState;
};

export type CapabilityProjection = {
  service: string;
  version: string;
  mode: "foundation";
  source: "application-code";
  financialOperationsEnabled: false;
  storage: {
    activeBuild: "sqlite";
    hostingTarget: "mysql";
    hostingTargetConnected: false;
  };
  features: Array<{
    id: string;
    label: string;
    state: "not_implemented";
    available: false;
  }>;
  policy: string;
};

export function resolveApiUrl(resource: string, documentBase: string): string {
  const root = new URL("api/", documentBase);
  return new URL(resource.replace(/^\/+/, ""), root).toString();
}

async function readJson<T>(resource: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(resolveApiUrl(resource, document.baseURI), {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function loadFoundation(signal: AbortSignal): Promise<{ health: HealthSnapshot; capabilities: CapabilityProjection }> {
  const [health, capabilities] = await Promise.all([
    readJson<HealthSnapshot>("health", signal),
    readJson<CapabilityProjection>("capabilities", signal),
  ]);
  return { health, capabilities };
}

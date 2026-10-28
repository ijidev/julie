function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function label(value: unknown, max = 300): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** Aggregate only Gateway-reported model usage. No token/cost values are inferred. */
export function aggregateModelUsage(sessionUsageRows: any[]) {
  const models = new Map<string, {
    provider: string | null;
    model: string;
    calls: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    missingCostEntries: number;
  }>();

  for (const row of sessionUsageRows) {
    const entries = Array.isArray(row?.usage?.modelUsage) ? row.usage.modelUsage : [];
    for (const entry of entries) {
      const model = label(entry?.model);
      if (!model) continue;
      const provider = label(entry?.provider, 120);
      const key = `${provider ?? ""}\u0000${model}`;
      const current = models.get(key) ?? {
        provider,
        model,
        calls: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        totalCost: 0,
        missingCostEntries: 0,
      };
      const totals = entry?.totals && typeof entry.totals === "object" ? entry.totals : {};
      current.calls += finite(entry?.count);
      current.input += finite(totals.input);
      current.output += finite(totals.output);
      current.cacheRead += finite(totals.cacheRead);
      current.cacheWrite += finite(totals.cacheWrite);
      current.totalTokens += finite(totals.totalTokens);
      current.totalCost += finite(totals.totalCost);
      current.missingCostEntries += finite(totals.missingCostEntries);
      models.set(key, current);
    }
  }

  return [...models.values()].sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls || a.model.localeCompare(b.model));
}

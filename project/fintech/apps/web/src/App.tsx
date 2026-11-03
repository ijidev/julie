import { useCallback, useEffect, useState } from "react";
import { loadFoundation, type CapabilityProjection, type HealthSnapshot } from "./api";

type Snapshot = { health: HealthSnapshot; capabilities: CapabilityProjection };
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; snapshot: Snapshot }
  | { kind: "error"; message: string };

const featureNotes: Record<string, string> = {
  identity: "Secure sessions, MFA, recovery, and deny-by-default authorization.",
  kyc: "Provider-hosted verification, screening, tiers, and evidence-backed decisions.",
  ledger: "Immutable balanced postings, atomic holds, idempotency, and reversals.",
  fiat: "Signed events, settlement states, failure handling, and reconciliation.",
  crypto: "Custody adapters, confirmations, screening, finality, and no app-held keys.",
  transfers: "Atomic transfers, payment requests, invoices, and posted receipts.",
  restrictions: "Granular server-side controls, reason evidence, and maker/checker.",
  history: "Real lifecycle events, statements, exports, and reconciliation evidence.",
};

function databaseLabel(health: HealthSnapshot): { label: string; tone: "good" | "warn" } {
  if (health.database.state === "connected") return { label: `Connected · ${health.database.latencyMs} ms`, tone: "good" };
  const reasons = {
    integrity_check_failed: "Integrity check failed",
    query_failed: "Query failed",
  } as const;
  return { label: reasons[health.database.reason], tone: "warn" };
}

function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    loadFoundation(controller.signal)
      .then((snapshot) => setState({ kind: "loaded", snapshot }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "Foundation API unavailable" });
      });
    return () => controller.abort();
  }, [refreshKey]);

  const snapshot = state.kind === "loaded" ? state.snapshot : null;
  const database = snapshot ? databaseLabel(snapshot.health) : null;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Fintech foundation home">
          <span className="brand-mark">F</span>
          <span><strong>Fintech</strong><small>banking platform</small></span>
        </a>
        <nav aria-label="Page sections">
          <a href="#evidence">Evidence</a>
          <a href="#scope">Scope</a>
          <a href="#roadmap">Roadmap</a>
          <a href="docs/DECISIONS.md">Decisions</a>
        </nav>
        <span className={`stage ${snapshot?.health.state === "ready" ? "good" : "warn"}`}>
          <i /> {state.kind === "loading" ? "Checking runtime" : state.kind === "error" ? "API unavailable" : `Foundation · ${snapshot?.health.state}`}
        </span>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><span>One deployable foundation</span> · sandbox only</div>
          <h1>Build trust first.<br /><em>Then move value.</em></h1>
          <p className="hero-copy">A live TypeScript application shell for a
            ledger-first fiat and crypto platform. Its backend reports exactly
            what exists today—and keeps every financial capability disabled.</p>
          <div className="hero-actions">
            <a className="button primary" href="#evidence">Inspect live evidence <span>↓</span></a>
            <a className="button secondary" href="docs/PRODUCT_REQUIREMENTS.md">Read product requirements</a>
          </div>
          <div className="safety-note">
            <span aria-hidden="true">◇</span>
            <p><strong>No balances, customer records, KYC decisions, providers, or
              money movement are enabled.</strong> Requested capabilities remain
              unavailable until their actual backend, controls, and sandbox
              evidence exist.</p>
          </div>
        </section>

        <section className="section evidence" id="evidence">
          <div className="section-heading">
            <span>Backend-sourced runtime evidence</span>
            <h2>Nothing here is inferred.</h2>
            <p>The page reads the application health and capability APIs. A missing
            SQLite runtime is shown as unavailable if its real integrity probe
            fails. MySQL remains an unconnected hosting target.</p>
          </div>

          {state.kind === "loading" && <div className="state-card"><span className="spinner" />Reading the foundation APIs…</div>}
          {state.kind === "error" && (
            <div className="state-card error"><div><strong>Foundation API unavailable</strong><span>{state.message}</span></div><button onClick={refresh}>Retry</button></div>
          )}
          {snapshot && database && (
            <div className="runtime-grid">
              <article><small>Application</small><strong>Reachable</strong><span className="signal good"><i />API response observed</span></article>
              <article><small>SQLite build database</small><strong>{database.label}</strong><span className={`signal ${database.tone}`}><i />{snapshot.health.database.state}{snapshot.health.database.state === "connected" ? ` · ${snapshot.health.database.migrations} migration` : ""}</span></article>
              <article><small>Hosting database</small><strong>MySQL 8.4+</strong><span className="signal warn"><i />Not connected in this environment</span></article>
              <article><small>Financial operations</small><strong>Disabled</strong><span className="signal good"><i />Server enforced</span></article>
              <article><small>Version</small><strong>{snapshot.health.version}</strong><span>Uptime · {snapshot.health.uptimeSeconds}s</span></article>
              <article><small>Observed</small><strong>{new Date(snapshot.health.checkedAt).toLocaleTimeString()}</strong><button className="text-button" onClick={refresh}>Refresh evidence</button></article>
            </div>
          )}
        </section>

        <section className="section" id="scope">
          <div className="section-heading">
            <span>Requested capability map</span>
            <h2>Unavailable by design—until proven.</h2>
            <p>These states come from <code>GET api/capabilities</code>. Future
              milestones may change a capability only after its server path and
              evidence are implemented.</p>
          </div>
          <div className="feature-grid">
            {(snapshot?.capabilities.features ?? []).map((feature, index) => (
              <article className="feature" key={feature.id}>
                <div className="feature-top"><span>{String(index + 1).padStart(2, "0")}</span><b>{feature.state.replace("_", " ")}</b></div>
                <h3>{feature.label}</h3>
                <p>{featureNotes[feature.id] ?? "Capability details are not configured."}</p>
                <div className="feature-state"><i />Unavailable</div>
              </article>
            ))}
            {!snapshot && state.kind !== "loading" && <div className="state-card">Capability evidence is unavailable while the API cannot be read.</div>}
          </div>
        </section>

        <section className="section roadmap" id="roadmap">
          <div className="section-heading">
            <span>Delivery sequence</span>
            <h2>Controls before connections.</h2>
            <p>The workspace backlog progresses from owner decisions and platform
              foundations through ledger/KYC, one fiat sandbox, a limited custody
              testnet, hardening, and a separately approved pilot.</p>
          </div>
          <ol className="timeline">
            <li><span>00</span><div><small>Decide</small><h3>Operating model</h3><p>Jurisdiction, licence/partner, customer segment, assets, providers, economics.</p></div></li>
            <li><span>01</span><div><small>Establish</small><h3>Secure foundation</h3><p>One-port app, local SQLite, MySQL import migrations, CI, security headers, runtime evidence.</p></div></li>
            <li><span>02</span><div><small>Prove</small><h3>Financial core</h3><p>Authorization, KYC gates, ledger invariants, holds, idempotency, audit.</p></div></li>
            <li><span>03</span><div><small>Integrate</small><h3>Sandbox rails</h3><p>One fiat provider and limited custody testnet with reconciliation.</p></div></li>
            <li><span>04</span><div><small>Harden</small><h3>Release evidence</h3><p>Security, privacy, penetration, restore/DR, operations, compliance review.</p></div></li>
            <li><span>05</span><div><small>Approve</small><h3>Controlled pilot</h3><p>Named sign-offs, dual-control enablement, allowlisted cohort, daily review.</p></div></li>
          </ol>
          <div className="doc-links">
            <a href="docs/ARCHITECTURE.md">Architecture <span>↗</span></a>
            <a href="docs/DELIVERY_PLAN.md">Delivery plan <span>↗</span></a>
            <a href="docs/SECURITY_COMPLIANCE.md">Security baseline <span>↗</span></a>
            <a href="docs/DECISIONS.md">Owner decisions <span>↗</span></a>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand"><span className="brand-mark">F</span><span><strong>Fintech</strong><small>foundation build</small></span></div>
        <p>Sandbox-only · No production funds, providers, keys, or customer data</p>
        <a href="api/health">Raw health evidence ↗</a>
      </footer>
    </div>
  );
}

export default App;

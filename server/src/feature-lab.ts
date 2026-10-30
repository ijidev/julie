// Feature Lab: seeded capability gaps that Julie proposed during the 2026-10-30
// architecture review. Rows are inserted idempotently by title, so the owner can
// edit, vote, or delete them without seeds reappearing. AI-generated ideas from
// agents use the same table through POST /api/feature-ideas with source 'agent'.
import { db } from "./db.js";

type Seed = { title: string; description: string; category: string; status?: "proposed" | "planned" };

const SEEDS: Seed[] = [
  {
    title: "Channel front door: every message through Julie",
    description: "Telegram/WhatsApp/Discord messages and voice notes route through Julie, resolve @mentions to real agents, and delegate instead of answering directly. Deferred until the installability pass lands; needs an OpenClaw channel-config change with owner approval.",
    category: "platform",
    status: "planned",
  },
  {
    title: "Gateway transcript reconciliation",
    description: "Julie's local conversation rows and the Gateway's canonical transcripts drift after failures. A scheduled reconciler should diff both sides, mark gaps honestly, and never fabricate missing replies.",
    category: "data",
    status: "planned",
  },
  {
    title: "Project setup / teardown / health checks",
    description: "Beyond launch: run install and setup scripts from the Projects page, stop orphans on reboot, and surface a real health probe (HTTP or TCP) per running project.",
    category: "operations",
  },
  {
    title: "Per-agent and per-project cost budgets",
    description: "Token usage and provider cost already stream from the Gateway. Aggregate by agent and project, enforce owner-set budgets, and mark overruns as real status instead of silence.",
    category: "product",
  },
  {
    title: "Approval inbox for high-impact actions",
    description: "Deploys, deletions, spending, and outbound messages should pause for owner approval with an explicit approve/deny trail. Nothing executes without a recorded decision.",
    category: "security",
  },
  {
    title: "Scheduler UI for recurring agent runs",
    description: "The agent_profiles schedule_mode column exists but has no surface. Add cron-style recurring prompts, run history, and missed-run accounting through the Gateway.",
    category: "operations",
  },
  {
    title: "Evaluation harness for agent behavior",
    description: "Prompt fixtures plus expected-outcome assertions, run per release against staging agents, with scores persisted so model/prompt changes are measured, not guessed.",
    category: "product",
  },
  {
    title: "Memory browser across past runs",
    description: "Search conversations, run actions, and artifacts in one view with provenance (which agent, which session, when). Today history is only reachable per-session.",
    category: "product",
  },
  {
    title: "Project secret references, not inline secrets",
    description: "Projects should reference named entries in the owner's vault/env store so secrets never land in project rows, logs, or backups.",
    category: "security",
  },
  {
    title: "Agent handoff timeline",
    description: "One vertical timeline per task showing delegation, child sessions, action streams, and completion — the story of who did what, in order, from real events.",
    category: "experience",
  },
  {
    title: "Push notifications for completions and failures",
    description: "Web Push or a webhook to the owner's phone when a task moves to pending_review/done or a run fails. Opt-in per workspace; no fabricated delivery states.",
    category: "product",
  },
  {
    title: "Audit export and retention policy",
    description: "Export audit_logs and task_activity as JSON/CSV with owner-set retention. Right now the Settings page can only delete them.",
    category: "security",
  },
  {
    title: "Project dependency and deploy graph",
    description: "Show which project launches which (ports, env, workspace teams) as a directed graph so a launch or stop can warn about affected dependents.",
    category: "operations",
  },
  {
    title: "Backup restore with point-in-time preview",
    description: "Before restoring, diff the backup's row counts and schema version against the live DB and preview exactly what changes.",
    category: "data",
  },
  {
    title: "Offline / degraded mode banner",
    description: "If the Gateway drops, every live surface should show an honest degraded banner and freeze stale reads instead of rendering last-known state as current.",
    category: "experience",
  },
  {
    title: "Cross-surface search",
    description: "One search box across chats, tasks, projects, agents, docs, and feature ideas with scoped filters, backed by a real SQLite FTS index.",
    category: "experience",
  },
  {
    title: "Voice routing to specific agents",
    description: "Voice capture exists; add @name resolution in speech so 'Hey Julie, ask Victor to…' dispatches to the right agent session instead of Julie answering alone.",
    category: "product",
  },
  {
    title: "Model and provider health dashboard",
    description: "Probe configured providers (primary and fallback) on a schedule, record latency and auth errors, and show real availability — never a cached 'connected'.",
    category: "platform",
  },
  {
    title: "Feature Lab triage pipeline",
    description: "Let office agents post ideas with evidence links and let Julie move an accepted idea into a delegated task with a named session, closing the loop from this page.",
    category: "product",
  },
];

export function seedFeatureIdeas(): { inserted: number; existing: number } {
  const insert = db.prepare(
    `INSERT INTO feature_ideas (title, description, category, source, status)
     VALUES (?, ?, ?, 'julie', ?)`
  );
  const hasTitle = db.prepare("SELECT 1 FROM feature_ideas WHERE title = ?");
  let inserted = 0;
  let existing = 0;
  db.transaction(() => {
    for (const seed of SEEDS) {
      if (hasTitle.get(seed.title)) { existing++; continue; }
      insert.run(seed.title, seed.description, seed.category, seed.status ?? "proposed");
      inserted++;
    }
  })();
  return { inserted, existing };
}

// Run once when the module is first imported (same pattern as projects.ts).
seedFeatureIdeas();

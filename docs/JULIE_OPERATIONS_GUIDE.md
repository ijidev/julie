# Julie Operations Guide

How Julie organizes work, which system owns which fact, and what the owner can
actually rely on. This guide matches the runtime modules; when code and this
document disagree, the code wins and this document is a defect.

## 1. Ownership boundaries

| Fact | Owner | Julie behavior |
|---|---|---|
| Agent ID, model, tools, skills, sessions, transcripts, channels | OpenClaw Gateway | Read through the Gateway API; never synthesize |
| Human name, role, department, reporting line, schedule | Julie (human name is also written to the Gateway identity when edited) | Local org metadata; visible in the roster |
| Tasks, task activity, audit log | Julie | Local SQLite |
| Conversations, durable turn queue, delivery state | Julie | Local rows linked to a real Gateway session |
| Rooms and room messages | Julie | Local persistent groups; each room turn uses real agent sessions |
| Workspace plans and receipts | Julie | Local plan → review → confirm → apply |
| Agent activity timeline | Gateway frames, stored by Julie | `run_actions` rows and live SSE events |

A Julie **workspace** is an access scope for conversations, agents, and tasks. It
is not an OpenClaw agent workspace directory. Do not treat the two as the same
thing.

## 2. Roster, names, and delegation

- Every office agent has a canonical ID (`dev-builder`) and an owner-facing
  human name (`Victor`). Julie always reports both when delegating.
- The live roster is built from the Gateway plus Julie's org metadata. If the
  Gateway is unavailable, the roster context says so; it never invents agents.
- An owner `@mention` is resolved server-side (human name or canonical ID).
  Before Julie's turn, the runtime opens a **named durable session** with that
  agent and dispatches the owner's request. Julie receives a directive that the
  delegation already happened.
- Julie must report the delegation and the agent's real result. She must not
  re-dispatch the same request and must not do the named agent's work herself.
- Unknown mentions are reported as unknown; no agent is invented.
- Delegated sessions claim a durable Gateway `label`, so a failed background
  title generation cannot leave the session unnamed. Julie falls back to that
  label when the Gateway reports no display name.
- If a delegated run fails, the failure is written into the conversation as a
  system message and Julie reports it honestly.

## 3. Tools and execution

### OpenClaw tools

The Gateway tool catalog is the source of truth. `GET /api/tools` reads it live.
A tool appearing in the catalog is not proof that a call is authorized or
healthy; the run result is.

### OpenCode (coding execution)

Engineering work uses OpenCode V2 as the default coding runtime, in a named
session in the target project:

```bash
opencode run --agent engineering --model agentrouter/gpt-5.6-sol \
  --title "Task <id> · <short outcome>" "<objective, constraints, acceptance, verification>"
```

If the primary model is observably unavailable or out of provider credit
**before changes**, retry once with `nvidia/z-ai/glm-5.3-flash` and disclose the
fallback with a second receipt. Never silently replay a partially executed run.

### Skills

OpenClaw skills and OpenCode skills are separate discovery and permission
systems. Julie may show a source-labeled catalog, but files are not copied
between them by default. A duplicate ID is allowed only as an intentional
higher-precedence override.

## 4. Files and containment

- Julie's repository and data live under its own root. It does not write to the
  OpenClaw home, OpenClaw configuration, Caddy, or unrelated system state.
- Secrets stay in the local `.env` (mode 0600, gitignored). Never print, log,
  copy, or commit them.
- Anything outside the Julie repository requires an explicit backup, a stated
  reason, and owner approval before it is changed.
- Agent-created artifacts should be reported by path. A claimed file that does
  not exist is a failed task, not a completed one.

## 5. Setup templates and workspace planning

The workspace wizard is intentionally two-step:

1. **Plan** — the owner provides a name, a purpose, and an explicit team mode:
   **shared pool** (reuse existing agents) or **dedicated team** (propose new
   roles and human names). No mode is preselected.
2. **Review** — Julie returns the plan, the agents involved, warnings, and the
   exact creation steps. Nothing exists yet.
3. **Confirm** — the owner confirms the plan token.
4. **Apply** — Julie creates the workspace, assignments, and any approved agents,
   then returns a receipt.

Rules:

- A plan is not a creation. Do not create anything before confirmation.
- A dedicated plan must contain exactly one lead with 2–6 specialist roles.
- A shared plan reuses only agents from the existing roster.
- The purpose must not contain credentials or secret material.
- Applying an approved plan is the only creation step.

## 6. Tasks, rooms, queue, and runs

### Tasks

Task status is a closed set: `backlog`, `ready`, `in_progress`, `waiting_input`,
`pending_review`, `done`, `blocked`. Task runs go through real Gateway sessions
and write task activity. A task is not done because a prompt was sent; it is done
when the real result is recorded.

### Rooms

Rooms are persistent groups tied to a task or department. Every lead has a
department room containing its direct reports for planning, delegation, and
communication. Room membership is managed explicitly; adding or removing a
member is a real local change. Room turns dispatch through each participating
agent's own session.

### Chat queue and cancellation

- While a turn is running, new text is stored in a durable local FIFO queue and
  dispatched in order.
- Attachments wait until the active turn finishes so file bytes are never held
  in an unconfirmed memory queue.
- **Recall** removes a message that has not been dispatched yet.
- **Remove locally** deletes Julie's local transcript row only. It does not
  remove the text from the model context or the Gateway transcript.
- **Stop** uses the Gateway abort path. The UI reflects the Gateway's terminal
  state, not a guessed one.

### Activity timeline

The timeline is built from real Gateway `agent` frames:

- tool starts and results (commands, reads, edits, searches, delegations),
- approval waits,
- lifecycle start/finish/end/error and fallbacks,
- progress notes.

Each row shows a real title, the command or path, optional output, and a status:
running, done, needs approval, failed, or stopped. A run that fails or is stopped
stays visible as a failed/stopped row.

## 7. External channels

Telegram and other channels currently reach OpenClaw directly and do not pass
through Julie's roster, aliases, rooms, tasks, or activity persistence. This is a
known architectural gap. The owner has deferred the front-door decision until
after the installability/security phase. Do not claim that Julie owns channel
conversations until that routing exists.

## 8. Verification receipt

A completion is only complete with:

- task ID,
- the real OpenCode/OpenClaw session ID and title,
- artifact paths,
- checks actually run (build, typecheck, web build, health, real round-trip),
- relevant Gateway/Julie health,
- limitations and the next decision.

`npm run build`, `cd web && npx tsc --noEmit`, `npm run web:build`,
`sudo systemctl restart julie`, and `curl -s localhost:3000/api/health` are the
minimum local checks. Integration claims additionally need a real Gateway
round-trip.

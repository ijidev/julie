# Julie Engineering Operating System

## Purpose

OpenCode V2 is the default **coding execution runtime** for Product & Technology.
OpenClaw office agents remain the planning, delegation, review, and owner-facing
communication layer. An engineering agent may inspect with its native tools,
but implementation should run through OpenCode unless the work is a tiny,
bounded edit or OpenCode is observably unavailable. Every fallback must be
reported rather than hidden.

The reviewed model policy is:

1. Primary: `agentrouter/gpt-5.6-sol`.
2. Fallback: `nvidia/z-ai/glm-5.3-flash` only when the
   primary is observably unavailable or out of provider credit.

OpenCode V2 has one configured default model, not an ordered runtime fallback
array. Therefore fallback is an explicit second attempt with a new receipt; it
must not silently replay after a partially executed primary run.

## Authority chain

- Owner / CEO: priorities and consequential approval.
- Julie: orchestration and final owner-facing synthesis.
- Engineering Lead: decomposes engineering work, knows the effective tool and
  skill catalog of each direct report, opens named work sessions, and reviews
  evidence before reporting upward.
- Engineering specialists: own bounded research, implementation, platform, or
  QA artifacts. Specialists do not create more children unless a reviewed task
  explicitly grants that topology.
- OpenCode `engineering`: default implementation agent inside a project.

## OpenCode-first dispatch

For implementation work, the responsible specialist should use a named OpenCode
session in the target project:

```bash
opencode run --agent engineering --model agentrouter/gpt-5.6-sol \
  --title "Task <id> · <short outcome>" \
  "<objective, constraints, acceptance criteria, verification, stop condition>"
```

Continue the returned session for follow-up rather than creating duplicate
untitled sessions. Attach relevant files with `--file` when needed. The
Engineering Lead reviews the OpenCode session/artifacts and returns the result
through the originating named OpenClaw conversation.

If the primary fails before making changes with a provider-unavailable or
credit/quota result, retry once and disclose the fallback:

```bash
opencode run --agent engineering \
  --model nvidia/z-ai/glm-5.3-flash \
  --title "Task <id> · <short outcome> · NVIDIA fallback" \
  "<same reviewed task receipt>"
```

Do not use OpenClaw `sessions_spawn` as a substitute for OpenCode implementation.
Use a named durable office conversation for lead/specialist coordination and
OpenCode for repository execution. Hidden children are reserved for bounded,
independent analysis where their completion owner and delivery path are known.

## Tool discovery contract

The Engineering Lead must not answer “I do not know what tools my team has.”
Before delegation it should consult the current Julie/Gateway capability
projection for the target agent and distinguish:

- **OpenClaw tools:** runtime catalog and effective session permissions.
- **OpenClaw skills:** role/workflow instructions loaded by OpenClaw.
- **OpenCode agents/tools/skills:** the coding runtime discovered from V2 project
  and global OpenCode configuration.
- **Requested capabilities:** Julie HR requests, which are not grants.

Catalog visibility is not proof that one execution is authorized or healthy.
The lead should report unavailable/unknown states exactly and perform one
bounded probe when reachability matters.

## Skill-library boundary

OpenClaw and OpenCode have separate discovery and permission systems. Julie may
show a unified source-labeled catalog, but files are not copied between them by
default:

- OpenClaw: bundled/managed/workspace skills reported by `skills.status`.
- OpenCode: built-in, global, project, compatibility, and explicit V2 skill
  sources reported by the OpenCode service.

Duplicate IDs are allowed only as an intentional higher-precedence override.

## Session and handoff rules

1. Every delegated office conversation has a human-readable task title.
2. A request alone is not a completion; retain the assistant response or an
   explicit failed/cancelled outcome.
3. Reuse the named session for follow-up. Do not fan out same-agent children to
   rediscover one configuration fact.
4. The lead owns synthesis. Specialists return artifacts, exact checks, and
   uncertainty to the lead; the lead returns one coherent result to Julie.
5. Queue, cancel, archive, and delete use documented Gateway lifecycle APIs and
   observed session IDs. Never delete state directories directly.

## Verification receipt

An engineering completion includes the task ID, OpenCode session ID/title,
artifact paths, checks actually run, relevant Gateway/Julie health, limitations,
and the next decision. No receipt means the task remains in progress or blocked.

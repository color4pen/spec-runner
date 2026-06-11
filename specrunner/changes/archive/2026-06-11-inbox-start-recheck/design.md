# Design: inbox-start-recheck

## Context

`planInbox` is a pure function that produces a snapshot-based plan from job states
collected at tick start. When the plan contains multiple start actions, each `startJob`
call runs a full pipeline and may take 25+ minutes before returning. A second tick
running during that window will independently plan and start the same issue, because
the first tick's in-flight job has not yet written its linked issue number to persistent
state before `planInbox` runs.

Affected code:
- `src/core/inbox/run-inbox.ts` lines 182–194: serial start loop
- `src/core/inbox/planner.ts` lines 90–131: `planStarts` — snapshot-based linkage check

## Goals / Non-Goals

**Goals**:
- Eliminate duplicate starts caused by long-running pipelines and concurrent ticks
- Keep the planner pure (no I/O, no change to `planStarts`)

**Non-Goals**:
- Parallelising starts
- Changing execution order of starts
- Re-checking linkage for resume or recover actions

## Decisions

### D1: Re-check in the executor loop, not the planner

The planner remains a pure snapshot function. The re-check is inserted in
`runInboxOrchestrator`'s start execution loop in `run-inbox.ts`, immediately before
each `effects.startJob` call.

**Rationale**: The planner's purity is a deliberate design invariant (all decisions
deterministic given inputs, no I/O). Injecting live state reads into the planner would
break this contract. The executor already handles side effects; adding one read here
is consistent with its role.

**Alternatives considered**: Centralised pre-flight check (read states once before the
loop) — rejected because it only closes the window before the first start; subsequent
starts would still race.

### D2: Add `isIssueLinked` to `InboxEffects`

A new injectable effect `isIssueLinked(issueNumber: number): Promise<boolean>` is added
to `InboxEffects`. The default implementation calls `JobStateStore.list(repoRoot)` and
returns `true` if any job has a matching `issueNumber`.

**Rationale**: Consistent with the existing pattern — all I/O in `InboxEffects` is
injectable for testability. Tests can stub `isIssueLinked` without touching the
filesystem.

**Alternatives considered**: Re-using the existing `allJobStates` snapshot inside the
loop — rejected because it does not reflect state written by the pipeline that just
completed.

## Risks / Trade-offs

- **Extra store read per start**: Each start now issues one additional `JobStateStore.list`
  call. For the typical case of 1–2 starts per tick this is negligible. The store reads
  are cheap (local filesystem JSON).
- **TOCTOU window remains**: The re-check and `startJob` are not atomic. A concurrent
  tick could still link the issue in the gap between the check and `writeDraft`. This
  window is milliseconds wide (vs. the original 25+ minute window), which is an
  acceptable reduction given the scope constraint of not parallelising starts.

## Open Questions

None.

# Design: job-view-accuracy

## Context

Two operational view commands produce values that diverge from observable facts:

**Bug 1 — `job ls` escalation source step**

`deriveEscalationSourceStep` (`src/core/job-list/operations-view.ts:150`) scans
`state.steps` across all runs and all steps, returning the step whose most recent
escalation verdict has the greatest timestamp. This produces a wrong answer when a
job has been escalated, resumed, and then interrupted again for a different reason
(timeout or iteration exhaustion): the old escalation run is still in the steps
history and surfaces as the "current" interruption source.

`state.resumePoint` (`src/state/schema.ts:107`) is written at every interruption
(`awaiting-resume` transition) by both `pipeline.ts` and `executor.ts`. It records
the step and reason of the *current* stop, making it the authoritative source for
"why is this job stopped right now". Older jobs (legacy state) may not have this
field (it is optional in the schema).

**Bug 2 — `job stats` cost double-counting**

`deriveRunStat` (`src/core/command/job-stats.ts:88`) aggregates cost from
`usageFile.commandInvocations` without filtering by `jobId`. The usage file
(`usage.json`) lives in a change directory resolved by slug only, so two jobs
sharing the same slug (e.g. from re-running an archived request) map to the same
file. Iterating all invocations in that file merges costs across both jobs.

`CommandInvocation.jobId` (`src/core/usage/types.ts:17`) is already written for
current-format entries but is optional (absent in legacy data).

## Goals / Non-Goals

**Goals**:
- `job ls`: show escalation source step only when the *current* interruption is
  escalation-sourced; hide it for timeout / iteration-exhaustion interruptions
  even if prior escalation runs exist in history
- `job ls`: preserve existing behaviour for legacy states that lack `resumePoint`
- `job stats`: filter `commandInvocations` by `jobId` so each job row counts only
  its own cost; fall back to counting legacy (jobId-absent) invocations normally
- Fix both bugs by modifying two pure functions; no schema changes, no I/O layer
  changes, no display format changes

**Non-Goals**:
- `resumePoint` schema changes (reason enum, new fields)
- `usage.json` format changes
- `job ls` / `job stats` display format or column changes
- `resolve-change-dir` resolution logic changes

## Decisions

### D1 — `resumePoint` as primary gate for escalation detection

When `state.resumePoint` is present, restrict escalation-source lookup to
`state.steps[resumePoint.step]` and check whether the most recent run in that
array carries `verdict === "escalation"`. If yes, return `resumePoint.step`; if no
(timeout, exhaustion, or anything else), return null.

When `resumePoint` is absent (legacy state), keep the current full-history scan as
a fallback.

**Rationale**: `resumePoint` is the canonical record of the current interruption.
Scoping the lookup to `resumePoint.step` eliminates cross-job escalation bleed. A
verdict check on the most recent run for that step reliably distinguishes escalation
from other stop reasons because:
- Escalation is a discrete verdict returned by the agent before the pipeline writes
  `resumePoint`; the run entry for the step is complete and has `verdict === "escalation"`
- Timeout and iteration exhaustion write `resumePoint` without closing the step run
  with an escalation verdict (verdict is null or a non-escalation value)

**Alternatives considered**:
- Parse `resumePoint.reason` string to detect "escalation" — rejected because reason
  is a free-form string with no contract; future changes could silently break it
- Apply a timestamp cutoff to history scan — rejected by architect (indirect,
  error-prone, requires additional timestamp source)

### D2 — jobId filter on `commandInvocations` with legacy passthrough

In `deriveRunStat`, filter `usageFile.commandInvocations` before aggregating cost:

```
include invocation if:
  invocation.jobId is absent/undefined  →  legacy passthrough (always include)
  invocation.jobId === state.jobId      →  belongs to this job (include)
  otherwise                             →  belongs to different job (exclude)
```

**Rationale**: Invocations written for `"job"` entries since `job-stats` was
introduced carry `jobId`. Filtering by exact match prevents cross-job leakage.
Passthrough for absent `jobId` preserves cost reporting for data written before the
field was added.

**Alternatives considered**:
- Exclude all invocations without `jobId` — rejected by architect (silently drops
  legacy cost data, a regression)
- Change `resolve-change-dir` to return per-jobId paths — out of scope, broader
  impact

## Risks / Trade-offs

- [Risk] `resumePoint.step` points to a step that has never had an escalation run
  (e.g. internal error path). In that case `state.steps[resumePoint.step]` returns
  an empty array or undefined, so `mostRecentRun` is undefined and null is
  correctly returned. No risk.
- [Risk] Legacy states without `resumePoint` continue using history scan, which has
  the original bug. Accepted: legacy jobs are closed / archived states; the bug
  manifests only in live `awaiting-resume` jobs, which always have `resumePoint`.

## Open Questions

None. All design forks resolved in the request.

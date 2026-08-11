# Cross-Boundary Invariants Review — Result 001

**Change**: cancel-process-tree-kill
**Reviewer**: cross-boundary-invariants
**Iteration**: 1
**Date**: 2026-08-11

---

## Purpose

Detect invariants of **unchanged** code that the new behaviour silently breaks.
Scope: execution paths where existing tests stay green but cross-module interaction
introduces a defect.

---

## Scope of Diff

32 files changed, 3590 insertions, 41 deletions. Core changed files:

- `src/core/cancel/pid-kill.ts` — `gracefulKill`, `reapGroup`, `KillDeps/KillResult`
- `src/core/cancel/runner.ts` — `cancelSingleJob` (kill gate + sidecar fallback)
- `src/core/liveness/resolve-pid.ts` — NEW shared resolver
- `src/core/port/query-abort.ts` — NEW port interface
- `src/core/lifecycle/query-abort-hub.ts` — NEW hub
- `src/adapter/claude-code/agent-runner.ts` — hub registration
- `src/core/runtime/local.ts` — hub construction + signalCleanup wiring
- `src/cli/cancel.ts` — `isGroupLeader` production probe

---

## Findings

### F-001: Group SIGKILL fires on SIGTERM-success polling path — spec says "SIGKILL escalation only"

**Severity**: medium

**Location**: `src/core/cancel/pid-kill.ts` lines 103 and 110

**Description**

`reapGroup()` is called at **three** points in `gracefulKill`:

1. Line 103: when `isAlive(pid)` throws `ESRCH` during polling → process died (from SIGTERM)
2. Line 110: when `isAlive(pid)` returns `false` during polling → process died (from SIGTERM)
3. Lines 136-148: at SIGKILL escalation → the path the spec describes

The spec says:

> "Graceful kill reaps the process group on SIGKILL escalation **only** for group leaders"
> "On SIGKILL escalation, gracefulKill SHALL send SIGKILL to the target pid and, **only when** the target pid is a process-group leader, additionally send SIGKILL to the process group (-pid) to reap descendants."

The implementation sends group SIGKILL **also** when the pid dies from SIGTERM during polling
(paths 1 and 2), not only at SIGKILL escalation (path 3).

**Mechanism**

For a dead group-leader pid, `isGroupLeader(dead_pid)` calls `kill(-pid, 0)`. If surviving
descendants keep the process group alive, this succeeds → `kill(-pid, "SIGKILL")` is sent.
`groupKilled: true` is set on this path, causing the cancel output:

```
Process group -<pid> reaped (SIGKILL sent to group)
```

to fire even when the runner itself died from SIGTERM and SIGKILL was never sent to it.

**Safety**

Non-leader pids: `kill(-pid, 0)` → ESRCH (no group with pgid=pid) → `isGroupLeader` false
→ no group kill. Foreground jobs are safe. ✓

For detached leaders that die from SIGTERM while children survive: group SIGKILL is sent.
This is functionally **correct** (children are cleaned up), but the spec scenario "Given a pid
that **stays alive** through the SIGTERM poll window" does not cover this.

**Gap**

No test pins whether group kill fires on the SIGTERM-success polling path (TC-006/TC-007 only
cover SIGKILL escalation). The poll-death group-kill path is an untested implicit behaviour.

---

### F-002: Cancel of failed/terminated jobs now attempts kills via stale liveness sidecar

**Severity**: medium

**Location**: `src/core/cancel/runner.ts` (cancelSingleJob kill block)
`src/core/cancel/runner.ts` × `src/core/liveness/resolve-pid.ts`

**Description**

Before this change, the kill block was gated by `state.status === "running"`:

```ts
// OLD: only signal when running
if (state.status === "running") {
  if (state.pid != null) { kill(state.pid, …) }
}
```

After this change, the gate is removed (design D2: process-death gate). If **any** pid resolves
from `state.pid` or a jobId-matched sidecar, `gracefulKill` is called regardless of status.

**The invariant that breaks**: cancel of a `failed` or `terminated` job previously
**never** attempted to kill any process. That is no longer true.

**Why a `failed` job has a non-null sidecar pid**

When the runner starts, `writeLivenessSidecar(slug, jobId, worktreePath, process.pid)` writes
the runner's PID to `.specrunner/local/<slug>/liveness.json`.

When a job fails, `pipeline.ts:161` sets `patch: { pid: null }` in the `failed` state, so
`state.pid` is null. However, the **sidecar is NOT cleaned up on failure** — only on `cancel`
and `archive/post-merge-cleanup`. The sidecar retains the dead runner's PID.

**Flow after this change for a `failed` job**

1. `state.pid` = null  
2. `readLivenessSidecar(...)` → `{ pid: <dead_runner_pid>, jobId: <this_job_id> }`  
3. `resolveJobPid` → sidecar adopted (jobId matches) → `pid = <dead_runner_pid>`  
4. `gracefulKill(dead_runner_pid, ...)` → `SIGTERM` sent

Two outcomes:

- **Dead pid** (expected): `SIGTERM` → `ESRCH` → `{ killed: true }` — safe, no observable harm
- **Pid reused** (rare): `SIGTERM` → success → poll → unrelated process may be killed

**Missing test**

`runner-process-gate.test.ts` uses `status="running"` (TC-002) and `status="awaiting-resume"`
(TC-001, TC-004) for non-null-sidecar tests. **No test covers `status="failed"` (or `"terminated"`)
with a non-null sidecar pid.** If someone later re-introduces a status restriction (e.g.,
"only kill if running or awaiting-resume"), the sidecar fallback for failed jobs would silently
stop working without failing any existing test.

**Assessment**

The design D2 explicitly intends to remove the status gate ("pid がどこからも解決できない場合は
現行どおり警告して続行する"). Killing a dead runner's pid via stale sidecar is harmless via
`ESRCH`. The pid-reuse risk is acknowledged in the design's residual risk section.

The finding is flagged as medium because the **execution path for status=failed + non-null
sidecar** is untested, and the change in behaviour relative to the previous invariant is not
pinned by any test.

---

### F-003: TC-016 implicit structural assumption about `signalCleanup` changed

**Severity**: low

**Location**: `src/core/runtime/__tests__/signal-handler-order.test.ts` (unchanged file)
`src/core/runtime/local.ts` (changed: `signalCleanup` body)

**Description**

TC-016 was written with an implicit assumption about the signal handler's structure:

> `markSignalHandlerFired()` → first await is `store.load()`

The test verifies the invariant by capturing `isSignalHandlerFired()` at the moment
`store.load()` is called. TC-016 passes because `markSignalHandlerFired()` is still called
before any await.

After this change the actual structure is:

```
markSignalHandlerFired();     // synchronous (unchanged position ✓)
hub.abortActive();             // synchronous
await hub.drain(…);           // NEW: first await
…
const current = await store.load();  // was the first await
```

TC-016 still passes because:
- The flag is set before any await (invariant holds ✓)
- The hub is empty in the test → `drain()` resolves immediately → test doesn't observe it

However, TC-016 does **not** verify that `drain()` precedes `store.load()`. The new ordering
invariant (`abortActive() → drain() → store.load()`) is tested by `runner-abort-hub.test.ts`
(TC-008/TC-009/TC-010 + the regression test at the bottom of that file), but TC-016 itself
is unaware of the new first-await.

**Risk**

If a future edit moves `drain()` to after `store.load()`, TC-016 would still pass (flag is
still set before `store.load()`), but the ordering invariant (drain must precede the state
persist) would be broken without any existing test catching it at the TC-016 level.

The partial mitigation is `runner-abort-hub.test.ts` which does pin the full new sequence
(TC-008: abortActive before persist; TC-009: persist happens after drain; TC-010: drain
timeout doesn't block persist).

---

## Summary

| ID | Severity | File | Title |
|----|----------|------|-------|
| F-001 | medium | `src/core/cancel/pid-kill.ts:103,110` | Group SIGKILL fires on SIGTERM-success poll path, not only SIGKILL escalation |
| F-002 | medium | `src/core/cancel/runner.ts` + `src/core/liveness/resolve-pid.ts` | Cancel of failed/terminated jobs now kills via stale sidecar — untested new path |
| F-003 | low | `src/core/runtime/__tests__/signal-handler-order.test.ts` | TC-016 implicit structural assumption changed; new ordering not pinned there |

No critical findings. No safety invariant for foreground jobs is broken (F-001: `isGroupLeader`
check correctly returns false for non-leaders in all paths; F-002: ESRCH handles dead pids safely).

---

## Evidence Checked

- `src/core/cancel/pid-kill.ts` — full read, traced all `reapGroup` call sites
- `src/core/cancel/runner.ts` — full read, traced kill gate removal and sidecar resolution
- `src/core/liveness/resolve-pid.ts` — read, verified jobId gating
- `src/core/runtime/local.ts:1533-1568` — signalCleanup body; hub wiring
- `src/adapter/claude-code/agent-runner.ts:527-531,1133-1137` — deregister coverage
- `src/core/lifecycle/query-abort-hub.ts` — drain/abortActive contract
- `tests/unit/core/cancel/pid-kill.test.ts` — verified makeDeps default has no isGroupLeader
- `tests/unit/core/cancel/runner.test.ts` — awaiting-resume test uses null sidecar pid
- `tests/unit/core/cancel/runner-process-gate.test.ts` — verified no failed+non-null-sidecar test
- `src/core/runtime/__tests__/signal-handler-order.test.ts` — TC-016 invariant and its new gap
- `tests/unit/core/runtime/runner-abort-hub.test.ts` — TC-008/009/010 + regression test
- `src/core/pipeline/pipeline.ts:161` — confirmed `pid: null` patch on failure transition
- Sidecar cleanup paths: `src/core/cancel/runner.ts:457` + `src/core/archive/post-merge-cleanup.ts:73`
  — confirmed: sidecar not cleaned up on `failed` transition
- `src/core/command/detach.ts:119-124` — confirmed runner spawned with `detached: true`

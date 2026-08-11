# Cross-Boundary Invariants Review — Iteration 2

**Reviewer**: cross-boundary-invariants
**Iteration**: 2
**Scope**: diff between `main` and `change/cancel-process-tree-kill-f28a2862`

---

## Context

The review detects cases where code NOT changed by this diff has implicit invariants that the new behaviour silently breaks. The implementation itself may be correct and tests green, but latent bugs reside only in interactions with unchanged mechanisms.

Iteration 1 found three issues. All three were adjudicated and resolved by the operator + code-fixer:
- F-001: poll-death group reap tests added to `pid-kill.test.ts` (`isAlive=false` path)
- F-002: failed/terminated + sidecar pid test added to `runner-process-gate.test.ts`
- F-003: TC-016 comment staleness — operator ruled no action needed

This round re-reads all touched files and checks for new cross-boundary invariant concerns.

---

## Files Examined

| File | Reason |
|------|--------|
| `src/core/cancel/pid-kill.ts` | Core kill logic; both death-observation branches |
| `src/core/cancel/runner.ts` | cancelSingleJob pid resolution + kill dispatch |
| `src/core/liveness/resolve-pid.ts` | New shared resolver |
| `src/core/lifecycle/query-abort-hub.ts` | Hub implementation |
| `src/core/port/query-abort.ts` | Port interface |
| `src/adapter/claude-code/agent-runner.ts` | Hub registration / deregister on run() |
| `src/core/runtime/local.ts` | Hub wiring + signalCleanup ordering |
| `src/cli/cancel.ts` | **Production isAlive wiring** |
| `tests/unit/core/cancel/pid-kill.test.ts` | F-001 additions (isAlive=false path) |
| `tests/unit/core/cancel/pid-kill-group.test.ts` | SIGKILL escalation + ESRCH-group tests |
| `tests/unit/core/cancel/runner-process-gate.test.ts` | F-002 addition |
| `tests/unit/core/cancel/runner.test.ts` | Existing cancel tests |
| `tests/unit/core/runtime/runner-abort-hub.test.ts` | TC-008/009/010 |
| `tests/cancel-process-group-integration.test.ts` | **Integration test isAlive wiring** |
| `src/core/runtime/__tests__/signal-handler-order.test.ts` | TC-016 |
| `src/core/job-access/load-by-job-id.ts` | State load path used by cancel |
| `design.md`, `spec.md`, `request.md`, `tasks.md` | Spec authority |

---

## Finding F-004 — Poll-Death ESRCH Branch Untested for Group Leader Case

**Severity**: medium
**Resolution**: fixable
**Files**:
- `src/core/cancel/pid-kill.ts` lines 99–107 (ESRCH catch branch)
- `src/cli/cancel.ts` lines 115–118 (production `isAlive` wiring)
- `tests/cancel-process-group-integration.test.ts` line 115 (integration `isAlive`)

### What the invariant is

`spec.md` explicitly requires group reap on **every observed death path** during the SIGTERM poll:

> "the SIGTERM poll paths (the pid dies during polling, **whether observed via `isAlive` returning false or via ESRCH**)"

The implementation satisfies this: `gracefulKill` calls `reapGroup(pid, kill, isGroupLeader)` in both the `!alive` branch (line 110) and the `catch ESRCH` branch (line 103).

### How the new change silently diverges in tests vs. production

**Production `isAlive`** (wired in `src/cli/cancel.ts:115-118`):
```ts
isAlive: (pid) => {
  process.kill(pid, 0);  // THROWS ESRCH when dead
  return true;
},
```
When the runner dies after SIGTERM, `process.kill(pid, 0)` throws ESRCH. `gracefulKill` catches this at lines 99–107 — the **ESRCH branch**.

**Test `isAlive`** (F-001 unit tests in `pid-kill.test.ts:148`, integration test at `cancel-process-group-integration.test.ts:115`):
```ts
isAlive: vi.fn().mockReturnValue(false)           // unit
isAlive: (pid) => { try { ... } catch { return false; } }  // integration
```
Both return `false` on dead pid — taking the **`!alive` branch** (line 109-111), never the ESRCH branch.

### What this means

All F-001 unit tests and the TC-021 integration test exercise the `!alive` branch. The ESRCH branch (the production path for graceful runner shutdown) is exercised by the existing test at `pid-kill.test.ts:96–103`, but that test uses `isGroupLeader: () => false` (the default from `makeDeps`). No test covers **ESRCH + leader=true → groupKilled=true**.

If the `reapGroup` call were deleted from the ESRCH branch while kept in the `!alive` branch:
- All F-001 tests pass (they use the `!alive` branch)
- Integration test passes (it uses the `!alive` branch with catching `isAlive`)
- **Production silently breaks**: when the runner process exits gracefully from SIGTERM, the ESRCH catch branch fires, group reap does not occur, agent subprocess orphans — exactly the failure mode this change was designed to prevent.

### Fix

One unit test in `tests/unit/core/cancel/pid-kill.test.ts` (alongside the existing F-001 tests at lines 144-178):

```ts
it("poll-death (isAlive throws ESRCH) + leader: group SIGKILL sent", async () => {
  const kill = vi.fn();
  const deps = makeDeps({
    kill,
    isAlive: vi.fn().mockImplementation(() => { throw makeErrnoError("ESRCH"); }),
    isGroupLeader: vi.fn().mockReturnValue(true),
  });
  const result = await gracefulKill(8888, 1000, deps);
  expect(result.killed).toBe(true);
  expect(kill).toHaveBeenCalledWith(-8888, "SIGKILL");
  expect(result.groupKilled).toBe(true);
});
```

This pins the ESRCH branch with `isGroupLeader=true`, closing the gap without touching production code.

---

## Verified: Previously-Adjudicated Findings

### F-001 (resolved) — poll-death group reap tests

`pid-kill.test.ts` lines 144-178 now contain two tests (leader/non-leader `isAlive=false`). Also `pid-kill-group.test.ts` lines 133-152 covers the same case. Operator adjudication applied. **No re-escalation.**

### F-002 (resolved) — failed/terminated + sidecar kill

`runner-process-gate.test.ts` lines 297-322 contain `it.each(["failed", "terminated"])` test confirming that cancel attempts SIGTERM via sidecar pid for these statuses. Operator adjudication applied. **No re-escalation.**

### F-003 (adjudicated no-action) — TC-016 structural comment staleness

`signal-handler-order.test.ts` still has the comment referencing "first await is `store.load()`" even though the first await is now `hub.drain()`. The invariant tested (flag set before load) still holds because drain resolves immediately for an empty hub. Operator explicitly ruled no action. The runner-abort-hub tests (TC-008/009/010) cover the hub+signal ordering. **No re-escalation per operator ruling.**

---

## Other Observations (no action required)

### Double `sidecarAbsPath` declaration in `cancelSingleJob`

`runner.ts` declares `const sidecarAbsPath` at line 362 (outer, nullable) and again inside two `if (slug)` blocks (inner, non-nullable). The inner declarations shadow the outer but compute the same value. TypeScript allows this; both declarations refer to the same path. No invariant is broken — the sidecar is read correctly for pid resolution, for deletion, and for purge. Noted only for maintenance clarity.

### Hub shared across pipeline steps

`LocalRuntime.hub` is a single `QueryAbortHub` instance shared across all `createAgentRunner()` calls within a runtime instance. Since the pipeline is sequential and each step's `run()` deregisters its controller in `finally`, the hub is always empty when the next step starts. No invariant violation — the shared hub is the correct design for the signal handler to abort any currently in-flight query.

### Hub-abort misidentified as wall-clock timeout in catch block

When `signalCleanup` aborts the hub and a wall-clock timeout is configured (`timeoutId !== undefined`), the catch block in `run()` evaluates `abortController.signal.aborted && timeoutId !== undefined` = true and returns `completionReason: "timeout"`. Since `process.exit(130)` immediately follows drain completion in production, this misclassification is never consumed. In tests, `process.exit` is mocked to no-op, but those tests verify signal handler behavior, not pipeline step dispatch. No invariant violation for current callers.

---

## Summary

| # | Severity | Resolution | File | Title |
|---|----------|-----------|------|-------|
| F-004 | medium | fixable | `src/core/cancel/pid-kill.ts:99-107` | Poll-death ESRCH branch + leader group reap untested; production isAlive throws, tests use returning-false isAlive |

F-001, F-002, F-003 confirmed resolved; not re-raised.

# Regression Gate Result — Iteration 2

## Verification Summary

All 6 findings from the ledger were verified against the current branch code.

---

## Finding-by-Finding Verification

### [MEDIUM] bounded drain タイムアウトパスの scenario 欠落
**Status: FIXED**

`spec.md` lines 120–126 now contain the scenario:

```
#### Scenario: drain timeout does not block awaiting-resume persist and exit

Given an in-flight agent query whose AbortController is registered with the
runner's abort hub and never deregisters within the drain bound
When the runner's signal handler runs and the drain bound elapses
Then the job state is still persisted as awaiting-resume before the process exits
```

The MUST-bounded requirement at lines 102–103 and this scenario together anchor the runner-integration timeout path. TC-010 in `tests/unit/core/runtime/runner-abort-hub.test.ts` (lines 116–150) fixes the test for it.

---

### [LOW] group kill エラー時の動作に normative 記述がない
**Status: FIXED**

`spec.md` lines 65–67 now contain the normative statement:

> A group-signal error (EPERM/ESRCH) SHALL be treated as best-effort and MUST NOT affect the pid-kill outcome (i.e., MUST NOT flip the `killed` field of the result).

The implementation in `pid-kill.ts` lines 133–147 matches this.

---

### [LOW] reapGroup が SIGTERM ポーリング死亡パスでも呼ばれるが、isGroupLeader=true のケースがテストされていない
**Status: FIXED**

Two tests now cover the SIGTERM poll-death + leader paths:

- `tests/unit/core/cancel/pid-kill-group.test.ts` lines 134–152: `isAlive=false` + `isGroupLeader=true` → group SIGKILL sent, `groupKilled=true`
- `tests/unit/core/cancel/pid-kill.test.ts` lines 162–179: same path confirmed independently

The ESRCH path is covered by Finding 6 below.

---

### [LOW] getJobSlug(state) が cancelSingleJob 内で 2 回呼ばれる
**Status: FIXED**

`src/core/cancel/runner.ts` now calls `getJobSlug(state)` exactly once within `cancelSingleJob`, at line 361:

```ts
const slug = getJobSlug(state);
```

The `slug` variable is reused at lines 451, 478, 502 without recomputing. The grep shows no second invocation inside the function body.

---

### [LOW] TC-016 implicit structural assumption changed
**Status: STILL PRESENT**

The comment in `src/core/runtime/__tests__/signal-handler-order.test.ts` (lines 7–11) still describes `store.load()` as "the first await":

```
 *     markSignalHandlerFired();      ← synchronous, before any await
 *     try {
 *       const store = makeStore();
 *       const current = await store.load();  ← first await
```

The actual signal handler structure after this change is:
`markSignalHandlerFired() → hub.abortActive() → await hub.drain() → await store.load()`

`hub.drain()` is now the first await, not `store.load()`. TC-016 still passes because the flag is set before either await, but the comment is stale and TC-016 does not verify that `drain()` precedes `store.load()`.

**Partial mitigation**: `tests/unit/core/runtime/runner-abort-hub.test.ts` lines 153–183 verifies `isSignalHandlerFired()` is true at `store.load()` time even with hub drain present. However, no test pins that `drain()` precedes `store.load()` — a future edit swapping their order would pass all current tests.

---

### [MEDIUM] Poll-death ESRCH branch untested for group-leader
**Status: FIXED**

`tests/unit/core/cancel/pid-kill.test.ts` lines 144–160 now contains exactly the test specified in the finding:

```ts
it("ESRCH poll-death + leader: group SIGKILL sent when isAlive throws ESRCH and isGroupLeader=true", async () => {
  // isAlive throws ESRCH, isGroupLeader=true
  // expects: kill(-8888, "SIGKILL") called, result.groupKilled === true
```

`spec.md` lines 58–60 also anchors this in the normative text:
> on every path where the target's death is observed: the SIGTERM poll paths (the pid dies during polling, whether observed via `isAlive` returning false or via ESRCH)

---

## Evidence

- Files read: `spec.md`, `src/core/cancel/pid-kill.ts`, `src/core/cancel/runner.ts`, `tests/unit/core/cancel/pid-kill-group.test.ts`, `tests/unit/core/cancel/pid-kill.test.ts`, `src/core/runtime/__tests__/signal-handler-order.test.ts`, `tests/unit/core/runtime/runner-abort-hub.test.ts`
- grep verified: `getJobSlug` call count in `cancelSingleJob` scope
- grep verified: `markSignalHandlerFired`, `hub.drain`, `hub.abortActive` placement in `local.ts`

# Regression Gate Result — Iteration 1

## Verification Summary

Checked all 6 findings from the review ledger against the current branch code.

---

## Finding 1: [MEDIUM] bounded drain タイムアウトパスの scenario 欠落 — **FIXED**

`spec.md` lines 120–127 now include:

```
#### Scenario: drain timeout does not block awaiting-resume persist and exit

**Given** an in-flight agent query whose `AbortController` is registered with the
runner's abort hub and never deregisters within the drain bound
**When** the runner's signal handler runs and the drain bound elapses
**Then** the job state is still persisted as `awaiting-resume` before the process exits
```

TC-010 in `tests/unit/core/runtime/runner-abort-hub.test.ts` covers this scenario with a stuck controller + `vi.runAllTimersAsync()`.

---

## Finding 2: [LOW] group kill エラー時の動作に normative 記述がない — **FIXED**

`spec.md` lines 65–67 now contain the normative statement:

> A group-signal error (EPERM/ESRCH) SHALL be treated as best-effort and MUST NOT affect the pid-kill outcome (i.e., MUST NOT flip the `killed` field of the result).

---

## Finding 3: [LOW] reapGroup が SIGTERM ポーリング死亡パスでも呼ばれるが、isGroupLeader=true のケースがテストされていない — **FIXED**

Two tests now cover `isAlive=false + isGroupLeader=true` on the SIGTERM poll-death path:

- `tests/unit/core/cancel/pid-kill-group.test.ts` lines 134–152: "leader dies during SIGTERM poll (isAlive=false) — group signal is sent, groupKilled=true"
- `tests/unit/core/cancel/pid-kill.test.ts` lines 144–161: "poll-death + leader: group SIGKILL sent when pid dies during SIGTERM poll (isAlive=false)"

---

## Finding 4: [LOW] getJobSlug(state) が cancelSingleJob 内で 2 回呼ばれる — **FIXED**

`src/core/cancel/runner.ts` line 361 has a single `const slug = getJobSlug(state);` that is reused throughout `cancelSingleJob`. No second call exists within the function.

---

## Finding 5: [LOW] TC-016 implicit structural assumption changed — **STILL PRESENT**

`src/core/runtime/__tests__/signal-handler-order.test.ts` TC-016 still only checks that `isSignalHandlerFired()` is true at `store.load()` time. The new signal handler ordering is:

```
markSignalHandlerFired() → hub.abortActive() → await hub.drain() → await store.load()
```

TC-016 still passes because the flag is set before any await. However, no test specifically pins that `drain()` precedes `store.load()`. The runner-abort-hub.test.ts regression test (lines 152–183) verifies `isSignalHandlerFired()` is true at `store.load()` with hub drain wired, but if `drain()` were moved to after `store.load()`, that test would still pass. TC-008/009/010 also do not pin the drain→store.load() ordering.

---

## Finding 6: [MEDIUM] Poll-death ESRCH branch untested for group-leader — **STILL PRESENT**

`src/core/cancel/pid-kill.ts` lines 101–104:
```typescript
} catch (err: unknown) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ESRCH") {
    return { killed: true, groupKilled: reapGroup(pid, kill, isGroupLeader) };
  }
```

`reapGroup` is called on the ESRCH branch (production `isAlive` throws ESRCH when the pid is dead). No test combines `isAlive` throwing ESRCH with `isGroupLeader=true` and asserts `groupKilled===true`. 

- `tests/unit/core/cancel/pid-kill.test.ts` line 96–103: tests ESRCH throw but uses `makeDeps()` with no `isGroupLeader` (defaults to `() => false`).
- `tests/unit/core/cancel/pid-kill-group.test.ts`: tests `isAlive=false + isGroupLeader=true` but not `isAlive throwing ESRCH + isGroupLeader=true`.

If `reapGroup` were removed from the ESRCH branch while kept in the `!alive` branch, all tests would pass but the production happy path (ESRCH observed → group reaped) would silently break.

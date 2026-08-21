# Cross-Boundary Invariants Review — signal-name-in-interruption — Iteration 1

**Reviewer**: cross-boundary-invariants
**Purpose**: 変更が実装そのものは正しいまま、変更していないコードの暗黙の前提（不変条件）を黙って破っていないかを検出する。

---

## Review Scope

Changed source files examined:

| File | Role |
|------|------|
| `src/store/event-journal.ts` | `InterruptionRecord` type — `signal?` field added |
| `src/core/runtime/local.ts` | `signalCleanup` signature + body + SIGHUP registration/deregistration |
| `src/core/runtime/managed.ts` | `signalCleanup` signature + body + SIGHUP registration/deregistration |
| `src/core/runtime/__tests__/signal-name-in-interruption.test.ts` | New pinning test file |

Unchanged files verified as unaffected:

| File | Invariant checked |
|------|-------------------|
| `src/core/lifecycle/exit-guard.ts` | `appendInterruption` call-sites (no `signal` field) — still compile, still write `reason: "signal"` |
| `src/core/resume/canon-provenance.ts` | `INTERRUPTION_REASONS` and `isInterruptionBacked` — unmodified |
| `src/store/job-state-projection.ts` | `composeSplitLayoutFromContent` reads `lastInterruption.reason`, ignores new `signal` field |
| `src/core/runtime/__tests__/signal-handler-order.test.ts` | Calls `signalCleanup()` with no args via `as unknown as` cast — still safe |
| `src/core/pipeline/__tests__/member-resume-routing.test.ts` | `resumePoint.reason: "Interrupted by signal"` fixtures — unaffected |
| `src/core/command/__tests__/resume-member-context.test.ts` | `resumePoint.reason: "Interrupted by signal"` fixtures — unaffected |
| `src/core/resume/resume-context.ts` | Uses `resumePoint.reason` for display — unchanged |

---

## Invariants Examined

### INV-01: `InterruptionRecord.reason` remains `"signal"` (backward-compat, machine-judged)

**Source of invariant**: `fold()` in `event-journal.ts` returns `lastInterruption`, which `job-state-projection.ts` uses to materialize `resumePoint.reason = intr.reason`. `canon-provenance.ts`'s `INTERRUPTION_REASONS` set matches on `"signal"`.

**Change impact**: The PR adds `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` as a new optional field. The `reason` field value is left as `"signal"`. The `signal` field is purely additive.

**Verdict**: ✓ No violation. `reason: "signal"` is explicit in both local.ts:1697 and managed.ts is unchanged (managed doesn't call `appendInterruption`). Journal projection reads only `intr.reason`, ignores `intr.signal`.

---

### INV-02: `resumePoint.reason` persisted to state.json is unchanged

**Source of invariant**: `member-resume-routing.test.ts` and `resume-member-context.test.ts` use `resumePoint.reason: "Interrupted by signal"` as fixture input. `canon-provenance.ts`'s `isInterruptionBacked` checks `resumePoint.reason ∈ INTERRUPTION_REASONS`. (Note: `"Interrupted by signal"` is not in `INTERRUPTION_REASONS`; only the projection path's `intr.reason = "signal"` matches — pre-existing design.)

**Change impact**: local.ts:1703 changed the `reason` field passed to `transitionJob` from `"Interrupted by signal"` to `` `Interrupted by ${signal}` ``. However, this `reason` becomes the `HistoryEntry.message` (display field), NOT `resumePoint.reason`. The `resumePoint.reason` at local.ts:1708 remains `"Interrupted by signal"` (unchanged). Same for managed.ts:753.

**Verdict**: ✓ No violation. `resumePoint.reason` in persisted state.json is identical to pre-change behavior.

---

### INV-03: `HistoryEntry.message` is display-only (no machine consumers)

**Source of invariant**: `lifecycle.ts:131` produces `message: \`${state.status} → ${to}: ${ctx.reason}\``. The `ctx.reason` is now `` `Interrupted by ${signal}` `` (e.g., `"Interrupted by SIGTERM"`).

**Change impact**: History entry messages in `events.jsonl` change from `"running → awaiting-resume: Interrupted by signal"` to `"running → awaiting-resume: Interrupted by SIGTERM"`.

**Machine consumers checked**: No production source file reads `HistoryEntry.message` for machine-readable signal information. `resume-context.ts:42` uses `resumePoint.reason` (not history message). `fold()` reconstructs history faithfully but no downstream consumer checks the specific string content.

**Verdict**: ✓ No violation. Message change is display-only.

---

### INV-04: `job-state-projection.ts` — `lastInterruption` materialization

**Source of invariant**: `composeSplitLayoutFromContent` reads `foldResult.lastInterruption` and sets:
```ts
validated.resumePoint = {
  step: ...,
  reason: intr.reason,          // "signal"
  iterationsExhausted: ...,
  ...(intr.exhaustionPhase ? ... : {}),
};
```

**Change impact**: `lastInterruption` in `FoldResult` now may have a `signal` field. The projection code does not read `intr.signal` and does not spread it into `ResumePoint`. The `ResumePoint` interface has no `signal` field.

**Verdict**: ✓ No violation. The projection is unaffected by the additive `signal` field.

---

### INV-05: `isInterruptionBacked` / `INTERRUPTION_REASONS` unaffected

**Source of invariant**: `canon-provenance.ts:27-32` — `INTERRUPTION_REASONS = new Set(["signal", "timeout", "failure", "exhaustion"])`. Used by `isInterruptionBacked(resumePoint, staleRunningDetected)` to judge machine interruption.

**Change impact**: `INTERRUPTION_REASONS` is not modified. `resumePoint.reason` is not changed. When state is loaded via the journal projection path, `resumePoint.reason = intr.reason = "signal"` — matches `INTERRUPTION_REASONS`, so `isInterruptionBacked` returns `true` correctly.

**Verdict**: ✓ No violation.

---

### INV-06: `exit-guard.ts` call-sites unchanged, optional field handles the absence

**Source of invariant**: `handleNoWorktreeExit` and `handlePerJobExit` call `store.appendInterruption({ type: "interruption", reason: "signal", ts })` without `signal` field. Design D5 states this is intentional (no signal name available in `beforeExit` callback).

**Change impact**: `InterruptionRecord.signal` is declared as optional (`signal?: ...`). Existing call-sites pass no `signal` field and compile unchanged.

**Verdict**: ✓ No violation. TypeScript accepts the absence of optional field.

---

### INV-07: `signal-handler-order.test.ts` backward compatibility

**Source of invariant**: The test calls `signalCleanup()` without arguments via the cast `handle as unknown as { signalCleanup: () => Promise<void> }`, bypassing TypeScript's new parameter type. At runtime, `signal = undefined`.

**Change impact**: With `signal = undefined`:
- `appendInterruption` gets `{ signal: undefined, ... }` — mocked, never written; JSON.stringify would omit `undefined` anyway.
- `transitionJob` gets `reason: "Interrupted by undefined"` — mocked `persist` never asserts on this message.
- The test only asserts that `isSignalHandlerFired()` is `true` when `store.load()` is called.

**Verdict**: ✓ No violation. The test's assertions are unaffected by the signal parameter.

---

### INV-08: SIGHUP handler registration — MaxListeners and process behavior

**Source of invariant**: Before the PR, SIGHUP was unhandled — Node.js used the OS default disposition (terminate, no journal record). After, SIGHUP triggers `signalCleanup` + `process.exit(130)`.

**Machine invariant at issue**: Exit code for SIGHUP changes from OS-controlled (~129 on Linux for unhandled SIGHUP) to `130`. External monitoring tools that check exit codes may observe a change.

**Assessment**: The design explicitly acknowledges this as intentional behavior change (design.md Risk section, and request's architect decision "SIGHUP を別扱いしない"). The exit code `130` is documented as out-of-scope for per-signal differentiation. This is a known and accepted trade-off, not an unintended invariant break.

**Verdict**: ✓ Intentional, documented behavior change. Not an undetected invariant break.

---

### INV-09: Type cast safety in local.ts

**Source of invariant**: `local.ts:1698` uses:
```ts
signal: signal as "SIGINT" | "SIGTERM" | "SIGHUP",
```

The `signal` parameter is typed as `NodeJS.Signals` (covers all signals). The cast narrows it to the union at the TypeScript level but does not restrict at runtime. If `signalCleanup` were ever registered for a signal outside the union (e.g., `SIGUSR1`), the value would be written to the journal without type-level warning.

**Current scope**: `signalCleanup` is only registered for SIGINT, SIGTERM, and SIGHUP (lines immediately after the function definition). The registration set and the cast union are consistent.

**Assessment**: This is a maintenance risk (future-edit hazard), not a current bug. The registrations at local.ts:1721-1723 and the cast at 1698 are adjacent and mutually visible. Low severity.

**Verdict**: No current violation. Low-severity future-edit risk.

---

## Key Invariants With No Violation

| # | Invariant | Status |
|---|-----------|--------|
| INV-01 | `InterruptionRecord.reason = "signal"` preserved | ✓ Pass |
| INV-02 | `resumePoint.reason = "Interrupted by signal"` in state.json | ✓ Pass |
| INV-03 | `HistoryEntry.message` is display-only | ✓ Pass |
| INV-04 | `job-state-projection.ts` ignores new `signal` field | ✓ Pass |
| INV-05 | `INTERRUPTION_REASONS` / `isInterruptionBacked` unaffected | ✓ Pass |
| INV-06 | Exit-guard call-sites unchanged, optional field works | ✓ Pass |
| INV-07 | `signal-handler-order.test.ts` backward compat | ✓ Pass |
| INV-08 | SIGHUP exit code change is intentional/documented | ✓ Pass |
| INV-09 | Type cast in local.ts | Low risk, no current violation |

---

## Evidence

- **checked**: 9 invariants directly verified against source code
- **skipped**: 0
- **unverified**: 0

Verification: `typecheck` passed, `test` passed (verification-result.md: all 6 phases passed).

---

## Stale Comment (Observation, Non-blocking)

`signal-handler-order.test.ts:5` contains a stale comment:
```
 *   const signalCleanup = async (): Promise<void> => {
```
The actual signature is now `async (signal: NodeJS.Signals): Promise<void>`. This is a documentation-only issue with no behavioral consequence. The test body does not depend on the exact signature comment.


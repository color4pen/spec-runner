# Regression Gate — Iteration 3

**Change**: job-reopen-from-awaiting-archive
**Date**: 2026-07-22
**Findings checked**: 7

## Evidence

### [LOW] Finding 1 — REOPEN_USAGE step list (src/cli/command-registry.ts:293)

**Status: FIXED**

Line 293 reads:
```
Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}
```
The dynamic spread of `AGENT_STEP_NAMES` and `CLI_STEP_NAMES` is present. No literal array.

---

### [LOW] Finding 2 — FoldResult.operatorEvents optional type (src/store/event-journal.ts:185)

**Status: FIXED**

Line 185:
```typescript
operatorEvents: OperatorEventRecord[];
```
The field is non-optional. The JSDoc explicitly states "fold() always populates this field; literal constructors must provide it (empty array when no operator events exist)." No `?` suffix is present.

---

### [LOW] Finding 3 — store null: operator event silently skipped (src/core/command/reopen.ts:239)

**Status: FIXED**

The `if (store)` guard pattern is gone. Lines 233–241 now read:
```typescript
const resolved = await resolveStateStoreByJobId(cwd, state.jobId);
if (resolved === null) {
  logError(
    `Cannot locate a writable state store for job '${this.slug}' (sidecar missing). ` +
    `The job state is inaccessible — reopen cannot proceed without a durable store.`,
  );
  throw new PrepareError(1, "State store unavailable — sidecar missing");
}
store = resolved;
```
Null → fail-closed with PrepareError. No silent skip.

---

### [HIGH] Finding 4 — null store → fail-closed not implemented (src/core/command/reopen.ts:229)

**Status: FIXED**

Same code region as Finding 3. `resolveStateStoreByJobId` returning null throws `PrepareError(1, "State store unavailable — sidecar missing")`. prepare() does not return successfully when store is null. D6 durability is enforced.

---

### [MEDIUM] Finding 5 — allowReopen static invariant test not added (tests/unit/architecture/core-invariants.test.ts)

**Status: FIXED**

B-17 test suite added at line 1187:
```
// ─── B-17: allowReopen call-site confinement ─────────────────────────────────
describe("B-17 (arch pin): allowReopen: true は src/core/command/reopen.ts からのみ呼ばれる", () => {
```
Three sub-tests: primary grep-based enforcement, regression guard with synthetic violation, and excluded-file confirmation. Pattern `"allowReopen: true"` is grepped across `src/`.

---

### [LOW] Finding 6 — B-13 missing appendOperatorEvent in pattern (tests/unit/architecture/core-invariants.test.ts:1014)

**Status: FIXED**

Lines 1016, 1026, and 1051 all include `appendOperatorEvent` in the pattern:
```
store.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun|appendOperatorEvent)(
```
All four B-13 variants (executor, liveness, regression guard, parallel) use the updated pattern.

---

### [MEDIUM] Finding 7 — codeChangedSinceLastVerification misses human push (src/core/pipeline/reverification.ts)

**Status: FIXED**

New function `revisionChangedSinceLastVerification` (lines 72–86) compares `commitOid` of the last conformance run against the last verification run. Returns true when they differ, false when either is absent (fail-closed).

Composite guard `reverificationNeeded` (lines 104–106) returns:
```typescript
return codeChangedSinceLastVerification(state) || revisionChangedSinceLastVerification(state);
```

`src/core/pipeline/types.ts` imports `reverificationNeeded` (not `codeChangedSinceLastVerification`) and uses it as the `when` guard for both STANDARD and FAST profile `conformance approved → verification` transitions (lines 264, 316).

Human pushes after reopen that advance HEAD without triggering code-fixer are now detected via commitOid mismatch.

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | REOPEN_USAGE step list | FIXED |
| 2 | LOW | operatorEvents optional type | FIXED |
| 3 | LOW | null store silent skip | FIXED |
| 4 | HIGH | null store fail-closed | FIXED |
| 5 | MEDIUM | allowReopen arch test | FIXED |
| 6 | LOW | B-13 appendOperatorEvent | FIXED |
| 7 | MEDIUM | codeChangedSinceLastVerification | FIXED |

All 7 ledger findings confirmed fixed. No regressions detected.

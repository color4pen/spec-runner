# Cross-Boundary Invariants Review — round-all-skip-pass-through — iteration 1

## Scope

`git diff main...HEAD --stat` shows 4 production source files changed, 3 test files changed,
plus change-folder artifacts. This review targets the implicit invariants that the new
"all-skip → approved" behavior could silently break in adjacent code that the diff does not touch.

---

## Checked Invariants

### I-01: Error/skip verdict distinction maintained in `aggregateVerdict`

`aggregateVerdict` still short-circuits on `"escalation"` before any skip accumulation.
`["skipped","escalation"]` → `"escalation"` (TC-007). The removal of the `all-skipped → escalation`
branch does not touch the escalation short-circuit. ✓

### I-02: Mixed skip+error round still escalates to awaiting-resume

Coordinator returns `"escalation"` for mixed rounds. `reviewer-chain.ts` has no
`on: "escalation"` row for coordinator (the ROUND_ALL_MEMBERS_SKIPPED routing was the only such
row, now removed per D5). Missing transition → `nextStep = "escalate"` (pipeline.ts L366:
`transition?.to ?? "escalate"`). → awaiting-resume. ✓

### I-03: D3 guard prevents members from being set to permanent `"skipped"` on all-skip

Guard `if (!inspectionEscalated && !allMembersSkipped)` at parallel-review-round.ts L471 is
preserved. When `allMembersSkipped = true`, `applyRoundResults` is not called; members stay
`"pending"`. `selectPendingMembers` excludes status `"skipped"` permanently, so skipping
`applyRoundResults` is required to prevent a permanent free-pass. TC-009 covers this. ✓

### I-04: inspectionEscalated + allMembersSkipped co-occurrence handled correctly

HEAD guard (step 5b) or worktree inspection (step 7b) can set `inspectionEscalated = true` after
all members have returned "skipped". Both guards use `inspectionEscalated`:
- `if (!inspectionEscalated)` at step 7 keeps `aggregateVerdictResult = "escalation"` from 5b.
- `if (!inspectionEscalated && !allMembersSkipped)` at 7c keeps members pending regardless.
- `roundError` is set by the guard (ROUND_HEAD_ADVANCED etc.), not cleared.

Result: inspection escalation takes priority; the structural-skip path does not fire. ✓

### I-05: Diff-unavailable fail-closed preserved (executor.ts untouched)

`executor.ts` (activationPaths glob matching, fail-closed when diff unavailable) is explicitly
out of scope and unmodified. Existing tests for this path (`executor-activation.test.ts`) run
unchanged. ✓

### I-06: Backward recovery — state.error cleared by commitRound on all-skip

`commitRound` (commit-orchestrator.ts) sets `state.error = roundError`. With the new code,
`roundError = null` for all-skip. This clears any stale `ROUND_ALL_MEMBERS_SKIPPED` error from
a pre-existing job state. TC-015 (unit) and TC-010 (E2E) verify this. ✓

### I-07: Journal per-member skip evidence preserved

The `members.push({step, startedAt, result})` path in parallel-review-round.ts L327 is not
conditioned on `allMembersSkipped` — all fulfilled skip results are still pushed, and `commitRound`
still projects them via `projectSkip` / `skipHistoryEntry`. TC-004/TC-005 verify. ✓

### I-08: Terminal seam no longer references ROUND_ALL_MEMBERS_SKIPPED (dead code removed)

TC-016 statically asserts `pipeline.ts` contains zero occurrences of `"ROUND_ALL_MEMBERS_SKIPPED"`.
TC-017 asserts the same for `reviewer-chain.ts`. Both pass in the verified test suite (632/632). ✓

### I-09: Sticky-error semantics in pushStepResult are not the mechanism for the all-skip path

After `commitRound` sets `state.error = null` (for all-skip), subsequent steps
(regression-gate, conformance, pr-create) call `pushStepResult`, which spreads `state.error`
unchanged (`{ ...state, steps: {...} }`). Since `state.error` is already null, the sticky
mechanism is inert for the all-skip path. The terminal seam no longer checks `state.error` for
ROUND_ALL_MEMBERS_SKIPPED — the path is unconditionally `awaiting-archive`. ✓

### I-10: No ROUND_ALL_MEMBERS_SKIPPED production code reference outside helpers.ts comment

Grep of `src/` for `ROUND_ALL_MEMBERS_SKIPPED` yields exactly two files:
`src/state/helpers.ts` (comment only) and
`src/core/pipeline/__tests__/parallel-review-round-canon.test.ts` (test commentary / seed value).
No production runtime path checks or sets this code. ✓ (See finding F-01 for the comment issue.)

---

## Finding

### F-01: Stale comment in `src/state/helpers.ts` names a removed terminal invariant

**Severity**: medium | **Resolution**: fixable

**File**: `src/state/helpers.ts` **Line**: 123

`pushStepResult` carries a NOTE comment at lines 122–126:

```
* "sticky" behaviour to detect ROUND_ALL_MEMBERS_SKIPPED at the end-of-pipeline
* check (the error set by commitRound is still present after regression-gate /
* conformance / pr-create succeed).
```

This comment explicitly names `ROUND_ALL_MEMBERS_SKIPPED` as the reason the sticky-error behavior
is intentional. D4 of this change removes the terminal seam (`if (state.error?.code ===
"ROUND_ALL_MEMBERS_SKIPPED")`) from pipeline.ts. The sticky mechanism is no longer needed for
this purpose, yet the comment still declares it as the rationale.

**Why this is a cross-boundary invariant issue**: the comment documents a cross-file contract
(`helpers.ts` → `pipeline.ts`) that no longer exists. TC-016 and TC-017 guard pipeline.ts and
reviewer-chain.ts against the string reappearing, but `helpers.ts` is not in scope of those
tests. A future maintainer reading only `helpers.ts` could:

1. Believe `ROUND_ALL_MEMBERS_SKIPPED` detection is still active in pipeline.ts and work around it.
2. Mistakenly conclude that removing the sticky behavior would break that detection (prompting
   incorrect change).
3. Interpret TC-016 (which enforces the absence of the string from pipeline.ts) as a conflict
   with the "intentional" claim in the comment, leading to confusion.

**Fix**: update the comment to remove the ROUND_ALL_MEMBERS_SKIPPED rationale. The sticky
behavior may still be relevant for other error codes (e.g., ROUND_HEAD_ADVANCED causes the
pipeline to escalate before pushStepResult is called, so the sticky path is not exercised), but
the comment's only named use case is now gone. A minimal fix:

```typescript
// NOTE (state.error sticky semantics): `state.error` is NOT automatically cleared
// when this function records a successful step. The returned state is constructed
// via `{ ...state, steps: {...}, updatedAt: ... }`, which spreads the existing
// `state.error` field unchanged. Callers that need to clear `state.error`
// must do so explicitly by spreading `{ error: null }` into the returned state.
```

---

## Summary

| ID  | File | Line | Severity | Resolution |
|-----|------|------|----------|------------|
| F-01 | src/state/helpers.ts | 123 | medium | fixable |

All other cross-boundary invariants (I-01 through I-10) verified clean. The four-point change
(aggregateVerdict / roundError removal / terminal seam / reviewer-chain routing) is internally
consistent and does not break adjacent mechanisms.

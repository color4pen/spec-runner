# Cross-Boundary Invariants Review — round-all-skip-pass-through — iteration 2

## Scope

`git diff main...HEAD --stat` shows 5 production source files changed, 3 test files changed,
plus change-folder artifacts (including `implementation-notes.md` added since iteration 1).

Iteration 2 focus: (a) verify iteration 1's F-01 finding is resolved, (b) examine paths not
covered in iteration 1 — specifically the `inspectionEscalated` × `allMembersSkipped` interaction
in the worktree-inspection branch (step 7b), `aggregateVerdictResult` overwrite ordering, and
lifecycle of `reviewerStatuses` across multiple rounds.

---

## Checked Invariants

### I-01: F-01 from iteration 1 is resolved

`src/state/helpers.ts` comment no longer names `ROUND_ALL_MEMBERS_SKIPPED` as the rationale for
sticky-error behavior. Diff confirms the comment was updated:

```
- "sticky" behaviour to detect ROUND_ALL_MEMBERS_SKIPPED at the end-of-pipeline check
+ error codes such as ROUND_NONDECLARED_CHANGE set by commitRound remain present after later steps
```

F-01 is fixed. ✓

### I-02: Step-order correctness — worktree inspection can override all-skip approved

Execution order in `parallel-review-round.ts`:

- Step 7 (`aggregateVerdict`, guarded by `!inspectionEscalated`): sets `aggregateVerdictResult =
  "approved"` for all-skip when HEAD guard (5b) has not fired.
- Step 7a (`allMembersSkipped` flag): computed after step 7.
- Step 7b (worktree inspection): if `inspection.kind === "unavailable"` OR `offending.length > 0`,
  sets `aggregateVerdictResult = "escalation"` and `inspectionEscalated = true`, overwriting
  the "approved" from step 7.
- Step 7c (`applyRoundResults` guard): `if (!inspectionEscalated && !allMembersSkipped)` — both
  flags must be false for `applyRoundResults` to run.
- Diagnostic: `if (allMembersSkipped && !inspectionEscalated)` — only emitted when inspection OK.

When inspection fails AND all members skipped:
- `aggregateVerdictResult` is overwritten to "escalation" (step 7b wins).
- `applyRoundResults` is suppressed (guard uses `inspectionEscalated` as primary blocker).
- `roundError` is set to `ROUND_INSPECTION_UNAVAILABLE` or `ROUND_NONDECLARED_CHANGE`.
- Coordinator returns "escalation" → pipeline stops.

The structural-skip pass-through cannot fire when inspection finds an anomaly. ✓

### I-03: `aggregateVerdictResult` initialization and all three escalation paths

`aggregateVerdictResult` is initialized to `"escalation"` at line 215. In the `else` branch
(pending members exist), it is overwritten:

1. HEAD guard (5b): `aggregateVerdictResult = "escalation"`, `inspectionEscalated = true` →
   step 7 guard prevents overwrite.
2. Step 7 (all-skip): `aggregateVerdict(["skipped"...])` returns `"approved"` → overwrites initial "escalation".
3. Step 7b (inspection failure): `aggregateVerdictResult = "escalation"` → overwrites step 7's "approved".

Correct priority: HEAD guard > inspection failure > member verdicts. ✓

### I-04: `memberVerdicts.size === 0` cannot falsely set `allMembersSkipped = true`

```typescript
const allMembersSkipped =
  memberVerdicts.size > 0 && [...memberVerdicts.values()].every((v) => v === "skipped");
```

`memberVerdicts` is populated for every member in `pending`: fulfilled → `verdictOfResult(result.value)`;
rejected → hardcoded `"escalation"`. So `memberVerdicts.size === pending.length`. If `pending.length > 0`
(else branch), `memberVerdicts.size > 0` always holds. The `size > 0` guard prevents the empty-verdict
degenerate case from triggering all-skip. ✓

### I-05: Partial-skip scenario — `applyRoundResults` still processes "skipped" verdict members

When NOT all members skip (e.g., 1 skip + 1 approved), `allMembersSkipped = false`:
- `applyRoundResults` IS called.
- The skipped member receives `status: "skipped"` in `reviewerStatuses`.
- `selectPendingMembers` permanently excludes it (line 155: `if (status === "skipped") return false`).

This is unchanged behavior. The D3 guard's `allMembersSkipped` condition specifically exempts
the all-skip case from this permanent exclusion; the partial-skip case is unaffected. ✓

### I-06: All-skip → subsequent round re-evaluates all members (no free-pass accumulation)

After an all-skip round, all members stay `"pending"` in `reviewerStatuses`. On the next coordinator
execution:
- `deriveReviewerStatuses` reads the persisted `reviewerStatuses` (all "pending").
- `selectPendingMembers` returns all members.
- Fan-out re-runs; activation gate is re-evaluated with the current diff.

No drift or accumulation: each round is independently evaluated. The pipeline does not re-enter the
coordinator after the all-skip approved path (coordinator → regression-gate → conformance → pr-create
→ end), so there is no looping concern. ✓

### I-07: `codeReviewLoopActive` correctly reflects coordinator execution after all-skip

```typescript
export function codeReviewLoopActive(state: JobState, coordinatorName: string): boolean {
  const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
  if (coordinatorRuns.length > 0) return false;
  ...
}
```

After the all-skip round, `commitRound` appends a coordinator StepRun with `verdict: "approved"` to
`state.steps[coordinatorName]`. So `coordinatorRuns.length > 0` → `codeReviewLoopActive` returns
false. If a code-fixer were subsequently running (triggered by something other than the coordinator),
it would not re-route to code-review. ✓

### I-08: Diagnostic log-only path for all-skip does not accidentally set roundError

`parallel-review-round.ts` (new code):

```typescript
if (allMembersSkipped && !inspectionEscalated) {
  logPipelineDiag(
    "pipeline:coordinator:all-members-skipped",
    `coordinator=${coordinatorName}, members=[${[...memberVerdicts.keys()].join(",")}]`,
  );
}
```

No `roundError` assignment in this block. The previous code had the `roundError = { code: "ROUND_ALL_MEMBERS_SKIPPED" ... }` here; it has been removed. The diagnostic log is observability-only. ✓

### I-09: `on: "skipped"` coordinator transition row — pre-existing dead code, not introduced here

`reviewer-chain.ts` retains:

```typescript
// skipped → regression-gate (skipped coordinator = structural pass-through)
transitions.push({ step: coordinator, on: "skipped", to: REGRESSION_GATE_STEP_NAME });
```

The git diff shows this row was pre-existing (only the comment changed). `ParallelReviewRound.run()`
return type is `Promise<{ outcome: "approved" | "needs-fix" | "escalation" }>` — "skipped" is not
in the return type. The coordinator cannot produce "skipped" via the current execution paths.
This row cannot fire and is dead code. The comment update ("structural pass-through") is benign.
No new invariant is at risk from this pre-existing condition. ✓

### I-10: `syntheticRun.outcome.error` correctly null for all-skip

```typescript
const syntheticRun: StepRun = {
  outcome: {
    verdict: aggregateVerdictResult,
    findingsPath: null,
    error: aggregateVerdictResult === "escalation" ? roundError : null,
  },
  ...
};
```

For all-skip: `aggregateVerdictResult = "approved"` → `error: null`. The coordinator's journal
record shows `verdict: "approved"` and `error: null`. TC-038 verifies this. ✓

### I-11: `helpers.ts` sticky-error note accurately scoped to surviving use case

With `ROUND_ALL_MEMBERS_SKIPPED` removed from the sticky rationale, the comment now cites
`ROUND_NONDECLARED_CHANGE`. Verifying this is accurate:

`ROUND_NONDECLARED_CHANGE` is set by `commitRound` (step 7b) and causes `aggregateVerdictResult =
"escalation"`. The coordinator returns "escalation" → no `on: "escalation"` coordinator row →
`nextStep = "escalate"` → pipeline stops immediately at `awaiting-resume`. Subsequent steps
(regression-gate, conformance) do NOT run in this case. So the "sticky through later steps"
scenario for `ROUND_NONDECLARED_CHANGE` does not actually occur in the current pipeline.

The comment's claim that `ROUND_NONDECLARED_CHANGE` "remains present after later steps so the
end-of-pipeline check can act on them" is inaccurate — these later steps never run when
ROUND_NONDECLARED_CHANGE is set. However, the broader intent of the comment (documenting that
`pushStepResult` does not clear `state.error`) remains valid. This is a documentation imprecision,
not a runtime invariant violation.

**Severity**: low. The sticky-error mechanism works correctly; only the example use case cited
in the comment does not match the actual runtime path. No cross-file contract is broken.

---

## Findings

### F-01-resolved: Stale `helpers.ts` comment (iteration 1) — fixed

The `ROUND_ALL_MEMBERS_SKIPPED` reference has been removed. Finding is resolved. ✓

### F-02: `helpers.ts` sticky-error comment cites a use case that does not occur at runtime

**Severity**: low | **Resolution**: fixable

**File**: `src/state/helpers.ts` **Line**: 122

The updated comment says:
> "error codes such as ROUND_NONDECLARED_CHANGE set by commitRound remain present after later steps
> (regression-gate / conformance / pr-create) so the end-of-pipeline check can act on them."

This is inaccurate: `ROUND_NONDECLARED_CHANGE` causes the coordinator to return "escalation" with
no matching coordinator-escalation transition row → `nextStep = "escalate"` → pipeline stops at
`awaiting-resume` immediately. Regression-gate, conformance, and pr-create do NOT run in this path.

The mechanism described (sticky error persisting through later steps) was the mechanism for the
now-removed `ROUND_ALL_MEMBERS_SKIPPED` behavior. No current error code exercises the "persists
through later pipeline steps to terminal seam" path.

The sticky-error invariant itself (`pushStepResult` spreads `state.error` unchanged) is real and
correctly documented; only the example is misleading. A reader could incorrectly conclude that
`state.error` in regression-gate / conformance carries a meaningful coordinator error for routing
decisions.

**Fix** (minimal): remove the "so the end-of-pipeline check can act on them" clause and the example
citation. The sticky mechanism remains documented as a caution for callers:

```typescript
// NOTE (state.error sticky semantics): `state.error` is NOT automatically cleared
// when this function records a successful step. The returned state is constructed
// via `{ ...state, steps: {...}, updatedAt: ... }`, which spreads the existing
// `state.error` field unchanged. If a prior step set `state.error`, that value
// persists across subsequent pushStepResult calls even when those steps succeed.
// Callers that need to clear `state.error` must do so explicitly by spreading
// `{ error: null }` into the returned state.
```

---

## Summary

| ID  | File | Line | Severity | Resolution | Status |
|-----|------|------|----------|------------|--------|
| F-01 | src/state/helpers.ts | 123 | medium | fixable | **Resolved** (iteration 1 finding) |
| F-02 | src/state/helpers.ts | 122 | low | fixable | New (iteration 2) |

Cross-boundary invariants I-01 through I-11 verified clean. The four-point structural change
(aggregateVerdict / roundError removal / terminal seam / reviewer-chain routing) is internally
consistent. Worktree inspection escalation correctly overrides all-skip approved. No new
invariant violations found beyond the low-severity documentation imprecision in F-02.

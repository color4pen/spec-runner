# Design: resume-from-correct-loop-step

## Problem Statement

`resolveResumeStep` uses only `resumePoint` (step + iterationsExhausted) to decide the resume target. When the user kills the process after code-review emits `needs-fix` but before code-fixer starts, the pipeline's safety-net handler records `resumePoint.step = "code-fixer"` (the current `state.step` at kill time) with `iterationsExhausted = 0`. The resolution logic interprets this as "code-fixer crashed → restart code-fixer", but code-fixer never ran — the user's intent is to re-run code-review.

### Root Cause

Two-fold:

1. **`pipeline.ts` safety-net** (line 100): records `resumePoint.step = finalState.step`, which has already transitioned to the next step (fixer) via the transition table update to `state.step` that happens between step execution and the actual fixer invocation.

2. **`resolveResumeStep` logic**: Tier 2 sees `resumePoint.step = "code-fixer"` (not in REVIEWER_STEPS) + `iterationsExhausted = 0` → returns `resumePoint.step` (code-fixer). No cross-reference with `state.steps` to detect that code-fixer never actually executed.

### Observable Scenario (Issue #236)

```
state.steps["code-review"] = [{ outcome: { verdict: "needs-fix" } }]
state.steps["code-fixer"] = []  (or absent)
resumePoint.step = "code-fixer"
resumePoint.iterationsExhausted = 0
```

Current: resumes from `code-fixer`.
Expected: resumes from `code-review`.

## Design Decisions

### D1: Add `state.steps` inspection to `resolveResumeStep`

Extend the function signature to accept `state.steps` (optional, for backward compat). When `--from` is not specified and `resumePoint` is present:

**New rule (inserted before existing Tier 2 logic):**
If `resumePoint.step` is a fixer step AND `state.steps[resumePoint.step]` is empty/absent, look at the paired loop step. If that loop step's latest verdict is `needs-fix` (or `failed` for verification), resume from the loop step instead.

This precisely handles the #236 scenario without changing the behavior for cases where the fixer actually ran (non-empty `state.steps[fixer]`).

### D2: Keep `--from` as highest-priority override (unchanged)

No change to Tier 1 (`--from` specified). Users can still force `--from fixer` to bypass the new logic.

### D3: Paired fixer detection via STANDARD_LOOP_FIXER_PAIRS

Import the fixer pairs mapping (already exported from `src/core/pipeline/run.ts`) to build a reverse lookup: fixer → loop step. This avoids hardcoding the pairs in resolve-step.ts.

### D4: Loop iter counter restoration on resume

Currently, `pipeline.runInternal` initializes `loopIters` and `fixerIters` as empty Maps. When resuming from a loop step, the counters start at 0, which means the first execution after resume counts as iter 1 — this is actually correct because the user wants a fresh review pass. No change needed here.

However, we should verify that resuming from a loop step that already has N entries in `state.steps[loopStep]` doesn't cause the `maxIterations` guard to fire prematurely. The guard compares `loopIters` (runtime counter, starts at 0) against `maxIterations`, so it will allow up to `maxIterations` fresh iterations per resume session. This is the desired behavior — each resume session gets a full budget.

### D5: Generalization to all loop steps

The new rule in D1 covers all three loop/fixer pairs:
- `code-fixer` empty + `code-review` last verdict = `needs-fix` → resume from `code-review`
- `spec-fixer` empty + `spec-review` last verdict = `needs-fix` → resume from `spec-review`
- `build-fixer` empty + `verification` last verdict = `failed` → resume from `verification`

### D6: New delta spec for `cli-resume-command`

Create a new capability spec `cli-resume-command` documenting the resume step resolution behavior, including the new default and `--from` override semantics.

## Approach

### File Changes

| File | Change |
|------|--------|
| `src/core/resume/resolve-step.ts` | Add `steps` parameter; implement D1 fixer-empty detection |
| `src/core/command/resume.ts` | Pass `state.steps` to `resolveResumeStep` |
| `tests/unit/core/resume/resolve-step.test.ts` | Add test cases for new behavior |

### New Files

| File | Purpose |
|------|---------|
| `specrunner/specs/cli-resume-command/spec.md` | Delta spec for resume command capability |

## Risks & Mitigations

- **Risk**: Existing tests for T4.1 (crash → restart from same step) pass `iterationsExhausted=0` with reviewer steps. These remain correct because the new rule only applies when `resumePoint.step` is a **fixer** step with empty `state.steps[fixer]`.
- **Risk**: State files missing `steps` field (legacy). Mitigated by making `steps` parameter optional — when absent, falls through to existing logic.

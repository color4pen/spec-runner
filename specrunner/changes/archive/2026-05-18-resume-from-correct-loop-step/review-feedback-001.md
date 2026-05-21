# Review Feedback

- **iteration**: 1
- **reviewer**: code-reviewer
- **date**: 2026-05-18
- **verdict**: needs-fix

## Summary

The core logic fix in `resolve-step.ts` and the `resume.ts` caller update are correct and precisely address issue #236. The `FIXER_TO_LOOP` reverse-map approach is clean and correctly covers all 4 pairs (including `delta-spec-fixer`). However, the integration test required by TC-13 (must priority) is absent, and the `steps` type parameter uses an inline type instead of the canonical `StepRun` from schema.ts, which is a type safety gap.

## Findings

### [MAJOR] TC-13 integration test missing (must priority)

**File**: `tests/` (no file)
**Issue**: test-cases.md TC-13 is marked **must** — "Integration: code-review needs-fix → kill → resume → completion". This scenario is the exact bug reproduction (#236) and no integration-level test covers it. The unit tests verify `resolveResumeStep` in isolation, but there is no test that constructs a fake job state with `resumePoint.step = "code-fixer"`, `state.steps["code-fixer"] = []`, and `state.steps["code-review"] = [{ outcome: { verdict: "needs-fix" } }]`, then drives `ResumeCommand.prepare()` to confirm `startStep = "code-review"`. The acceptance criteria in request.md also require this reproduction.
**Suggestion**: Add a test in `tests/unit/cli/resume.test.ts` (following existing TC-RESUME-005/006 patterns) that constructs the exact #236 state and asserts `startStep === "code-review"`. A full e2e pipeline run is not needed — mocking the pipeline start and checking the resolved step is sufficient to cover TC-13's intent.

### [MINOR] `steps` parameter type uses inline shape instead of `StepRun`

**File**: `src/core/resume/resolve-step.ts:95`
**Issue**: The 4th parameter is typed `Record<string, { outcome: { verdict: string | null } }[]>`. The canonical type is `Record<string, StepRun[]>` from `src/state/schema.ts`. The inline type accepts `verdict: string | null` where `StepRun.outcome.verdict` is `Verdict | null` (a union of 7 known literals). This means a caller passing an invalid verdict string (e.g. `"unknown"`) would not get a TypeScript error. In practice callers only pass `state.steps` (which is `Record<string, StepRun[]>`), so there is no runtime risk, but it weakens the contract.
**Suggestion**: Import `StepRun` from `../../state/schema.js` and use `Record<string, StepRun[]>` as the parameter type. This was also flagged in spec-review F3.

### [MINOR] `delta-spec-fixer` pair covered by implementation but not tested

**File**: `tests/unit/core/resume/resolve-step.test.ts`
**Issue**: `STANDARD_LOOP_FIXER_PAIRS` contains a 4th pair (`delta-spec-validation → delta-spec-fixer`), so `FIXER_TO_LOOP` includes `delta-spec-fixer → delta-spec-validation`. The implementation handles it automatically, but there is no test case covering `resumePoint.step = "delta-spec-fixer"` with empty steps and `delta-spec-validation` verdict = `"needs-fix"`. The spec-review result (F2) flagged this as informational, but it is a behavioral gap in test coverage.
**Suggestion**: Add one test case: `resumePoint=delta-spec-fixer + steps[delta-spec-fixer] empty + steps[delta-spec-validation] needs-fix → delta-spec-validation`.

### [NIT] `specrunner/changes/.../specs/cli-resume-command/spec.md` uses `## MODIFIED Requirements`

**File**: `specrunner/changes/resume-from-correct-loop-step/specs/cli-resume-command/spec.md:3`
**Issue**: The delta-spec under `specrunner/changes/` uses `## MODIFIED Requirements` in its header, while `specrunner/specs/cli-resume-command/spec.md` (the canonical location) correctly uses `## Requirements`. The spec-review result (F1) flagged this but it was not fixed.
**Suggestion**: Change `## MODIFIED Requirements` to `## ADDED Requirements` (or `## Requirements`) in the delta-spec file to accurately reflect that this is a newly added capability, not a modification of an existing one.

## Test Coverage

**Must scenarios covered**: TC-01 through TC-07 (7/7), TC-11 (covered in existing CLI test `TC-RESUME-005`), TC-12 (code inspection), TC-16 (spec exists in correct location).

**Must scenarios missing**:
- TC-13: Integration test for the exact #236 bug scenario end-to-end through `ResumeCommand.prepare()`. This is the most important coverage gap — it would demonstrate the fix works at the command layer where `state.steps` is actually sourced from the loaded job state.

**Should scenarios**: TC-08 (both empty), TC-09 (reviewer exhaustion — covered by existing T4.2), TC-10 (--from critic — covered by existing T4.4), TC-14, TC-15 — not covered, but these are `should` priority.

**Existing tests**: No regressions. All T4.1–T4.4 suites pass unchanged (confirmed by verification-result.md: 2053 tests passed).

## Spec Compliance

**Correct**: The canonical `specrunner/specs/cli-resume-command/spec.md` documents all required behaviors: fixer-empty mismatch, fixer-ran crash restart, reviewer exhaustion, --from override, and resumePoint=null rejection. The `## Requirements` header (not `## MODIFIED`) is correct. Spec authority requirement is satisfied.

**Correct**: D1–D6 all implemented. D3 (FIXER_TO_LOOP reverse map) cleanly handles all 4 pairs. D2 (--from as highest priority) unchanged. D5 (generalization) works for all 4 pairs.

**Gap**: The `steps` type using an inline shape instead of `StepRun` (see MINOR finding above) slightly weakens the spec-contract alignment with the schema layer.

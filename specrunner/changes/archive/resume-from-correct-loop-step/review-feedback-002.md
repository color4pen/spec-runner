# Code Review — resume-from-correct-loop-step (Iteration 2)

## Summary

The implementation correctly addresses Issue #236 by adding fixer-empty detection in `resolveResumeStep`. The core logic, type safety, and `--from` override priority are all correct. Test coverage is comprehensive and the delta spec is present and well-formed.

## Findings

### [info] FIXER_TO_LOOP covers delta-spec-fixer pair via STANDARD_LOOP_FIXER_PAIRS
**File**: `src/core/resume/resolve-step.ts:22-24`
**Description**: `STANDARD_LOOP_FIXER_PAIRS` includes `delta-spec-validation → delta-spec-fixer`, so `FIXER_TO_LOOP` correctly includes `delta-spec-fixer → delta-spec-validation`. The test at line 247 of `resolve-step.test.ts` confirms this pair is covered. This is a positive finding — the reverse-map construction generalizes automatically to future pairs.
**Suggestion**: No action needed.

### [info] `steps` parameter type is `Record<string, StepRun[]>` — matches `JobState.steps` exactly
**File**: `src/core/resume/resolve-step.ts:95`
**Description**: `JobState.steps` is declared as `Record<string, StepRun[]> | undefined`, and the function parameter is `steps?: Record<string, StepRun[]>`. The call in `resume.ts:158` passes `state.steps` directly. TypeScript will accept `undefined` for an optional parameter, so the legacy/absent case is handled without unsafe casts.
**Suggestion**: No action needed.

### [info] `resume.ts` passes `state.steps` which may be `undefined` for legacy v1 state files
**File**: `src/core/command/resume.ts:158`
**Description**: `JobState.steps` is `Record<string, StepRun[]> | undefined` (optional in schema). When `state.steps` is `undefined` (legacy v1 files), `resolveResumeStep` receives `undefined` as the 4th argument and correctly falls through to existing Tier 2b logic. This matches the design intent in D1 (backward compat).
**Suggestion**: No action needed.

### [info] TC-08 (fixer-empty + loop step also empty → fixer) is not explicitly tested in the unit suite
**File**: `tests/unit/core/resume/resolve-step.test.ts`
**Description**: test-cases.md TC-08 ("fixer-empty AND loop step also has 0 runs → fixer") is listed as `should` priority. The implementation handles this via `lastLoopRun !== undefined ? ... : null` at line 121 of `resolve-step.ts`, with `null` not matching `needs-fix`/`failed` and thus falling through to `return resumePoint.step`. TC-08 is not represented in the current test file, though it is a `should` (not `must`) scenario.
**Suggestion**: Low-priority addition for completeness if desired in a follow-up.

### [info] Spec file duplicated under two paths
**File**: `specrunner/specs/cli-resume-command/spec.md` (worktree) and `specrunner/changes/resume-from-correct-loop-step/` dir also has `specrunner/specs/cli-resume-command/spec.md` via the diff
**Description**: The diff stat shows both `specrunner/specs/cli-resume-command/spec.md` (65 lines) and `.../resume-from-correct-loop-step/request.md` with a duplicate path prefix. Inspecting the diff, the spec file exists at `specrunner/specs/cli-resume-command/spec.md` — the correct canonical location per D6. No duplication issue in the filesystem.
**Suggestion**: No action needed.

## Test Coverage

Coverage analysis against test-cases.md must scenarios:

| TC | Priority | Scenario | Covered |
|----|----------|----------|---------|
| TC-01 | must | code-review needs-fix → code-review | Yes — `resolve-step.test.ts` line 193 |
| TC-02 | must | spec-review needs-fix → spec-review | Yes — line 201 |
| TC-03 | must | verification failed → verification | Yes — line 209 |
| TC-04 | must | code-fixer non-empty → code-fixer (regression) | Yes — line 217 |
| TC-05 | must | `--from fixer` override → code-fixer | Yes — line 226 |
| TC-06 | must | steps=undefined → legacy path → code-fixer | Yes — line 234 |
| TC-07 | must | code-review approved → no mismatch → code-fixer | Yes — line 239 |
| TC-08 | should | fixer-empty + loop empty → fixer | Not in unit suite; logic correct in implementation |
| TC-09 | should | iterationsExhausted > 0 on reviewer → fixer | Yes — existing T4.2 tests |
| TC-10 | should | `--from critic` → code-review | Yes — T4.4 tests |
| TC-11 | must | resumePoint null + no --from → exit 1 | Yes — TC-RESUME-005 in resume.test.ts |
| TC-12 | must | state.steps passed to resolveResumeStep | Yes — resume.ts:158 static + TC-RESUME-013 |
| TC-13 | must | Issue #236 e2e reproduction | Yes — TC-RESUME-013 in resume.test.ts line 316 |
| TC-16 | must | cli-resume-command/spec.md exists with all required scenarios | Yes — spec.md present and complete |

All `must` test cases are covered. TC-08 (`should`) is the only gap, and the implementation handles it correctly even without an explicit test.

## Verdict
- **verdict**: approved

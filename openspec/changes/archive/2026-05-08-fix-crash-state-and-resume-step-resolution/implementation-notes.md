# Implementation Notes: fix-crash-state-and-resume-step-resolution

- **result**: completed
- **tasks_completed**: 12/12

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/core/pipeline/pipeline.ts` | modified | T1.1: Added `else` branch in `runInternal()` catch to call `store.fail()` when executor throws without `.state`. T1.2: Changed `const finalState` → `let finalState` in `run()` catch; added `running → awaiting-resume` fallback with `store.persist()`. |
| `src/core/resume/resolve-step.ts` | modified | T2.1: Added `REVIEWER_STEPS` constant. T2.2: Rewrote `resolveResumeStep()` with 3-branch logic: `--from` specified (role-based), `from=undefined + resumePoint` (crash vs exhaustion), `from=undefined + null resumePoint` (fallback). |
| `tests/unit/core/pipeline/pipeline.crash-state.test.ts` | created | T3.1/T3.2: Pipeline catch safety net tests — plain Error throw → `awaiting-resume` with `UNEXPECTED_STEP_ERROR`; unknown step → `PIPELINE_UNHANDLED_ERROR`. |
| `tests/unit/core/resume/resolve-step.test.ts` | modified | T4.1-T4.4: Added 17 new test cases covering crash restart, review exhaustion fixer, non-reviewer crash, and `--from` priority. |
| `openspec/changes/fix-crash-state-and-resume-step-resolution/tasks.md` | modified | All tasks marked `[x]`. |

## Blocked Tasks

None.

## Test Results

- `bun run typecheck`: green (no errors)
- `bun run test`: 118 files, 1099 tests — all pass
- New tests added: 12 (pipeline crash) + 17 (resolve-step) = 29 tests

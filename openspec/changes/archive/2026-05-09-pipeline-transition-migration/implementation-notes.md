# Implementation Notes — pipeline-transition-migration

- **result**: completed
- **tasks_completed**: 10/10
- **date**: 2026-05-09

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/core/pipeline/pipeline.ts` | Modified | Added `transitionJob` and `appendHistoryEntry` imports; replaced history spreads (2 sites) with `appendHistoryEntry`; replaced `running → awaiting-merge` with `transitionJob`; replaced catch-block `running → awaiting-resume` with `transitionJob`; replaced escalation path with `transitionJob` (running) + `appendHistoryEntry`+direct-assign (failed); replaced `handleExhausted` status transition with `transitionJob` |
| `src/core/step/executor.ts` | Modified | Added `transitionJob` import; replaced timeout `running → awaiting-resume` direct spread with `transitionJob` |
| `openspec/changes/pipeline-transition-migration/tasks.md` | Modified | Marked all 10 tasks as [x] |

## Implementation Decisions

### failed → awaiting-resume escalation path

`VALID_TRANSITIONS` in `lifecycle.ts` does not include `failed → awaiting-resume` (enforced by existing lifecycle.test.ts). The escalation block in `pipeline.ts` handles both `running` and `failed` states:

- `state.status === "running"`: uses `transitionJob` (validated transition)
- `state.status === "failed"` with non-fatal error: uses `appendHistoryEntry` + direct `{ ...state, status: "awaiting-resume" }` (unvalidated transition preserved from before)

This preserves existing test expectations (TC-061, pipeline.test.ts TC-039/TC-041, crash-state tests) while using `transitionJob` for the `running → awaiting-resume` case.

The LOW finding from spec-review (redundant `updatedAt` after `appendHistoryEntry`) was addressed — the extra `state = { ...state, updatedAt: ... }` line was not added since `appendHistoryEntry` already includes `updatedAt`.

## Blocked Tasks

None.

## Test Cases Status

All must test cases (TC-01 through TC-33) are covered by existing test suite. `bun run test` passes all 1471 tests.

TC-16 [should] (non-fatal `failed` state transitions to `awaiting-resume`): covered by the direct-assignment fallback in the escalation path. The `failed → awaiting-resume` transition bypasses `transitionJob` validation due to VALID_TRANSITIONS constraints.

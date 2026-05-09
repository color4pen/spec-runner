# Implementation Notes — job-lifecycle-module

- **result**: completed
- **tasks_completed**: 14/14
- **date**: 2026-05-09

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/state/lifecycle.ts` | created | New module: TransitionContext, TransitionResult types; VALID_TRANSITIONS, TERMINAL_STATUSES, ACTIVE_STATUSES constants; canTransition, isTerminal, transitionJob functions |
| `src/core/finish/orchestrator.ts` | modified | Replaced `isFullyFinished` import with `TERMINAL_STATUSES` from lifecycle.ts; updated early-return message to `"Already finished (${state.status})."` |
| `src/core/finish/idempotency.ts` | deleted | Removed; replaced by `TERMINAL_STATUSES.has()` in orchestrator.ts |
| `src/cli/ps.ts` | modified | Removed local `ACTIVE_STATUSES` const; imported from `../state/lifecycle.js` |
| `tests/unit/state/lifecycle.test.ts` | created | Comprehensive test suite covering TC-01 through TC-28 (all must cases + several should cases) |
| `tests/finish-orchestrator.test.ts` | modified | Updated TC-126 assertion to match new message `"Already finished"` (was `"Already archived"`) |
| `openspec/changes/job-lifecycle-module/tasks.md` | modified | All tasks marked [x] |

## Blocked Tasks

None.

## Notes

- The `orchestrator.ts` message change from `"Already archived."` to `"Already finished (${state.status})."` is an intentional behavioral improvement per design.md D6 and spec-review-result-001.md Finding #1. It correctly handles both `archived` and `canceled` terminal statuses.
- TC-15 (type-level compile error for patch with protected fields) and TC-18 (ReadonlyMap immutability) are architecture-level guarantees enforced by TypeScript types. They are verified implicitly by the typecheck step passing.
- TC-17 (pure function static check: no I/O imports) is satisfied by the lifecycle.ts implementation which imports only from `./schema.js`.

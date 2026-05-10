# Implementation Notes: propose-openspec-cli-and-step-model-config

## Result

- **result**: completed
- **tasks_completed**: 10/10

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/step/types.ts` | MODIFIED | Added `maxTurns?: number` optional field to `AgentStep` interface |
| `src/adapter/claude-code/agent-runner.ts` | MODIFIED | Changed `maxTurns: 30` hardcode to `step.maxTurns ?? 30` |
| `src/core/step/propose.ts` | MODIFIED | Model changed to `claude-opus-4-6[1m]`, added `maxTurns: 20` |
| `src/core/step/spec-review.ts` | MODIFIED | Model changed to `claude-opus-4-6[1m]`, added `maxTurns: 15` |
| `src/core/step/code-review.ts` | MODIFIED | Model changed to `claude-opus-4-6[1m]`, added `maxTurns: 20` |
| `src/core/step/spec-fixer.ts` | MODIFIED | Model changed to `claude-sonnet-4-6`, added `maxTurns: 25` |
| `src/core/step/implementer.ts` | MODIFIED | Model changed to `claude-sonnet-4-6`, added `maxTurns: 60` |
| `src/core/step/build-fixer.ts` | MODIFIED | Model changed to `claude-sonnet-4-6`, added `maxTurns: 35` |
| `src/core/step/code-fixer.ts` | MODIFIED | Model changed to `claude-sonnet-4-6`, added `maxTurns: 30` |
| `src/prompts/propose-system.ts` | MODIFIED | PROPOSE_SYSTEM_PROMPT rewritten to include openspec CLI workflow (new change → status --json → instructions --json → artifact generation loop). Path-fence, completion conditions, and security sections maintained. |
| `openspec/changes/propose-openspec-cli-and-step-model-config/tasks.md` | MODIFIED | All tasks marked [x] |
| `tests/unit/step/step-model-maxturn-config.test.ts` | CREATED | New test file for TC-001/TC-004/TC-005/TC-006 (AgentStep maxTurns field, model values, per-step maxTurns values) |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | MODIFIED | Added TC-002/TC-003: step.maxTurns=undefined → default 30, step.maxTurns=60 → 60 passed to query() |
| `tests/prompts/propose-system.test.ts` | MODIFIED | Added TC-007/TC-008/TC-009 (openspec new change / status --json / instructions), TC-010/TC-011/TC-012 (path-fence, completion conditions, slug/branch injection) |
| `tests/unit/step/code-review.test.ts` | MODIFIED | Updated model assertion from `claude-sonnet-4-5` to `claude-opus-4-6[1m]` |
| `tests/unit/step/implementer.test.ts` | MODIFIED | Updated model assertion from `claude-sonnet-4-5` to `claude-sonnet-4-6` |
| `tests/unit/step/build-fixer.test.ts` | MODIFIED | Updated model assertion from `claude-sonnet-4-5` to `claude-sonnet-4-6` |
| `tests/unit/step/code-fixer.test.ts` | MODIFIED | Updated model assertion from `claude-sonnet-4-5` to `claude-sonnet-4-6` |
| `openspec-workflow/requests/active/propose-openspec-cli-and-step-model-config/decisions/implementer.md` | CREATED | Implementation decision log |

## Test Results

- `bun run typecheck`: 0 errors
- `bun run test`: 854/854 tests passed (102 test files)
- `openspec validate propose-openspec-cli-and-step-model-config --type change --strict`: pass

## Must Test Cases Coverage

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-001 | must | implemented | `step-model-maxturn-config.test.ts` |
| TC-002 | must | implemented | `agent-runner.test.ts` |
| TC-003 | must | implemented | `agent-runner.test.ts` |
| TC-004 | must | implemented | `step-model-maxturn-config.test.ts` |
| TC-005 | must | implemented | `step-model-maxturn-config.test.ts` |
| TC-006 | must | implemented | `step-model-maxturn-config.test.ts` |
| TC-007 | must | implemented | `propose-system.test.ts` |
| TC-008 | must | implemented | `propose-system.test.ts` |
| TC-009 | must | implemented | `propose-system.test.ts` |
| TC-010 | must | implemented | `propose-system.test.ts` |
| TC-011 | must | implemented | `propose-system.test.ts` |
| TC-012 | must | implemented | `propose-system.test.ts` |
| TC-013 | must | manual | propose agent delta spec non-omission — requires live run |
| TC-014 | must | manual | openspec CLI Bash calls in agent logs — requires live run |

## Blocked Tasks

None. All 10 tasks completed.

## Manual Tests

TC-013 and TC-014 are manual tests requiring a live propose agent run. These cannot be automated with unit/integration tests.

## Design Decisions

- **D3 implementation**: `maxTurns` added as optional field directly on `AgentStep` interface. `ClaudeCodeRunner` reads `step.maxTurns ?? 30`. Type-safe without casting.
- **spec-review model**: Changed from `claude-sonnet-4-5` to `claude-opus-4-6[1m]`. The `spec-review.test.ts` and `code-review.test.ts` did not have direct model-value assertions before; `agent-definition.test.ts` model assertions were not present for spec-review/code-review.
- **propose system prompt**: Kept all existing path-fence, completion conditions, and security sections intact. Added Step 1/2/3/4 of openspec CLI workflow. Changed role description to reference openspec CLI.
- **Test fixtures**: Tests that use `"claude-sonnet-4-5"` as fixture data (not asserting specific step values) were left unchanged — they are mock/helper data unrelated to production step definitions.

# Implementation Notes — code-review-fixer

## Status

- **result**: completed
- **tasks_completed**: 83/83 (all tasks across all 10 groups)

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/parser/review-verdict.ts` | Created | Shared `parseReviewVerdict(content): Verdict | null` pure function |
| `src/core/step/spec-review.ts` | Modified | `parseSpecReviewVerdict` delegates to `parseReviewVerdict` (1-line wrapper) |
| `src/state/schema.ts` | Modified | `StepName` union extended with `"code-review" | "code-fixer"` |
| `src/prompts/code-review-system.ts` | Created | `CODE_REVIEW_SYSTEM_PROMPT` — read-only reviewer, review-standards.md compliant |
| `src/prompts/code-fixer-system.ts` | Created | `CODE_FIXER_SYSTEM_PROMPT` — HIGH mandatory, MEDIUM conditional, LOW ignored |
| `src/core/step/code-review.ts` | Created | `CodeReviewStep: AgentStep` — result file path, parseResult via shared parser |
| `src/core/step/code-fixer.ts` | Created | `CodeFixerStep: AgentStep` — null result, NULL_PARSE_RESULT, gitWrite, completionVerdict="approved" |
| `src/core/pipeline/types.ts` | Modified | `LOOP_ERROR_CODES` + `CODE_REVIEW_RETRIES_EXHAUSTED` entry; STANDARD_TRANSITIONS with 5 new rows; `verification --passed→ code-review` replaces `--passed→ end` |
| `src/core/pipeline/run.ts` | Modified | Adds code-review / code-fixer to steps Map; loopNames extended to include "code-review" |
| `src/cli/init.ts` | Modified | `AgentRegistry.fromSteps` extended to include CodeReviewStep, CodeFixerStep |
| `tests/unit/parser/review-verdict.test.ts` | Created | TC-018..TC-022, TC-035 — 10 tests |
| `tests/unit/step/code-review.test.ts` | Created | TC-001..TC-005, TC-036 — 18 tests |
| `tests/unit/step/code-fixer.test.ts` | Created | TC-006..TC-010, TC-025..TC-026 — 24 tests |
| `tests/unit/core/pipeline/pipeline.transitions.test.ts` | Modified | TC-011..TC-017, TC-024, TC-029..TC-030 added; TC-012 updated for new transitions |
| `tests/core/pipeline/pipeline.test.ts` | Modified | buildMockPipeline extended with code-review/code-fixer; STANDARD_TRANSITIONS count 14→19 |
| `tests/pipeline-integration.test.ts` | Modified | buildConfig + buildMockGithubClient updated for 7 agents + review-feedback handling |
| `tests/init.test.ts` | Modified | TC-059 / TC-041 updated for 7-agent registry |
| `openspec-workflow/adr/ADR-20260430-code-review-input-source.md` | Created | ADR for D1/D3 decisions |
| `openspec-workflow/adr/ADR-20260430-review-verdict-parser-shared.md` | Created | ADR for D5 decision |
| `openspec-workflow/requests/active/code-review-fixer/decisions/implementer.md` | Created | Implementation decisions log |
| `openspec/changes/code-review-fixer/tasks.md` | Modified | All tasks marked [x] |

## Test Results

- **Total tests**: 432 passed, 0 failed
- **New tests added**: 52 (parser: 10, code-review step: 18, code-fixer step: 24)
- **Must test cases implemented**: 17/17
- **Should test cases implemented**: 12/17 (manual-only cases excluded: TC-033, TC-034, TC-039)
- **TypeCheck**: PASS (tsc --noEmit)

## Blocked Tasks

None. All tasks completed.

## Notes

- `AgentSyncer` and `AgentRegistry` source files (`src/core/agent/`) were NOT modified — task 8.4 verified
- `grep-no-step-name-hardcode.test.ts` continues to PASS — task 7.7 verified
- TC-033 (CODE_REVIEW_SYSTEM_PROMPT manual review) and TC-034 (CODE_FIXER_SYSTEM_PROMPT manual review) are manual-only and excluded from automated test count
- TC-039 (E2E init with real API key) is manual-only per design.md Non-Goals ("E2E 実機検証")
- `StepName` union now includes all 8 steps: propose, spec-review, spec-fixer, implementer, verification, build-fixer, code-review, code-fixer

## Fix History

| Finding | File | Summary |
|---------|------|---------|
| #1 (MEDIUM) | `src/prompts/code-review-system.ts` | Constraints を「source ファイル変更禁止」と「review-feedback の push 必須」に分離。Role 行も `push` 禁止を削除し push 許可を明示 |

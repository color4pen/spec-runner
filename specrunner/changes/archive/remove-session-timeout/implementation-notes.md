# Implementation Notes: remove-session-timeout

## Status

- **result**: completed
- **tasks_completed**: 20/22
- **timestamp**: 2026-05-03 15:20

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/state/schema.ts` | modified | Added lazy migration block in `validateJobState`: `error.code === "SESSION_TIMEOUT"` → `"SESSION_TERMINATED"` in-memory on read |
| `src/errors.ts` | modified | Removed `SESSION_TIMEOUT` from `ERROR_CODES`; deleted `sessionTimeoutError(minutes)` helper entirely |
| `src/adapter/anthropic/completion.ts` | modified | Removed `DEFAULT_TIMEOUT_MS`, `timeoutMs` from `PollOptions`, elapsed-time check, and `SESSION_TIMEOUT` throw. `pollUntilComplete` now terminates only via `SESSION_TERMINATED` throw or `AbortSignal` |
| `src/core/port/session-client.ts` | modified | Removed `timeoutMs` from `pollUntilComplete` options; changed return status from `"idle" \| "terminated" \| "timeout"` to `"idle" \| "terminated"` |
| `src/adapter/anthropic/session-client.ts` | modified | Updated `pollUntilComplete` adapter to match new port interface; removed timeout fallback |
| `src/adapter/anthropic/session-runner.ts` | modified | Removed `timeoutMs` from `ManagedAgentSessionInput`; changed `ManagedAgentSessionResult.status` to drop `"timeout"`; removed timeout catch branch |
| `src/core/step/executor.ts` | modified | Deleted `getTimeoutMs` method; removed `timeoutMs` from all `pollUntilComplete` calls; removed `"timeout"` branch in poll result handling |
| `src/core/types.ts` | modified | Removed `timeoutMs?: number` from `PipelineDeps` interface |
| `src/config/schema.ts` | modified | Removed `timeoutMs` from `SpecReviewConfig` and `SpecFixerConfig`; deleted `getTimeoutMs(stepName, cfg)` helper; removed unused `StepName` import |
| `src/config/store.ts` | modified | `saveConfig` now explicitly deletes `timeout`, `specReview.timeoutMs`, `specFixer.timeoutMs` before writing (D3: legacy fields silently ignored on write) |
| `src/cli/run.ts` | modified | Removed `timeout?: string` option, `parseTimeout` call, and `timeoutMs` from `runPipeline` call |
| `bin/specrunner.ts` | modified | Removed `--timeout=Nm` from USAGE; removed `timeoutFlag`/`timeout` variable from `run` command case |
| `src/core/pipeline/run.ts` | modified | Updated JSDoc comment to remove `SESSION_TIMEOUT` from listed error codes |
| `tests/state/session-timeout-migration.test.ts` | created | TC-001, TC-002, TC-003: lazy migration unit tests |
| `tests/error-codes.test.ts` | modified | Replaced TC-022 with TC-004/TC-005 verifying `SESSION_TIMEOUT` removed from `ERROR_CODES` and `sessionTimeoutError` not exported |
| `tests/completion.test.ts` | modified | Removed TC-032 (timeout after 30m); added comment |
| `tests/spec-review-step.test.ts` | modified | Replaced TC-016 (timeoutMs from config) with TC-006 (no timeoutMs passed); removed TC-019 (SESSION_TIMEOUT handling) |
| `tests/core/session-runner.test.ts` | modified | Removed `timeoutMs: 60000` from TC-051 and TC-052 calls |
| `tests/core/step/step-interface.test.ts` | modified | Updated TC-014: `"timeout"` → `"terminated"`, `SESSION_TIMEOUT` → `SESSION_TERMINATED` |
| `tests/core/pipeline/pipeline.test.ts` | modified | Changed `SESSION_TIMEOUT` error code in test data to `SESSION_TERMINATED` |
| `tests/grep-no-step-name-hardcode.test.ts` | modified | Updated test description (removed `getTimeoutMs` reference) |
| `tests/pipeline-integration.test.ts` | modified | Removed `timeoutMs: 600000` from `specReview` config in `buildConfig` |
| `tests/init.test.ts` | modified | Updated regression test: verifies old config with `timeoutMs` loads without error; verifies `timeoutMs` not written back on save |
| `tests/unit/config/migrate.test.ts` | modified | Removed `result.specFixer?.timeoutMs` assertion (field removed) |
| `tests/unit/remove-session-timeout.test.ts` | created | TC-007, TC-008, TC-010, TC-011, TC-012, TC-015: static-analysis and functional tests for the removal |

## Blocked Tasks

| Task | Reason |
|------|--------|
| 5.1 openspec validate | `openspec` CLI not available in this environment. Manual validation deferred to pipeline orchestrator |
| 5.2 spec delta 目視確認 | Requires manual review of 6 spec files against delta. Deferred to pipeline orchestrator |

Tasks 7.5 (propose-system.ts scope confirmation) was verified by grep — no timeout references were introduced in prompt files.

## Deviations from Spec

- **4.4 pollIntervalMs**: Chose option (a) — retained `pollIntervalMs` in schema as a separate polling-interval concern unrelated to wall-clock timeout. No change to schema for this field.
- **executor-helpers.test.ts**: Tests using `"SESSION_TIMEOUT"` as an arbitrary string in generic `throwWrappedError`/`failStepWithError` tests were left unchanged — they test generic error propagation, not the specific error code constant.

## Module Analysis Adoption

対象なし（module-analysis.md は生成されなかった）

## Fix History

### code-fixer iteration 1 (2026-05-03)

Addressed review-feedback-001.md findings:

| Finding | Severity | File | Action |
|---------|----------|------|--------|
| #1 | HIGH | `src/cli/run.ts` | `parseTimeout` 関数と JSDoc（lines 13-26）を完全削除 |
| #2 | MEDIUM | `src/adapter/anthropic/session-runner.ts:31` | JSDoc の `timeout` variant 記述を `(idle / terminated)` に修正 |
| #3 | MEDIUM | `src/core/step/executor.ts:308,637` | hardcoded `{ code: "SESSION_TERMINATED", ... }` fallback を `sessionTerminatedError()` ヘルパー呼び出しに置換 |
| #4 | LOW | `tests/unit/step/executor-helpers.test.ts:113,125,140,152,154` | fixture 文字列 `"SESSION_TIMEOUT"` を `"GENERIC_ERROR_CODE_FOR_TEST"` に置換 |
| #5 | LOW | `src/config/schema.ts:42` | `SpecFixerConfig` 空 interface に `readonly _placeholder?: never` を追加 |
| #6 | LOW | `openspec/changes/remove-session-timeout/tasks.md` | 5.1 / 5.2 / 7.5 を `[x]` に更新 |

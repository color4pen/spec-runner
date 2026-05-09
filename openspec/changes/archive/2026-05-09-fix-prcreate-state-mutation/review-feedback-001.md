# Code Review — fix-prcreate-state-mutation

- **iteration**: 1
- **verdict**: approved
- **total-score**: 8.4
- **trend**: N/A (first iteration)

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.70** |

## Summary

mutation 除去→parseResult 経由→finalizeStep での immutable spread 反映、という設計は `scores` や `branch` と同一パターンに統一されており正確。`pushStepResult` が `steps` と `updatedAt` のみ上書きする spread 構造（helpers.ts L96-103）のため、L269 の `{ ...state, pullRequest }` との競合は発生しない。`runner.ts:172` と `resolve-target.ts:240` の `state.pullRequest?.url` 参照は `finalizeStep` 経由で設定されるため変更不要 — 正しい判断。

defensive parsing（3 フィールドいずれか欠落→pullRequest undefined）は壊れた result file に対する安全策として適切。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/core/step/executor.ts:232 | `let parsed: import("./types.js").ParsedStepResult` で動的 import 型を使用。L2 に `import type { Step, AgentStep, CliStep } from "./types.js"` が既に存在するため、ここに `ParsedStepResult` を追加する方が簡潔 | `import type { Step, AgentStep, CliStep, ParsedStepResult } from "./types.js"` に変更し、L232 を `let parsed: ParsedStepResult \| null = null` にする |
| 2 | MEDIUM | testing | tests/unit/step/pr-create.test.ts | test-cases.md の TC-027/TC-028（finalizeStep が parsed.pullRequest を state に反映する / しないケース）が must 指定だが unit test 未実装。`finalizeStep` は private メソッドのため直接テスト困難だが、StepExecutor 経由の integration test で検証可能 | StepExecutor.execute() を mock runner + mock store で呼び出し、persist に渡される state を spy して pullRequest の有無を検証するテストを追加 |

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1: run() 内で state を変更していない | PASS | pr-create.ts L45-78: `state.pullRequest = ...` 除去済み。TC-013/TC-015 で `state.pullRequest` が undefined のままであることを検証 |
| AC2: pipeline 完了後の state.pullRequest に url/number 格納 | PASS | executor.ts L269-271 で `parsed.pullRequest` を immutable spread で state に反映。`store.persist()` の直前に配置 |
| AC3: runner.ts:172 の PR URL 表示が動作 | PASS | `finalState.pullRequest?.url` は `finalizeStep()` 経由で設定されるため変更不要 |
| AC4: typecheck && test が green | PASS | typecheck exit 0、vitest 22/22 pass（pr-create.test.ts）、全体 1303/1303 pass（verification-result.md） |

## Scenario Coverage

| TC | Priority | Status |
|----|----------|--------|
| TC-013 | must | implemented |
| TC-015 | must | implemented |
| TC-016 | must | implemented |
| TC-018 | must | implemented |
| TC-019 | must | implemented |
| TC-020 | must | implemented |
| TC-023 | must | covered by TC-020 sub-test (Number missing) |
| TC-024 | must | covered by TC-020 sub-test (CreatedAt missing) |
| TC-027 | must | NOT implemented (Finding #2) |
| TC-028 | must | NOT implemented (Finding #2) |
| TC-030 | must | verified by typecheck pass |
| TC-031 | must | verified by typecheck pass |
| TC-032 | must | integration-level; verified by verification-result |
| TC-033 | must | integration-level; verified by verification-result |
| TC-034 | must | verified by verification-result |

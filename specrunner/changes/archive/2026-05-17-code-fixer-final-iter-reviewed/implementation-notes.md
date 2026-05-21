# Implementation Notes: code-fixer-final-iter-reviewed

## Summary

- **result**: completed
- **tasks_completed**: 14/14

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/state/schema.ts` | Modified | `ResumePoint` に optional `exhaustionPhase` field を追加 |
| `src/core/pipeline/pipeline.ts` | Modified | `loopFixerPairs` constructor param、`fixerIters` counter、exhaustion check 改訂、fixer exhaustion gate、`handleExhausted` に `exhaustionPhase` 追加 |
| `src/core/pipeline/run.ts` | Modified | `loopFixerPairs` を Pipeline constructor に渡す（3 pairs: code-review/spec-review/verification） |
| `tests/pipeline-integration.test.ts` | Modified | TC-012・TC-061 を新 semantic で更新、TC-062〜TC-064 を新規追加 |
| `tests/core/pipeline/pipeline.test.ts` | Modified | TC-069 を新規追加（loopFixerPairs 空の場合の従来挙動 unit test） |
| `specrunner/changes/code-fixer-final-iter-reviewed/tasks.md` | Modified | 全タスクを [x] に更新 |
| `specrunner/changes/code-fixer-final-iter-reviewed/delta-spec/pipeline-orchestrator.md` | Created | pipeline-orchestrator Loop Guard requirement の MODIFIED delta spec |

## What Was Implemented

### Core fix (pipeline.ts)

- `fixerIters: Map<string, number>` を `loopIters` と並列で追加。fixer step 入場時にインクリメント。
- `loopFixerPairs: Record<string, string>` を Pipeline constructor に追加（review → fixer の対応表）。
- exhaustion check を改訂: `loopIters[nextStep] >= maxIterations` かつ直前 step が paired fixer かつ `fixerIters[fixer] >= maxIterations` の場合、check を bypass し review の +1 回実行を許可。
- fixer exhaustion gate を追加: `fixerIters[fixer] >= maxIterations` なら fixer への遷移を阻止して escalate。
- `handleExhausted` に `exhaustionPhase` パラメータを追加し、`resumePoint.exhaustionPhase` に反映。
  - `"review-after-final-fix"`: fixer が maxIter 到達後の review が approve しなかった場合
  - `"review-exhausted"`: 従来の exhaustion（bypass なし）

### run.ts

`createStandardPipeline` で以下の `loopFixerPairs` を Pipeline に渡す:
- `code-review → code-fixer`
- `spec-review → spec-fixer`
- `verification → build-fixer`

### Tests updated

- **TC-012**: spec-review 2 needs-fix → spec-fixer 2 runs → spec-review +1 bypass → 3rd needs-fix → escalation。`specReviewArr.length === 3`、`exhaustionPhase === "review-after-final-fix"`。
- **TC-061**: code-review 版の同様の更新。`codeReviewArr.length === 3`、`exhaustionPhase === "review-after-final-fix"`。
- **TC-062**: code-fixer 最終 iter 後 code-review +1 bypass → approved → awaiting-merge。
- **TC-063**: spec-fixer 最終 iter 後 spec-review +1 bypass → approved → awaiting-merge。
- **TC-064**: build-fixer 最終 iter 後 verification +1 bypass → passed → awaiting-merge（runVerification mock を vi.mocked でオーバーライド）。
- **TC-069**: `loopFixerPairs: {}` で exhaustion が従来通り 2 iter で打ち切られ bypass なし。`exhaustionPhase === "review-exhausted"`。

## Blocked Tasks

なし

## Test Results

- 全テスト: 1937 tests passed（162 test files）
- typecheck: エラーなし

# Regression Gate Result — Iteration 001

- **change**: pipeline-smalls-bundle
- **iteration**: 1
- **verdict**: approved

## Findings Verification

### [HIGH] TC-006 per-job 経路の resumePoint テストが欠落
- **File**: src/core/lifecycle/__tests__/exit-guard.test.ts
- **Status**: fixed
- **Evidence**: Lines 211–256 に "per-job モード — step が truthy な running job は resumePoint が書かれる" テストが存在する。`createExitGuardHandler(tempDir, jobId)` を per-job モードで呼び出し、遷移後 state に `resumePoint.step === "implementer"`、`reason === "signal"`、`iterationsExhausted === 0` が書かれることを検証している。

### [LOW] "../errors.js" が 2 行に分かれて重複 import されている（初出）
- **File**: src/cli/job-show.ts:24
- **Status**: fixed
- **Evidence**: Line 24 で `worktreeGuardError`、`SpecRunnerError`、`ERROR_CODES` の 3 シンボルが 1 行にまとめられている（`import { worktreeGuardError, SpecRunnerError, ERROR_CODES } from "../errors.js";`）。重複行なし。

### [LOW] 重複 import: ../errors.js が 2 行に分かれたまま（持ち越し）
- **File**: src/cli/job-show.ts:24
- **Status**: fixed
- **Evidence**: 上記と同一。持ち越し指摘も同じ修正で解消済み。

## Regressions

なし。

## Contradictions

なし。

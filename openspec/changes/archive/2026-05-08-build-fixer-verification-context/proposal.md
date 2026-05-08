## Why

build-fixer の agent は初期メッセージで `findingsPath` だけを受け取り、verification-result.md を自力で読んで構造を理解する必要がある。失敗フェーズとエラー出力の把握にターンを消費し、修正着手が遅れる。

verification の StepExecutor は verification-result.md の全文を `fileContent` として state に保存済み（`src/core/step/executor.ts:316`）。この既存データから失敗フェーズとエラー出力を抽出し、build-fixer の初期メッセージに直接埋め込めば、agent は初手から修正に着手できる。

## What Changes

- `src/core/verification/parse-result.ts` に verification-result.md パースヘルパー `extractVerificationFailures()` を追加。失敗フェーズ名・exit code・エラー出力を抽出する
- `src/core/step/build-fixer.ts` の `buildMessage()` で `verificationResult.fileContent` から失敗情報を抽出し、初期メッセージに `## Verification Failure` セクションとして埋め込む
- `fileContent` が未保存の場合（resume 等）は現行の挙動を維持（findingsPath 参照のみ）
- `src/prompts/build-fixer-system.ts` に「初期メッセージの Verification Failure セクションを優先確認せよ」を追加

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `build-fixer-session`: buildMessage が verification 失敗情報を初期メッセージに直接含める動作を仕様化
- `verification-runner`: verification-result.md のパース仕様を公開ヘルパーとして切り出す

## Impact

- `src/core/verification/parse-result.ts`: 新規追加（ヘルパー関数）
- `src/core/step/build-fixer.ts`: buildMessage() の初期メッセージ構築ロジック変更
- `src/prompts/build-fixer-system.ts`: system prompt に Verification Failure セクションの優先確認指示を追加
- `tests/unit/core/verification/parse-result.test.ts`: 新規追加
- `tests/unit/step/build-fixer.test.ts`: fileContent あり/なしのテストケース追加

## 1. パースヘルパーの追加

- [x] 1.1 `src/core/verification/parse-result.ts` を新規作成。`VerificationFailure` 型と `extractVerificationFailures(content: string): VerificationFailure[]` 関数を実装する
  - Phase Results テーブルから `failed` ステータスの行を正規表現で抽出し、フェーズ名と exit code を取得する
  - 対応する `## Phase: <name>` セクションのコードブロック（` ``` ` で囲まれた部分）を `output` として取得する
  - 失敗フェーズが 0 件の場合は空配列を返す
- [x] 1.2 `tests/unit/core/verification/parse-result.test.ts` を新規作成。以下のケースをテストする:
  - typecheck のみ失敗（後続 skipped）→ 1 件の VerificationFailure を返す
  - build 失敗（全後続 skipped）→ 1 件
  - 全フェーズ passed → 空配列
  - 全フェーズ skipped → 空配列
  - 出力が `(no output)` の場合の扱い

## 2. build-fixer の buildMessage 改善

- [x] 2.1 `src/core/step/build-fixer.ts` の `buildMessage()` を変更。`verificationResult.fileContent` が存在する場合に `extractVerificationFailures()` を呼び、失敗フェーズごとに `## Verification Failures` セクションを初期メッセージに追加する
  - `findingsPath` への参照は維持する（agent が全文を確認するフォールバック）
  - `fileContent` が null/undefined の場合は現行の挙動を維持する
- [x] 2.2 `tests/unit/step/build-fixer.test.ts` に以下のテストケースを追加:
  - fileContent あり（失敗フェーズあり）→ 初期メッセージに `Verification Failures` セクションとエラー出力が含まれる
  - fileContent あり（失敗フェーズなし = パース結果が空配列）→ セクションが追加されない
  - fileContent が null/undefined → 現行の挙動（findingsPath のみ）が維持される

## 3. system prompt の改善

- [x] 3.1 `src/prompts/build-fixer-system.ts` の修正手順セクションに「初期メッセージに Verification Failures セクションがある場合はそのエラー出力を最初に確認する」を追加する

## 4. 検証

- [x] 4.1 `bun run typecheck` が green
- [x] 4.2 `bun run test` が green

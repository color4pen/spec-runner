# Tasks: remove-prose-parse-invariants

## T-01: `review-verdict.ts` 削除と parseResult no-op 化

- [x] `src/core/parser/review-verdict.ts` を削除
- [x] `src/core/step/spec-review.ts`: `parseReviewVerdict` import を削除、`parseSpecReviewVerdict` 関数を削除、`parseResult` を `{ verdict: null, findingsPath: null, fileContent: content }` を返す no-op に置換
- [x] `src/core/step/code-review.ts`: `parseReviewVerdict` import を削除、`parseResult` を `{ verdict: null, findingsPath: null, fileContent: content }` を返す no-op に置換
- [x] `bun run typecheck` が green であることを確認

**Acceptance Criteria**:
- `src/core/parser/review-verdict.ts` が存在しない
- spec-review.ts / code-review.ts に `parseReviewVerdict` / `review-verdict` への import が存在しない
- spec-review / code-review の `parseResult` が `NULL_PARSE_RESULT` 相当（verdict: null）を返す
- typecheck green

## T-02: `review-findings.ts` の関数削除（interface 維持）

- [x] `src/core/parser/review-findings.ts` から `parseFixableFindings` 関数と `parseFindingSeverityCounts` 関数を削除
- [x] `FindingSeverityCounts` interface は維持する（`types.ts` の `ParsedStepResult.scores` で参照されている）
- [x] src 配下で `parseFixableFindings` / `parseFindingSeverityCounts` の import が残っていないことを grep で確認
- [x] `bun run typecheck` が green であることを確認

**Acceptance Criteria**:
- `parseFixableFindings` / `parseFindingSeverityCounts` 関数が `review-findings.ts` に存在しない
- `FindingSeverityCounts` interface は維持されている
- typecheck green

## T-03: dead テストの削除

- [x] `tests/unit/parser/review-verdict.test.ts` を削除
- [x] `tests/unit/parser/review-findings.test.ts` を削除
- [x] `tests/spec-review-verdict.test.ts` を削除
- [x] `tests/unit/step/code-review-verdict.test.ts` を削除
- [x] `bun run test` が green であることを確認（他テストが壊れていないこと）

**Acceptance Criteria**:
- 上記 4 ファイルが存在しない
- `bun run test` green

## T-04: golden 床の typed 移行

- [x] `tests/unit/contract/golden-cases.test.ts` から `parseFixableFindings` import と T-02 セクション（`golden: parseFixableFindings` describe ブロック）を削除
- [x] 同ファイル冒頭コメントの `parseReviewVerdict` TC-018/021 floor 参照を削除
- [x] 以下の typed golden case を同ファイルに追加（executor の `finalizeStep` 経由で検証）:
  - **GC-TYPED-01**: `toolResult.approved = true` → verdict `"approved"`
  - **GC-TYPED-02**: `toolResult.approved = false, fixableCount = 0` → verdict `"needs-fix"`
  - **GC-TYPED-03**: `toolResult = null`（judge step）→ verdict `"needs-fix"`
- [x] golden case テストは StepExecutor.finalizeStep を呼び、`pushStepResult` で記録された verdict を検証する（executor の typed path を直接テスト）
- [x] `bun run test` が green であることを確認

**Acceptance Criteria**:
- prose-parse golden（parseFixableFindings / TC-018/021 参照）が除去されている
- GC-TYPED-01/02/03 が golden-cases.test.ts に存在し green
- typed golden が executor の verdict 導出ロジックを直接検証している

## T-05: arch test 新設（INV-1〜3）

- [x] `tests/unit/contract/invariants.test.ts` を新規作成
- [x] **INV-1**: `src/core/pipeline/types.ts` 内の `when` 関数群のソースコードに `fileContent` 文字列が含まれないことを grep で検証するテストを追加
- [x] **INV-2**: `src/core/parser/review-verdict.ts` が存在しないことを `fs.existsSync` で検証。`src/core/` 配下に `parseReviewVerdict` という文字列が存在しないことを grep で検証するテストを追加
- [x] **INV-3**: 全 agent step（`src/core/step/` 配下の step 定義）が `reportTool` を持っていることを検証するテストを追加（`reportTool` 未定義の agent step が prose parse に fall through する経路を防止）
- [x] `bun run test` が green であることを確認

**Acceptance Criteria**:
- `tests/unit/contract/invariants.test.ts` が存在し、INV-1/INV-2/INV-3 の 3 テストが green
- INV-2 は T-01 での parser 削除後に green になる（T-01 が前提）
- 既存テストが壊れていない

## T-06: 最終検証

- [x] `bun run typecheck && bun run test` が green
- [x] `src/core/parser/review-verdict.ts` が存在しないことを確認
- [x] `parseFixableFindings` / `parseFindingSeverityCounts` が src に存在しないことを grep で確認
- [x] `parseReviewVerdict` が src に存在しないことを grep で確認

**Acceptance Criteria**:
- typecheck + test 全 green
- dead code が全て除去されている

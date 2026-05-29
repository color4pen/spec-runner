# Tasks: grounded 検査の golden case を追加して contract の床を固める

## T-01: golden-case テストファイルを作成し、floor 参照コメントを記載する

- [x] `tests/unit/contract/golden-cases.test.ts` を新規作成する
- [x] ファイル冒頭にドキュメントコメントを書く:
  - このファイルの目的（`contract/golden-cases.md` 対応の回帰ネット）
  - 既存テストが担保済みの floor 参照: `parseReviewVerdict` の approved 抽出（TC-018）と空→null（TC-021）は `tests/unit/parser/review-verdict.test.ts` が担保
- [x] vitest の `describe`, `it`, `expect` を import する

**Acceptance Criteria**:
- ファイルが `tests/unit/contract/golden-cases.test.ts` に存在する
- 冒頭コメントに TC-018 / TC-021 への参照がある
- `parseReviewVerdict` のテストは複製されていない

## T-02: `parseFixableFindings` の golden case を追加する

- [x] `parseFixableFindings` を `src/core/parser/review-findings.js` から import する
- [x] must-pass ケース: `## Findings` セクションに `Fix` 列が `yes` の行を含む Markdown テーブルを入力として `parseFixableFindings` を呼び、戻り値が `> 0` であることを assert する
  - 入力例: header 行 `| # | Severity | Category | File | Description | How to Fix | Fix |` + separator + data 行 `| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | yes |`
- [x] must-fail-safe ケース 1（空文字列）: `parseFixableFindings("")` が `0` を返すことを assert する
- [x] must-fail-safe ケース 2（Findings セクションなし）: `## Findings` を含まない文字列で `0` を返すことを assert する
- [x] must-fail-safe ケース 3（Fix 列なし）: `## Findings` テーブルはあるが `Fix` 列がない入力で `0` を返すことを assert する

**Acceptance Criteria**:
- must-pass で count > 0 が assert されている
- 空 / Findings なし / Fix 列なしの 3 パターンで count = 0 が assert されている
- 現行コードで green

## T-03: `VerificationStep.parseResult` の golden case を追加する

- [x] `VerificationStep` を `src/core/step/verification.js` から import する
- [x] `StepDeps` 型の最小スタブを作る（`slug` と `config`、`request` に最小値を設定、`as StepDeps` で cast）
- [x] must-fail-safe ケース: `"## Verdict: failed"` を含む文字列を `VerificationStep.parseResult(content, deps)` に渡し、`result.verdict` が `"passed"` でない（= `"failed"` である）ことを assert する
- [x] 補強ケース: `"## Verdict: passed"` を含む文字列で `result.verdict` が `"passed"` であることを assert する（正常パスの floor）
- [x] 補強ケース: verdict 行が存在しない文字列で `result.verdict` が `null` であることを assert する（parse 失敗時の safe default）

**Acceptance Criteria**:
- `## Verdict: failed` 入力で verdict ≠ `"passed"` が assert されている
- runner 層の mock（`spawn`, `fs` 等）を使っていない
- 現行コードで green

## T-04: typecheck + test green を確認する

- [x] `bun run typecheck` が成功する
- [x] `bun run test` が成功する（新規テスト含め全テスト green）
- [x] 既存テストファイル（`review-verdict.test.ts`, `runner.test.ts`, `parse-result.test.ts` 等）を変更していないことを確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
- git diff で既存テストファイルに変更がないこと

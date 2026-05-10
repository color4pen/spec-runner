# Code Review — centralize-change-path — iter 2

## Summary

iteration 1 の HIGH findings 3 件（テスト 3 ファイル 18 箇所の `path.join` 分解リテラル残存）は全て修正済み。`src/` と `tests/` の両方で `openspec/changes/` / `openspec/specs/` のリテラルが `paths.ts` の関数経由に統一されている。fixture JSON は意図通り未変更。typecheck green、全 1556 テスト pass。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/prompts/code-review-system.ts:4 | `const _changesDir = changesDirRel();` をモジュールトップで呼んでいる。現状 pure 関数なので問題ないが、将来 `changesDirRel()` が config 読みに変わった場合に module-load-time evaluation がリスクになる。propose-system.ts, spec-review-system.ts, test-case-gen-system.ts も同様 | 現状は許容。R2 で config 化する場合に lazy evaluation への変更を検討する |
| 2 | LOW | maintainability | src/core/verification/propagate.ts:27 | `VERIFICATION_RESULT_REL_PATH` が arrow function で `verificationResultPath(slug)` をラップしているだけの indirection。直接 `verificationResultPath` を呼べば中間変数は不要 | `VERIFICATION_RESULT_REL_PATH` を削除し、呼び出し元で直接 `verificationResultPath(slug)` を使う |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | src/tests 全域でリテラル集約完了。fixture JSON 除外も Design D4 通り。全テスト pass |
| security | 9 | セキュリティ上の変更なし |
| architecture | 9 | paths.ts は pure utility、no imports（TC-034）、re-export パターンで後方互換性を維持 |
| performance | 9 | パフォーマンスへの影響なし |
| maintainability | 8 | 命名・JSDoc・モジュール構造は良好。module-top-level evaluation (LOW #1) と 1 indirection (LOW #2) が微小な改善余地 |
| testing | 9 | TC-001〜TC-039 の must シナリオを網羅。paths.test.ts で関数の正確性を保証し、下流テストは全て関数経由 |

**Total**: 9×0.30 + 9×0.25 + 9×0.15 + 9×0.10 + 8×0.10 + 9×0.10 = 2.70 + 2.25 + 1.35 + 0.90 + 0.80 + 0.90 = **8.90**

## Iteration Comparison

### Improvements

- **Finding #1 (iter 1, HIGH)**: `tests/unit/step/pr-create.test.ts` の 15 箇所の `path.join(tempDir, "openspec", "changes", slug)` → 全て `changeFolderPath`/`prCreateResultPath` 経由に修正済み
- **Finding #2 (iter 1, HIGH)**: `tests/unit/core/verification/propagate.test.ts` の 2 箇所 → `changeFolderPath`/`verificationResultPath` 経由に修正済み
- **Finding #3 (iter 1, HIGH)**: `tests/unit/core/verification/runner.test.ts` の 1 箇所 → `verificationResultPath` 経由に修正済み

### Regressions

なし

### Unchanged Issues

なし（iter 1 の全 HIGH findings が解消）

### Convergence Trend

`improving` — Total スコア 7.70 → 8.90（+1.20）

## Verdict

- **verdict**: approved

CRITICAL: 0, HIGH: 0, Total 8.90 ≥ 7.0。全受け入れ基準を充足。

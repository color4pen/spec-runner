# Code Review — centralize-change-path — iter 1

## Summary

パスリテラル集約は `src/` 配下で完了しており、`src/util/paths.ts` の設計・実装は良好。re-export パターン、JSDoc、循環依存排除（TC-034）も適切。typecheck / test ともに green。

ただし、テスト 3 ファイルに `path.join(tempDir, "openspec", "changes", slug)` 形式の分解リテラルが 18 箇所残存しており、Design D4（テスト内パスも関数経由）および AC2 の意図に違反している。R2 でパス変更時にこれらが追従せず手動修正が必要になる。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | tests/unit/step/pr-create.test.ts:158,178,181,203,206,228,246,249,271,290,293,318,321,345,348 | `path.join(tempDir, "openspec", "changes", slug)` および `path.join(tempDir, "openspec", "changes", slug, "pr-create-result.md")` が 15 箇所残存。Design D4 違反。R2 で自動追従しない | `path.join(tempDir, changeFolderPath(slug))` と `path.join(tempDir, prCreateResultPath(slug))` に置換する |
| 2 | HIGH | correctness | tests/unit/core/verification/propagate.test.ts:36,87 | `path.join(cwd, "openspec", "changes", slug)` が 2 箇所残存。Design D4 違反 | L36: `path.join(cwd, changeFolderPath(slug))` に置換。L87: `path.join(cwd, verificationResultPath("my-change"))` に置換 |
| 3 | HIGH | correctness | tests/unit/core/verification/runner.test.ts:214 | `path.join(tempDir, "openspec", "changes", "my-change", "verification-result.md")` が 1 箇所残存。Design D4 違反 | `path.join(tempDir, verificationResultPath("my-change"))` に置換 |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 6 | src/ は完全集約。テスト 3 ファイル 18 箇所の分解リテラル残存が AC2/D4 違反 |
| security | 9 | セキュリティ上の変更なし |
| architecture | 9 | paths.ts の設計は適切。pure utility、no imports、re-export パターン |
| performance | 9 | パフォーマンスへの影響なし |
| maintainability | 8 | 命名・JSDoc・モジュール構造は良好 |
| testing | 6 | paths.test.ts は TC-001〜TC-011 を網羅。しかし TC-032（テスト内リテラル 0 件）が path.join 分解パターンを検出できず不達成 |

**Total**: 6×0.30 + 9×0.25 + 9×0.15 + 9×0.10 + 8×0.10 + 6×0.10 = 1.80 + 2.25 + 1.35 + 0.90 + 0.80 + 0.60 = **7.70**

## Iteration Comparison

_(iteration 1 — 比較対象なし)_

## Verdict

- **verdict**: needs-fix

HIGH findings が 3 件存在するため needs-fix。修正対象はテストファイル 3 つのパスリテラル置換のみ。src/ 側の変更は不要。

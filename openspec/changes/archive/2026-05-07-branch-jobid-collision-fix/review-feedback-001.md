# Code Review: branch-jobid-collision-fix — Iteration 1

## Summary

変更は明快で、設計意図に沿った正確な実装。`stripJobIdSuffix` を `job-slug.ts` に集約し、3 つの消費箇所すべてを更新。テストは十分な境界条件をカバーしている。typecheck + 890 テスト全 green。

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | 全消費箇所が正しく更新。正規表現の精度も適切（hex 8 文字限定、後方互換 no-op） |
| security | 8 | セキュリティ影響なし。slug 逆算で入力検証が既存のまま維持 |
| architecture | 9 | `job-slug.ts` への集約は DRY + SoT。design.md の判断が適切に実装に反映 |
| performance | 8 | 正規表現は定数定義で再利用、パフォーマンス影響なし |
| maintainability | 7 | 下記 #1, #2 の指摘あり。branch 生成の二重定義は要注意だが tasks.md で文書化済み |
| testing | 9 | stripJobIdSuffix 7 ケース + getJobSlug 統合 2 ケース + register-branch 2 ケース + executor TC-004 更新 |

**Total**: 9×0.30 + 8×0.25 + 9×0.15 + 8×0.10 + 7×0.10 + 9×0.10 = 2.70 + 2.00 + 1.35 + 0.80 + 0.70 + 0.90 = **8.45**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/prompts/propose-system.ts:164 | docstring が `feat/{slug}` convention と記述しているが、実際の convention は `feat/{slug}-{jobId[0:8]}` に変更済み。default parameter `feat/${slug}` も runtime では未使用だが残存 | docstring を `feat/{slug}-{jobId[0:8]}` に更新。default parameter は caller が常に明示するため削除も可（breaking change ではない） |
| 2 | LOW | maintainability | src/core/step/propose.ts:61, src/core/step/executor.ts:217 | branch フォーマット `feat/${deps.slug}-${state.jobId.slice(0, 8)}` が 2 箇所で独立に定義されている。将来一方だけ変更すると agent に渡る branch と state.branch が乖離する | tasks.md T2.2 で文書化済みのため受容可。将来的には `deriveBranchName(slug, jobId)` ヘルパーに抽出すると安全 |

## Iteration Comparison

_(Iteration 1 — 比較対象なし)_

## Verdict

- **verdict**: approved

# Spec Review Result — refactor-finish-preflight-split

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

proposal.md / design.md / tasks.md の 3 アーティファクトは request.md の 8 要件を正確にカバーしている。現行 preflight.ts（504 行）の責務分割は実コードの関数境界・行番号と一致しており、spawnOrEscalate の適用/非適用箇所の判断根拠も妥当。タスク依存関係（T1-T3 並行 → T4-T5 → T6 → T7）は正しい。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | architecture | design.md:D1,D2 | pr-status.ts が `PrViewData` を preflight.ts から `import type` し、preflight.ts が `fetchPrViewWithRetry` を pr-status.ts から import する循環依存が発生する。TypeScript の type-only import で runtime は安全だが、設計意図（責務分離）と矛盾する。`types.ts` に `PrViewData` を移動すれば循環を完全に排除できる | `PrViewData` を `src/core/finish/types.ts` に移動する。`types.ts` は既に `ResolvedTarget`, `FinishFs` 等の共有型を集約しており、同パターンの延長 |
| 2 | LOW | correctness | tasks.md:T7 | T7 検証チェックリストが「preflight.ts + orchestrator.ts で合計 7 箇所以上」と記載しているが、`git rev-parse` の spawnOrEscalate 適用箇所は T3 で branch-checkout.ts に移動済み。正確には preflight.ts (1) + orchestrator.ts (6) + branch-checkout.ts (1) = 8 箇所 | T7 チェックリストを「preflight.ts + orchestrator.ts + branch-checkout.ts で合計 8 箇所」に修正。受け入れ基準（5 箇所以上）は満たしており実害なし |

## Scoring

| Category | Score | Rationale |
|----------|-------|-----------|
| completeness | 9 | request.md の 8 要件すべてが tasks.md T1-T7 に対応。スコープ外の明示も正確 |
| architecture | 8 | 責務分割の粒度・依存方向は適切。PrViewData の循環依存のみ改善余地あり |
| correctness | 9 | 行番号参照・適用/非適用判断・推定行数がすべて実コードと整合。T7 の記述ズレは軽微 |

## Verdict Rationale

CRITICAL: 0, HIGH: 0。Finding #1 (MEDIUM architecture) は `types.ts` への型移動で実装時に解消可能であり、設計の根幹を変えない。Finding #2 は記述の不正確さのみで実装に影響しない。仕様は実装可能な状態にある。

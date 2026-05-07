# Code Review: finish-checkout-feature-branch (Iteration 1)

## Summary

Phase 0 の Check 5+6 を feature branch checkout 下で実行するように修正。try-finally パターンで restore を保証し、checkout 失敗時は escalation、restore 失敗時は warning のみと適切に設計されている。テストは 4 ケースで主要パスを網羅。typecheck green、関連テスト全 pass。

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 8 | 主要フローは正しい。Check 8 の HEAD 参照は pre-existing issue |
| security | 9 | spawn injection なし。ユーザー入力は slug/branch のみで git 引数経由 |
| architecture | 8 | checkout/restore ヘルパー分離は適切。try-finally で確実な restore |
| performance | 9 | git fetch は best-effort で不要な blocking なし |
| maintainability | 8 | 命名・構造は明瞭。型定義も適切 |
| testing | 7 | must 4 ケース全実装。TC-CHECKOUT-4 の stderr mock は fragile だが許容範囲 |

**Total**: 8×0.30 + 9×0.25 + 8×0.15 + 9×0.10 + 8×0.10 + 7×0.10 = 2.40 + 2.25 + 1.20 + 0.90 + 0.80 + 0.70 = **8.25**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | src/core/finish/preflight.ts:165 | Check 8 `git rev-list origin/${target.branch}..HEAD --count` は restore 後に main の HEAD で実行されるため、feature branch の unpushed commits を正しく検出できない。ただし pre-existing issue（元コードも main 上で実行されていた） | 将来の改善: `git rev-list origin/${branch}..${branch} --count` のように明示的に branch 名を使う。本 PR のスコープ外 |
| 2 | LOW | consistency | src/core/finish/preflight.ts:337 | design.md では `git fetch 失敗 → escalation` だが実装は best-effort（ignore）。実装の方が合理的（local branch があれば fetch 不要）だがドキュメントと乖離 | design.md の error handling テーブルを実装に合わせて更新する |
| 3 | LOW | maintainability | tests/unit/core/finish/preflight.test.ts:283 | TC-CHECKOUT-4 で `process.stderr.write` を直接 mock しており、テスト並列実行時に干渉する可能性がある | `vi.spyOn(process.stderr, 'write')` + `mockRestore()` パターンの方が安全 |

## Iteration Comparison

N/A (Iteration 1)

## Verdict

- **verdict**: approved
- **CRITICAL**: 0
- **HIGH**: 0
- **MEDIUM**: 0
- **LOW**: 3

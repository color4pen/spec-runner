# 並列 round の state commit を coordinator が round 単位で所有する（member no-persist）

## Meta

- **type**: spec-change
- **slug**: round-owned-state-commit
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D1（state commit の単一所有者）の並列 round 実装**。R2 で逐次経路の `CommitOrchestrator` を導入済み。現状、fan-out の各 member が中間 state を stale base から persist するため、crash 時に member 部分 projection が残りうる。本 request で member は state を persist せず immutable result/delta を返し、coordinator が round 結果を集約して round 完了後に一度だけ `CommitOrchestrator` 経由で commit する。**B-13 の並列経路を ratify する所有権変更**。

## 現状コードの前提

- `ParallelReviewRound`（R3 抽出、R2 では未変更）: member 実行が state を persist する。member は共有 base state から中間 persist し、`mergeParallelReviewerStates` で merge、最後に authoritative persist（`src/core/pipeline/parallel-review-round.ts`）。
- R2 の `CommitOrchestrator` が逐次経路の唯一の writer（`src/core/step/commit-orchestrator.ts`）。並列 member はこれを通っていない。
- R4 で round 入力が immutable 化されている前提。

## 要件

1. round member の実行が state を persist しない。member は immutable result/delta（`StepExecutionResult` 相当）を返す。
2. coordinator（`ParallelReviewRound`）が member 結果を集約し、**round 完了後に一度だけ `CommitOrchestrator` 経由で state へ commit** する（R2 の `CommitOrchestrator` を再利用）。
3. crash 相当で on-disk state が member 単位の部分 projection にならない（fan-out 前 or round 完了後のいずれか）ことを保証する。
4. round の verdict 集約・reviewer status 更新の結果は不変に保つ。

## スコープ外

- git 副作用の round 所有（R5、先行）。
- `architecture/` 配下は変更しない（B-13並列 の §4 / conformance / 歯への ratify は実装 merge 後に attended で行う）。

## 受け入れ基準

- [ ] round member が state を persist しないことをテストで固定する（intended-invariant）。
- [ ] coordinator が round 完了後に一度だけ `CommitOrchestrator` 経由で commit することをテストで固定する。
- [ ] crash 相当で on-disk state が member 部分 projection にならない（fan-out 前 or round 完了後）ことをテストで固定する。
- [ ] round verdict / reviewer status の結果が従来と一致することをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- round state commit を coordinator が所有（ADR D1 並列）。R2 の `CommitOrchestrator` を再利用し、逐次・並列の両経路が同じ writer へ収束する。
- member は immutable result を返し persist しない。round 境界で atomic に commit。
- `state.json` の crash 整合性を上げる（member 部分 projection を持たない）。git round commit との二相境界は残る（将来の revision reconciliation は別 request）。
- `architecture/` は pipeline で触らない。B-13並列 ratify は attended。

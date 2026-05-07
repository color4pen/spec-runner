# Code Review: worktree-based-job-execution (Iteration 2)

- **reviewer**: code-reviewer
- **iteration**: 2
- **verdict**: approved

## Summary

Iteration 1 の HIGH finding（soft-error パスの worktree cleanup 漏れ）が適切に修正された。`handlePostPipelineState` helper に `onFailure` callback を導入し、soft-error（`SPEC_REVIEW_RESULT_NOT_FOUND`、`status !== "awaiting-merge"`）と throw 両方のパスで cleanup が実行される。post-pipeline ロジックの共通化（`handlePostPipelineState` + `outputPipelineThrowError`）により ~60 行の verbatim 重複も解消。`remove()` シグネチャも `remove(worktreePath, repoRoot)` に改善済み。

typecheck clean、947 tests all pass。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | src/cli/run.ts:256 | SIGINT/SIGTERM 両方で `process.exit(130)` を使用。Unix 慣例では SIGTERM は 143（128+15）。iter 1 #4 から未修正 | signal 引数を受け取り `process.exit(128 + signalNumber)` とするか、130 統一を JSDoc コメントで明示する |
| 2 | LOW | testing | tests/unit/cli/run-worktree-signal.test.ts | signal cleanup ロジックを run.ts から独立再構築してテストしている。run.ts 内の実際の handler をキャプチャするテストではないため、実装が変わった場合にテストが通り続ける可能性がある | `process.on` を spy して registered handler を直接呼び出す統合テストに変更するか、現状のアプローチで十分と判断するなら "mirrors run.ts Design D7" 等のコメントを追加 |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 8 | iter 1 HIGH（soft-error cleanup 漏れ）修正完了。signal exit code の統一（LOW）のみ残存 |
| security | 8 | 変更なし。外部入力を受けない内部 CLI。spawn injection リスクなし |
| architecture | 8 | WorktreeManager DI、managed/local 分岐、3-layer cleanup、`handlePostPipelineState` 抽出が良好 |
| performance | 8 | `bun install --frozen-lockfile` の warm cache は実測 3-5s。許容範囲 |
| maintainability | 7 | iter 1 #2（~60 行重複）と #3（remove シグネチャ）を修正。コードの読みやすさが向上 |
| testing | 7 | 18+ tests 追加。WorktreeManager / signal / preflight / finish / propagate をカバー。soft-error cleanup path の直接テストは欠けるが `handlePostPipelineState` の構造が十分に自明 |

**Total**: 8×0.30 + 8×0.25 + 8×0.15 + 8×0.10 + 7×0.10 + 7×0.10 = 2.40 + 2.00 + 1.20 + 0.80 + 0.70 + 0.70 = **7.80**

## Iteration Comparison

- **Improvements**:
  - #1 (HIGH, correctness): `handlePostPipelineState` に `onFailure` callback 導入 → soft-error パスの worktree cleanup 漏れ解消
  - #2 (MEDIUM, maintainability): post-pipeline ロジックを `handlePostPipelineState` + `outputPipelineThrowError` に共通化 → 重複解消
  - #3 (MEDIUM, maintainability): `remove(worktreePath, repoRoot)` シグネチャに変更 → path.dirname×3 の脆弱性解消
- **Regressions**: なし
- **Unchanged Issues**: #4 (LOW, correctness): SIGINT/SIGTERM の exit code 統一は未修正（低優先度のため妥当）

### Convergence Trend

| Trend | 判定基準 | 推奨アクション |
|-------|---------|--------------|
| `improving` | Total スコア 7.10 → 7.80（+0.70）| 承認 |

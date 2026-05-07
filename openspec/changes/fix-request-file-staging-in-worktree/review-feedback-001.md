# Code Review — fix-request-file-staging-in-worktree — iter 1

- **verdict**: approved
- **total_score**: 7.75
- **iteration**: 1

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **7.75** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/cli/run.ts:247-249 | git add 失敗時の cleanup で `updateJobState(jobState.jobId, (s) => ({ ...s, worktreePath: null }))` が欠落。L234 で state に記録した worktreePath が、worktree 削除後も残る。`cleanupWorktreeOnFailure`（L266）にはこの reset があるが、git add 失敗パスは到達前に return する | `manager.prune` の後に `await updateJobState(jobState.jobId, (s) => ({ ...s, worktreePath: null })).catch(() => {});` を追加 |
| 2 | LOW | testing | tests/unit/cli/run-worktree-git-staging.test.ts | reconstruction パターンでロジック形状を検証しているが、実装と test の乖離を検出する仕組みがない（run.ts 側の if 条件が変わっても test は pass し続ける）。プロジェクト既知の制約であり DI 未対応が根本原因 | DI 対応時に spawnCommand を注入可能にし、実際の runRunCore を呼ぶ integration test に昇格する（今回のスコープ外） |

## Summary

変更は小さく焦点が明確。`fs.cp` 直後の `git add` 追加で worktree 内の request file を staging する設計（D1）が正しく実装されている。fail-fast + best-effort cleanup のパターンも既存コードと一貫。Finding #1 は state の一貫性ギャップだが、job は return 1 で終了するため実害は限定的。承認閾値（7.0）を超えており CRITICAL/HIGH なし。

# Code Review: worktree-based-job-execution (Iteration 1)

- **reviewer**: code-reviewer
- **iteration**: 1
- **verdict**: needs-fix

## Summary

設計通りの 4 Phase 実装。WorktreeManager の DI、既存テスト全 pass（947）、typecheck clean。managed mode のフォールバック分岐も適切に維持されている。propagate.ts と verification.ts の temp worktree 除去は完全。

**1 件の HIGH**: run.ts の pipeline soft-error パスで worktree cleanup が漏れている。Design D3 は「失敗時は remove」と明記しており、catch（throw path）では cleanup されるが、pipeline が throw せず error state を返すケースでは worktree がリークする。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/cli/run.ts:245-266 | Pipeline が throw せず soft-error を返すパス（`SPEC_REVIEW_RESULT_NOT_FOUND`、`status !== "awaiting-merge"`）で worktree cleanup が実行されない。signal handler は deregister 済み。Design D3「失敗時は remove」に違反し、失敗する度に worktree がディスクに残る | post-pipeline セクションの return 1 前に `manager.remove(worktreePath) + manager.prune(cwd) + updateJobState(..., worktreePath: null)` を追加する。または try/finally で success/soft-error 共通の cleanup ブロックを設ける（success 時は finish に cleanup を委譲するため skip フラグで制御） |
| 2 | MEDIUM | maintainability | src/cli/run.ts:196-325 | local runtime（L196-267）と managed runtime（L269-325）で pipeline 実行 + error handling + spec-review verdict output + status check が ~60 行 verbatim 重複。今後の error handling 変更で divergence bug が発生する確率が高い | post-pipeline 共通ロジック（error check → verdict output → status check → return code 決定）を helper 関数に抽出し、worktree cleanup は local runtime block のみに配置する |
| 3 | MEDIUM | maintainability | src/core/worktree/manager.ts:90 | `remove()` が `path.dirname` × 3 で repoRoot を逆算。path convention 変更時に silent に壊れる | `remove(worktreePath, repoRoot)` のシグネチャに変更し、`prune(repoRoot)` と一貫させる |
| 4 | LOW | correctness | src/cli/run.ts:191 | SIGINT/SIGTERM 両方で `process.exit(130)` を使用。Unix 慣例では SIGTERM は 143（128+15） | signal ごとに exit code を分けるか、130 統一を JSDoc で明示する |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 6 | 正常系は完全に動作。soft-error パスの cleanup 漏れ（#1）が減点要因 |
| security | 8 | 外部入力を受けない内部 CLI。git/bun の spawn に injection リスクなし |
| architecture | 8 | WorktreeManager の DI、managed/local 分岐、3-layer cleanup 設計は良好 |
| performance | 8 | `bun install --frozen-lockfile` の warm cache は実測 3-5s。許容範囲 |
| maintainability | 5 | run.ts の ~60 行 verbatim 重複（#2）、remove の path.dirname×3（#3）が減点 |
| testing | 8 | 18 tests 追加。WorktreeManager / signal / preflight / finish / propagate をカバー。soft-error cleanup のテストが欠落 |

**Total**: 6×0.30 + 8×0.25 + 8×0.15 + 8×0.10 + 5×0.10 + 8×0.10 = 1.80 + 2.00 + 1.20 + 0.80 + 0.50 + 0.80 = **7.10**

> pass threshold (7.0) は超えているが HIGH finding (#1) が存在するため verdict は needs-fix。

## Iteration Comparison

N/A (iteration 1)

# Code Review: worktree-retry-branch-fix — iter 1

- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|---------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.60** |

## Summary

コア実装は設計通りかつ正確。受け入れ基準の全要件を満たしている。TC-WTM-013〜016（must 4 ケース）がすべて実装・pass 済み、verification green。TC-WTM-017（cleanup failure の no-propagation 保証）が未実装だが、実装の振る舞いは正しい（throw は無条件でありクリーンアップ結果を参照しない）。

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/core/worktree/manager.test.ts | TC-WTM-017（priority: must）が未実装。`git branch -D` が exit 非 0 を返した場合でも cleanup 失敗が握りつぶされ、元の "git worktree add failed" エラーがスローされることを保証するテストが存在しない | `makeSpawn` の responses に `{ exitCode: 1, stderr: "error: branch not found" }` を branch -D 応答として追加し、`rejects.toThrow("git worktree add failed")` を assertion するテストケース TC-WTM-017 を追加する | yes |
| 2 | LOW | testing | tests/core/worktree/manager.test.ts | TC-WTM-021/TC-WTM-022（priority: must）が独立したテストとして未実装。branchName 指定で 1 回目成功時に `rev-parse` が呼ばれないことの明示的 assertion がない | TC-WTM-009 の既存テストに `spawn.calls.every(c => !c.args.includes("rev-parse"))` を追加するか、TC-WTM-021/022 として独立テストを追加する（TC-WTM-001/009 の `break on exitCode:0` により実質カバー済みのため影響は低い） | no |

## Correctness 確認

実装ロジックを設計 (design.md) と照合した結果を記録する。

**retry args 切り替え**: lock contention 後に `git rev-parse --verify refs/heads/<branchName>` を呼び、exit 0 なら `wtArgs = ["worktree", "add", worktreePath, branchName]`（`-b` 除去）、非 0 なら元の `-b` 付き args を維持。設計通り。✅

**MAX_RETRIES=3 時の rev-parse スキップ**: `attempt === MAX_RETRIES` の条件で rev-parse をスキップし即 cleanup + throw に移行。TC-WTM-015 の spawn sequence（rev-parse 2 回、attempt 3 後は branch -D のみ）と整合。✅

**--detach モードの分岐**: `branchName` が falsy のとき rev-parse / branch -D をどちらもスキップ。TC-WTM-016 が検証済み。✅

**cleanup の non-propagation**: `spawn("git", ["branch", "-D", ...])` の戻り値を参照せず、その直後に無条件 `throw new Error(...)` を実行するため、branch -D の exit code に関わらず元のエラーが propagate される。実装は正しいが TC-WTM-017 でのテスト保護が不足（Finding 1）。✅（実装正）/ ⚠️（テスト未整備）

**args idempotency**: 2 回目の lock contention 後に再度 rev-parse → 既に `-b` なし args に設定済みだが同値に上書きされる。冪等で問題なし。✅

# Proposal: finish Phase 3 の branch 削除を worktree 削除後に移動する

## 問題の本質

`specrunner finish` の Phase 3 で `gh pr merge --squash --delete-branch` を実行するが、local runtime mode では worktree が feature branch を占有しているため `--delete-branch` による branch 削除が失敗する。merge 自体は成功するが、branch 削除エラーで Phase 3 が escalation になり再実行が必要。

## 根本原因

`orchestrator.ts:394` で `--delete-branch` を merge コマンドに渡している。git は worktree にチェックアウトされている branch を削除できないため、Phase 4 で worktree を削除するまで branch 削除は不可能。merge と branch 削除が単一の `gh` コマンドに結合されているのが原因。

## 提案する修正

### 1. Phase 3: `--delete-branch` を除去

`mergeFeaturePrPhase3()` の merge args から `--delete-branch` を外し、merge のみに専念させる。

### 2. Phase 4: worktree 削除後に branch を明示的に削除

worktree remove + prune の後に以下を実行:
- `git branch -D <branch>` — ローカル branch 削除
- `git push origin --delete <branch>` — リモート branch 削除

### 3. dry-run 出力の更新

`outputDryRunPlan()` の `merge-strategy` 文字列を `--delete-branch` なしに更新。

### 4. delta spec

`cli-finish-command` spec の Phase 3/4 記述を更新。

## 影響範囲

- **変更ファイル**:
  - `src/core/finish/orchestrator.ts`: Phase 3 merge args、Phase 4 branch 削除追加、dry-run 文字列
  - `tests/finish-orchestrator.test.ts`: Phase 4 の branch 削除テスト追加
  - `openspec/specs/cli-finish-command/spec.md`: delta spec で上書き

- **既存機能への影響**: managed mode（worktreePath=null）でも同じ branch 削除ロジックを使用。managed mode では Phase 4 で `git checkout main` + `git pull` 後に branch 削除するため、branch は使用中でない

- **後方互換性**: 破壊的変更なし。外部 API 変更なし

## 受け入れ基準

- [ ] finish が worktree ありの job で 1 回の実行で完走する
- [ ] feature branch が Phase 4 で削除される
- [ ] delta spec が `openspec validate` を pass する
- [ ] `bun run typecheck && bun run test` が green

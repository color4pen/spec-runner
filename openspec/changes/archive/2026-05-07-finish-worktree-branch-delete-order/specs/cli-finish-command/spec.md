# cli-finish-command

## MODIFIED Requirements

### Requirement: `specrunner finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する

Phase 3 の merge コマンドから `--delete-branch` を除去し、feature branch の削除 SHALL Phase 4（worktree 解放後）に移動する。

Phase 3 は `gh pr merge <PR> --squash` を MUST 実行する（`--delete-branch` なし）。Phase 4 で worktree 削除後に `git branch -D <branch>` および `git push origin --delete <branch>` を MUST 実行する。branch 削除は best-effort とし、削除失敗（branch 不在、権限不足、GitHub auto-delete 済み等）は warning 出力のみで finish を fail させてはならない（SHALL NOT）。

#### Scenario: worktree ありの job で branch 削除が Phase 4 で実行される

- **WHEN** `specrunner finish <slug>` を実行し、job に worktreePath が設定されている
- **AND** Phase 3 の `gh pr merge --squash` が成功する
- **THEN** Phase 4 で worktree remove → prune → `git branch -D <branch>` → `git push origin --delete <branch>` → markJobArchived の順で実行される

#### Scenario: branch 削除失敗でも finish は成功する

- **WHEN** Phase 4 で `git branch -D <branch>` が non-zero を返す（branch が既に削除済み等）
- **THEN** stderr に warning を出力するが、finish は exit 0 で完走し markJobArchived が実行される

### Requirement: `specrunner finish --dry-run` は Phase 0 のみ実行し destructive op を一切呼ばない

stdout 出力の `merge-strategy` field SHALL `squash` と表示する（`squash+delete-branch` ではない）。

#### Scenario: dry-run の merge-strategy 表示

- **WHEN** `specrunner finish --dry-run` を実行する
- **THEN** stdout の `merge-strategy` field に `squash` と表示される

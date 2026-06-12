# archive / cancel の remote branch 削除を冪等にし、auto-delete 済み branch への偽 warning を消す

## Meta

- **type**: bug-fix
- **slug**: archive-branch-delete-idempotent
- **base-branch**: main
- **adr**: false

## 背景

GitHub の「merge 時に branch を自動削除」設定が有効な repo では、`job archive --with-merge` の Phase 2 が remote branch を削除しようとした時点で branch は既に存在しない。現状はこの「既に無い」を削除失敗と区別せず、すべての archive で `Warning: failed to delete remote branch <branch>.` が出力される（2026-06-12 の archive 8 件すべてで観測）。意図した最終状態（branch が無い）には到達しているため、これは偽 warning であり、真の失敗（認証・ネットワーク等）の warning を埋もれさせる。

## 現状コードの前提

- `src/core/archive/orchestrator.ts:308-311` — `git push origin --delete <branch>` の exitCode 非 0 を一律 warning にしている。stderr の内容（`remote ref does not exist` 等）を見ていない
- `src/core/cancel/runner.ts:194` — cancel 経路にも同型の warning がある（こちらは stderr を warning 文言に含めるが、不存在の区別はしていない）
- ローカル branch 削除（`git branch -D`、orchestrator.ts:304-307）は対象外（ローカルは archive 自身が管理しており不存在は実際に異常）

## 要件

1. remote branch 削除で「branch が既に存在しない」場合は成功扱いとし、warning を出さない（冪等化）。判別方法（stderr の判定 / 事前の `ls-remote` 確認等）は design で決定する
2. それ以外の失敗（認証・ネットワーク等）は従来通り warning を出す
3. archive と cancel の両経路に同じ意味論を適用する

## スコープ外

- ローカル branch 削除の挙動変更
- 削除失敗時のリトライ追加
- Phase 2 のその他の best-effort 処理（worktree 撤去・sidecar 削除）

## 受け入れ基準

- [ ] remote branch が既に存在しない場合に warning が出ず正常終了することをテストで固定する（archive / cancel 両経路）
- [ ] 不存在以外の削除失敗で従来通り warning が出ることをテストで固定する
- [ ] 削除成功経路が退行しないことをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 観測: 2026-06-12 の rebase-finish 8 件すべてで偽 warning（GitHub auto-delete 有効環境）

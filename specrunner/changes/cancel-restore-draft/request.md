# job cancel 時に request.md を drafts/ に戻すオプションを追加する

## Meta

- **type**: new-feature
- **slug**: cancel-restore-draft
- **base-branch**: main
- **adr**: false

## 背景

`job cancel` は worktree と branch を片付けるが、request.md は branch と共に消える（#465）。「やり直したい」ケースでは request を書き直すことになり、起票の成果物が失われる。cancel 時に request.md を drafts/ へ復元するオプションを追加する。

## 現状コードの前提

- cancel の実装は `src/core/cancel/runner.ts` にあり、request.md / drafts への言及は存在しない（復元処理なし）
- 起票物の正位置は `specrunner/drafts/<slug>/request.md`、実行中の正本は branch 上の `specrunner/changes/<slug>/request.md`
- drafts は tracked でも archive 時に削除が commit に畳まれる運用が確立している

## 要件

1. `job cancel` に `--restore-draft` オプションを追加する: cancel 処理の中で branch 上の `changes/<slug>/request.md` を読み、`drafts/<slug>/request.md` として main worktree に書き戻す（worktree 削除より前に読む）
2. 既定は現行どおり（復元しない）。drafts/<slug> が既に存在する場合は上書きしない（エラーでなく警告 + skip）
3. 復元された request.md がそのまま `run` で再起票可能であること

## スコープ外

- request.md 以外の artifacts（design / spec 等）の復元
- cancel の他の処理（PR close・worktree 削除）の変更
- 失敗学習の抽出

## 受け入れ基準

- [ ] `--restore-draft` 付き cancel 後、drafts/<slug>/request.md が存在し validate が通る
- [ ] オプションなしの cancel の挙動が現行と完全一致
- [ ] drafts に同名が既存の場合に上書きしない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（cancel フローへのオプション 1 つ）

---
refs #465
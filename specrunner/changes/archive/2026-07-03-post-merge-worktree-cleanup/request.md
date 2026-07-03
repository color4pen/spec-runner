# archive --with-merge の後片づけで worktree が削除されない（local 実行で worktreePath が常に null）

## Meta

- **type**: bug-fix
- **slug**: post-merge-worktree-cleanup
- **base-branch**: main
- **adr**: false

## 背景

`job archive --with-merge` が PR の merge まで成功した後、後片づけ（post-merge cleanup）で worktree が削除されず残り、続く feature ブランチ削除が「その worktree でチェックアウト中」を理由に失敗する。ユーザーに見えるのはブランチ削除の警告だけで、真の原因（worktree 残存）は警告されないため、原因と症状が逆に見える。v0.3.5 で確認。

## 現状コードの前提

<!-- 未検証の前提。design / request-review が実コードと突き合わせる。 -->

- `runPostMergeCleanup` は worktree の場所を job state 由来の `worktreePath` で受け取り、`null` なら worktree 削除ブロックごと黙ってスキップする（`src/core/archive/post-merge-cleanup.ts:25-26` に「Null → worktree cleanup skipped」と明記）
- 呼び出し側 `merge-then-archive.ts:151` は `state.worktreePath ?? null` の生読みで、フォールバック解決を持たない
- local 実行は `worktreePath` を job state に書かない（`src/state/schema.ts:273` で optional、`:482` で legacy state の欠落を許容）。そのため local ジョブでは常に `null` → worktree 削除が常にスキップされる
- 一方、archive コミットをブランチに記録する経路は `resolveWorktreePathForArchive`（state → liveness sidecar → 規約パスの三段フォールバック。`src/core/archive/orchestrator.ts:63-65`）で worktree を発見できており、`orchestrator.ts:132` で既に利用している。記録は成功し、掃除だけが失敗する
- cleanup は liveness sidecar を削除するため、フォールバック解決は sidecar 削除より前（state 読込時）に行う必要がある

## 要件

1. post-merge cleanup が worktree を確実に解決してから削除する。worktree パス解決を記録経路と対称化し、`state.worktreePath` が欠けていても sidecar / 規約パスから解決できること（`resolveWorktreePathForArchive` 相当の三段フォールバックを cleanup 経路でも使う）
2. フォールバック解決は liveness sidecar 削除より前に行う（順序を保証する）
3. worktree が実在するのに削除ブロックがスキップされる場合（`--no-worktree` モードを除く）は黙殺せず警告を出し、原因（worktree 残存）と症状（ブランチ削除失敗）の逆転を防ぐ

## スコープ外

- `--no-worktree` モードの意味論変更
- `resolveWorktreePathForArchive` 自体のフォールバック段の変更
- merge / archive の状態遷移そのものの変更

## 受け入れ基準

- [ ] local の worktree ジョブを pr-create まで完走させ `job archive <slug> --with-merge` した後、worktree と feature ブランチが削除されることを再現テストで固定する
- [ ] `state.worktreePath` が未設定でも sidecar / 規約パスから worktree が解決され削除されることをテストで固定する
- [ ] worktree 実在時に削除がスキップされた場合に警告が出ることをテストで固定する
- [ ] 既存テスト無変更で green / `typecheck` green / `lint` green / `build` 成功

## architect 評価済みの設計判断

TBD

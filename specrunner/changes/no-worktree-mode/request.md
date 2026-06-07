# `--no-worktree` モードで worktree を作らずに run / resume を実行する

## Meta

- **type**: spec-change
- **slug**: no-worktree-mode
- **base-branch**: main
- **adr**: true

## 背景

現在の `specrunner run` / `resume` は main worktree から `git worktree add` で隔離空間を作り、feature branch で作業する。この設計はローカル開発では有効だが、CI 環境では以下の問題がある：

- CI は使い捨ての checkout で、worktree の再利用に意味がない
- resume 時に前回の worktree を見つける必要がある（sidecar 依存、CI では sidecar が無い）
- CI runner が feature branch を checkout 済みで来る場合、worktree は不要

`--no-worktree` フラグを追加し、worktree を作らず cwd で直接 branch 操作する実行モードを提供する。CI は feature branch を checkout した状態で `specrunner run --no-worktree <slug>` / `specrunner resume --no-worktree <slug>` を呼ぶだけで動く。

前提：`resume-simplify` が merge 済みであること。

## 要件

1. `run` / `resume` コマンドに `--no-worktree` フラグを追加する。
2. `--no-worktree` 指定時、`setupWorkspace` が worktree を作成せず cwd をそのまま作業ディレクトリとして返す。run は base branch（main 等）の clean checkout 上で `git checkout -b` により feature branch を作成・切り替える。resume は既存 feature branch を checkout 済みの状態で呼ばれる前提。
3. `--no-worktree` 指定時、実行前に `git status --porcelain` で working tree が clean であることを要求する。未コミットの変更や untracked ファイルがあればエラーとする。
4. `--no-worktree` 指定時、job が no-worktree モードで実行されたことを後続の archive コマンド（別プロセス）から判別可能にする。具体的な永続化手段（state のフラグ等）は設計フェーズで決める。
5. `--no-worktree` 指定時、sidecar の worktreePath は null とする（worktree が無いため）。pid / jobId は通常通り記録する。
6. `--no-worktree` 指定時、exit-guard は worktree スキャン（`.git/specrunner-worktrees/`）に依存せず、cwd の state から直接 job を特定する。
7. `--no-worktree` 指定時、archive の Phase 2 のうち worktree remove/prune をスキップする（no-worktree フラグを要件4の手段で判別）。feature branch の削除（local + remote）は通常通り実施する。
8. worktree モード（デフォルト）の既存動作は変更しない。

## スコープ外

- `CI=true` 環境変数による自動判定（`--no-worktree` フラグの省略形として後日対応）
- branch 命名規則の変更（現行の `change/<slug>-<jobId>` を維持）
- CI workflow yaml のサンプル提供（別 request `ci-workflow-sample`）
- dispatcher / 開発ランナーの構築

## 受け入れ基準

- [ ] `specrunner run --no-worktree <slug>` が base branch の clean checkout 上で worktree を作成せず feature branch を作成・パイプラインを実行する
- [ ] `specrunner resume --no-worktree <slug>` が既存 feature branch の checkout 上で worktree を作成せずパイプラインを再開する
- [ ] no-worktree モードで実行された job を、後続の `job archive` が判別でき worktree remove/prune をスキップする
- [ ] `--no-worktree` で working tree が dirty な場合、エラーで停止する
- [ ] `--no-worktree` で実行した job の archive で worktree remove/prune がスキップされ、feature branch 削除は実施される
- [ ] `--no-worktree` で実行中にプロセス終了した場合、job が `awaiting-resume` に遷移し `specrunner resume --no-worktree <slug>` で再開できる
- [ ] worktree モード（フラグ無し）の既存テストが全て通る
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **worktree モードがデフォルト**：ローカルで人が使う場合、main を汚さない worktree モードが自然。`--no-worktree` は CI や「既に feature branch にいる」ケースのための opt-in。
- **clean working tree を前提条件に**：worktree は隔離空間なので dirty でも動くが、`--no-worktree` は隔離が無いため clean であることを要求する。CI は毎回 clean checkout なので自然に通る。
- **setupWorkspace の分岐で実装**：新規 RuntimeStrategy を作るのではなく、既存の `setupWorkspace` に「worktree を作らず cwd を返す」パスを追加する。パイプラインの各 step は `deps.cwd` で作業するだけなので、worktree の有無に依存しない。

# worktree 内からの run/finish/resume 実行を検出して拒否する

## Meta

- **type**: bug-fix
- **slug**: worktree-guard
- **base-branch**: main

## 背景

`specrunner finish` を worktree 内から実行すると、Phase 4 の `git worktree prune` で自分自身を削除しようとして ENOENT が発生する（PR #142, #145, #147 で確認）。worktree のライフサイクルは main が握るべきで、worktree 内のプロセスが自分の足元を操作するのは構造的に危険。

現状 `run` / `finish` / `resume` は全て `ps` で取得できる情報を参照して起動するため、worktree 内にいる必要がない。

## 要件

1. CLI エントリポイントで worktree 検出を追加する
   - `.git` がファイル（worktree）かディレクトリ（main）かで判定
2. `run` / `finish` / `resume` が worktree 内から実行された場合、エラーメッセージで拒否する
3. `ps` / `doctor` など読み取り専用コマンドは制限しない
4. エラーメッセージに main worktree での再実行方法を案内する

## スコープ外

- `finish` の `worktree prune` ロジック自体の修正
- 新規コマンドの追加

## 受け入れ基準

- [ ] worktree 内から `run` を実行するとエラーで拒否される
- [ ] worktree 内から `finish` を実行するとエラーで拒否される
- [ ] worktree 内から `resume` を実行するとエラーで拒否される
- [ ] `ps` / `doctor` は worktree 内からでも実行できる
- [ ] エラーメッセージが main worktree パスを案内する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

対象は `bin/specrunner.ts` または各コマンドの実装ファイル。`.git` の種別（file vs directory）で判定する。


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/worktree-guard.md` by `merged-to-archive-consolidation`.

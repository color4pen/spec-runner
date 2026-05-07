# worktree 内で request file を git add して finish の git mv を可能にする

## Meta

- **type**: spec-change
- **slug**: fix-request-file-staging-in-worktree

## 背景

`specrunner run` は worktree に request file を `fs.cp` でコピーするが `git add` しない。request file は untracked のまま残り、`specrunner finish` の `git mv specrunner/requests/active/<slug>/ → merged/` が「source directory is empty」で失敗する。

dogfood で毎回手動で `git add` + `git commit` + `git push` が必要だった。

## 要件

1. `src/cli/run.ts` の `fs.cp` の後に `git -C <worktreePath> add <relativeRequestPath>` を追加
2. worktree は detached HEAD だが `git add` は動作する。propose agent が `git checkout -b` でブランチを作成したとき、staged file が引き継がれて最初の commit に含まれる
3. delta spec として worktree 運用における request file の staging を spec に追加

## 受け入れ基準

- [ ] `specrunner run` 完了後、request file が feature branch にコミットされている
- [ ] `specrunner finish` の `git mv` が成功する
- [ ] delta spec が存在し `openspec validate` が pass する
- [ ] `bun run typecheck && bun run test` が green

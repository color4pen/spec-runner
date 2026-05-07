## Why

`specrunner run` は local runtime で worktree を作成し、request file を `fs.cp` でコピーするが `git add` しない。request file は worktree 内で untracked のまま残る。

propose agent が `git checkout -b <branch>` + `git commit` を実行しても、untracked file は commit に含まれない。結果として `specrunner finish` の `git mv specrunner/requests/active/<slug>/ → merged/` が「source is not tracked」で失敗する。

dogfooding で毎回手動で `git add` + `git commit` + `git push` が必要だった。

## What Changes

- `src/cli/run.ts` の `fs.cp` 直後に `git add` を追加し、request file を worktree の index に staging する
- staging された file は propose agent の最初の commit に自然に含まれる（detached HEAD → `git checkout -b` 時に index が引き継がれる）

## Capabilities

### Modified Capabilities

- `cli-commands`: `specrunner run` の worktree 統合に「request file の staging」要件を追加

## Impact

- **コード変更**: `src/cli/run.ts` の 1 箇所（`fs.cp` 後に `spawnCommand("git", ["add", ...])` を追加、import 追加）
- **リスク**: 低。`git add` は worktree 内で完結し、main cwd に影響しない
- **後方互換性**: managed runtime は worktree を使用しないため影響なし

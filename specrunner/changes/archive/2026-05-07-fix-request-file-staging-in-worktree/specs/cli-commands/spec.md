## MODIFIED Requirements

### Requirement: `specrunner run` は local runtime で worktree 内の request file を git staging する

`specrunner run` は `config.runtime === "local"` の場合、worktree への request file コピー（`fs.cp`）の直後に MUST `git add <relativeRequestPath>` を worktree 内で実行し、request file を git index に staging する。

staging された request file は propose agent が `git checkout -b <feature-branch>` を実行した際に index ごと引き継がれ、agent の最初の `git commit` に SHALL 含まれる。これにより `specrunner finish` の `git mv specrunner/requests/active/<slug>/ → merged/<slug>/` が tracked file に対して操作でき、正常に完了する。

`git add` が非ゼロ exit code で返った場合は MUST stderr にエラーを出力し exit code 1 で終了する（pipeline は開始しない）。

#### Scenario: request file が worktree で staging される

- **GIVEN** `config.runtime === "local"` で `specrunner run <request.md>` を実行する
- **WHEN** worktree が作成され request file が `fs.cp` でコピーされた直後
- **THEN** `git add <relativeRequestPath>` が worktree 内で実行される
- **AND** `git status --porcelain` の出力で request file が `A` (staged new file) として表示される

#### Scenario: staging された request file が feature branch の commit に含まれる

- **GIVEN** request file が worktree の git index に staging されている
- **WHEN** propose agent が `git checkout -b feat/<slug>` を実行し `git commit` する
- **THEN** commit に `specrunner/requests/active/<slug>/request.md` が含まれる
- **AND** `specrunner finish` の `git mv` が正常に完了する

#### Scenario: git add 失敗で pipeline を開始しない

- **GIVEN** `config.runtime === "local"` で worktree が作成されている
- **WHEN** `git add` が非ゼロ exit code で返る（例: 権限エラー）
- **THEN** stderr に `Error: Failed to stage request file` 相当のメッセージを出力する
- **AND** exit code 1 で終了し、pipeline は開始しない

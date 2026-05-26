## Renamed

- "`specrunner init` は `.gitignore` に `.specrunner/` を追記する" → "`specrunner init` は `.gitignore` に `.specrunner/*` + `!.specrunner/config.json` の 2 行を追記する"

## Requirements

### Requirement: `specrunner init` は `.gitignore` に `.specrunner/*` + `!.specrunner/config.json` の 2 行を追記する

`specrunner init` は config 保存後、CWD が git repository の場合に MUST `.gitignore` に `.specrunner/*` および `!.specrunner/config.json` の 2 行構成エントリを追記する。

- CWD が git repository か判定するには `git rev-parse --show-toplevel` の成否を使用する
- `.gitignore` に既に 2 行とも含まれている場合は SHALL no-op（冪等）
- 旧形式（`.specrunner/`）が存在する場合は SHALL `.specrunner/*` に書き換え、`!.specrunner/config.json` を追加する（自動 migration）
- CWD が git repository でない場合は SHALL スキップ（warning 不要）
- `.gitignore` が存在しない場合は SHALL 新規作成して 2 行を記載する

#### Scenario: 初回 init で .gitignore に追記

- **WHEN** CWD が git repo で `.specrunner` 関連エントリが含まれていない状態で `specrunner init` を実行する
- **THEN** `.gitignore` に `.specrunner/*` と `!.specrunner/config.json` の 2 行が追記される
- **AND** config 保存のメッセージも表示される

#### Scenario: 二度目の init で冪等

- **WHEN** `.gitignore` に既に `.specrunner/*` と `!.specrunner/config.json` が含まれている状態で `specrunner init` を実行する
- **THEN** `.gitignore` は変更されない

#### Scenario: 旧形式からの自動 migration

- **WHEN** `.gitignore` に旧形式 `.specrunner/` が含まれている状態で `specrunner init` を実行する
- **THEN** `.specrunner/` が `.specrunner/*` に書き換えられ、`!.specrunner/config.json` が追加される

#### Scenario: git repo 外での init

- **WHEN** CWD が git repository でない場所で `specrunner init` を実行する
- **THEN** config は正常に保存されるが `.gitignore` への追記はスキップされる

### Requirement: `specrunner run` は project mode 時に `.gitignore` を確保する

`specrunner run` は preflight 後、`config.jobs.location` が `"project"`（デフォルト）の場合に MUST `.gitignore` に `.specrunner/*` + `!.specrunner/config.json` の 2 行構成が存在することを確保する。

- 確保ロジックは `init` と同じ冪等関数を使用する
- `config.jobs.location === "xdg"` の場合は SHALL スキップ

#### Scenario: run 実行時に .gitignore が未設定

- **WHEN** `config.jobs.location` がデフォルト（project）で `.specrunner` 関連エントリが無い状態で `specrunner run` を実行する
- **THEN** `.gitignore` に `.specrunner/*` と `!.specrunner/config.json` が追記された後にパイプラインが開始する

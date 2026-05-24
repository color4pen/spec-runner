## Purpose

`specrunner` CLI のサブコマンド群（`init` / `login` / `run` / `ps` / `doctor` / `finish`）の振る舞い・引数・終了コード・stdout/stderr 出力を定義する。

## Requirements

### Requirement: `specrunner init` は `.gitignore` に `.specrunner/` を追記する

`specrunner init` は config 保存後、CWD が git repository の場合に MUST `.gitignore` に `.specrunner/` エントリを追記する。

- CWD が git repository か判定するには `git rev-parse --show-toplevel` の成否を使用する
- `.gitignore` に既に `.specrunner/` が含まれている場合は SHALL no-op（冪等）
- CWD が git repository でない場合は SHALL スキップ（warning 不要）
- `.gitignore` が存在しない場合は SHALL 新規作成して `.specrunner/` を記載する

#### Scenario: 初回 init で .gitignore に追記

- **WHEN** CWD が git repo で `.gitignore` に `.specrunner/` が含まれていない状態で `specrunner init` を実行する
- **THEN** `.gitignore` の末尾に `.specrunner/` が追記される
- **AND** config 保存のメッセージも表示される

#### Scenario: 二度目の init で冪等

- **WHEN** `.gitignore` に既に `.specrunner/` が含まれている状態で `specrunner init` を実行する
- **THEN** `.gitignore` は変更されない

#### Scenario: git repo 外での init

- **WHEN** CWD が git repository でない場所で `specrunner init` を実行する
- **THEN** config は正常に保存されるが `.gitignore` への追記はスキップされる

### Requirement: `specrunner run` は project mode 時に `.gitignore` を確保する

`specrunner run` は preflight 後、`config.jobs.location` が `"project"`（デフォルト）の場合に MUST `.gitignore` に `.specrunner/` エントリが存在することを確保する。

- 確保ロジックは `init` と同じ冪等 append を使用する
- `config.jobs.location === "xdg"` の場合は SHALL スキップ

#### Scenario: run 実行時に .gitignore が未設定

- **WHEN** `config.jobs.location` がデフォルト（project）で `.gitignore` に `.specrunner/` が無い状態で `specrunner run` を実行する
- **THEN** `.gitignore` に `.specrunner/` が追記された後にパイプラインが開始する

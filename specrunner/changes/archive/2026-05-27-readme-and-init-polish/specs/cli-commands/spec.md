## Requirements

### Requirement: `specrunner init` はプロジェクトディレクトリ構造を作成する

`specrunner init` は config 保存・`.gitignore` 設定後、CWD が git repository の場合に MUST `specrunner/drafts/` および `specrunner/changes/` ディレクトリを作成する。

- ディレクトリ作成は `mkdir -p` 相当（`recursive: true`）で冪等に行う SHALL
- CWD が git repository でない場合は SHALL スキップ（`.gitignore` 処理と同じガード）
- ディレクトリが既に存在する場合は SHALL no-op
- ディレクトリ作成の個別ログ出力は SHALL NOT 行う（init 全体の成功メッセージで十分）

#### Scenario: 初回 init でプロジェクトディレクトリが作成される

**Given** CWD が git repository で `specrunner/` ディレクトリが存在しない
**When** `specrunner init` を実行する
**Then** `specrunner/drafts/` と `specrunner/changes/` が作成される

#### Scenario: 二度目の init で冪等

**Given** CWD が git repository で `specrunner/drafts/` と `specrunner/changes/` が既に存在する
**When** `specrunner init` を実行する
**Then** 既存ディレクトリはそのまま維持され、エラーは発生しない

#### Scenario: git repo 外では作成しない

**Given** CWD が git repository でない
**When** `specrunner init` を実行する
**Then** config は正常に保存されるが `specrunner/` ディレクトリは作成されない

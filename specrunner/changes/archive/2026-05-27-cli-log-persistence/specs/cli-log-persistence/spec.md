## Purpose

pipeline ログの全 run 自動保存、agent session log の debug レベル保存、個数ベース retention を定義する。

## Requirements

### Requirement: pipeline ログは全 run/resume で自動保存される

全ての `run` / `resume` コマンド実行時に、pipeline レベルのログを `.specrunner/logs/<jobId>.log` に JSONL 形式で自動保存しなければならない（MUST）。ログレベルに関わらず常時書き込む。

記録対象イベント:
- step 開始 / 完了 / エラー（step 名、elapsed）
- verdict 結果
- pipeline 完了 / 失敗
- iteration 開始 / verdict / exhausted
- pipeline summary
- CLI step イベント

各行は `{ ts: ISO8601, type: string, ...payload }` の形式でなければならない（MUST）。

#### Scenario: default レベルで pipeline ログが保存される

- **WHEN** `specrunner run <slug>` をフラグなしで実行する
- **THEN** `.specrunner/logs/<jobId>.log` に JSONL 形式の pipeline ログが生成される
- **AND** step 遷移、verdict、pipeline 完了/失敗のイベントが記録される

#### Scenario: quiet レベルでも pipeline ログが保存される

- **WHEN** `specrunner run --quiet <slug>` を実行する
- **THEN** `.specrunner/logs/<jobId>.log` に JSONL 形式の pipeline ログが生成される（stderr 出力は抑制されるがファイル出力は行われる）

### Requirement: verbose エントリは verbose 以上でのみ追記される

verbose レベル以上（`-v` / `-vv`）では、既存の `logVerbose()` エントリも同一の `<jobId>.log` ファイルに追記される（SHALL）。default / quiet レベルでは pipeline-event 行のみが記録される。

#### Scenario: verbose レベルで 2 層ログが生成される

- **WHEN** `specrunner run -v <slug>` を実行する
- **THEN** `.specrunner/logs/<jobId>.log` に pipeline-event と verbose エントリの両方が時系列で混在する

### Requirement: agent session log は debug レベルで保存される

`SPECRUNNER_LOG_LEVEL=debug` または `-vv` フラグ指定時に、agent step の SDK message を `.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` に保存しなければならない（MUST）。

attempt は **1 始まり**で、同一 step の retry ごとにインクリメントする（初回実行は `1`、1 回目 retry は `2`、以降同様）。

記録内容:
- SDK message の type / content（assistant の text、tool_use、tool_result）
- session ID
- model 名、token 使用量

default / verbose レベルでは agent session log を保存してはならない（MUST NOT）。

#### Scenario: debug レベルで agent session log が保存される

- **WHEN** `specrunner run -vv <slug>` を実行する
- **AND** pipeline が implementer step を実行する
- **THEN** `.specrunner/logs/<jobId>/implementer-1.jsonl` に SDK message の JSONL が保存される
- **AND** session ID、model 名、token 使用量が記録される

#### Scenario: default レベルでは agent session log が保存されない

- **WHEN** `specrunner run <slug>` をフラグなしで実行する
- **THEN** `.specrunner/logs/<jobId>/` ディレクトリは作成されない

### Requirement: 個数ベース retention

`.specrunner/logs/` 配下の job ログを個数ベースで retention しなければならない（MUST）。

- デフォルト: 最新 20 job を保持
- `config.json` の `logs.maxJobs` で変更可能（範囲: 1-1000）
- 超過時は最古の job ログを削除する（`<jobId>.log` ファイルと `<jobId>/` ディレクトリの両方）
- retention チェックは run 開始時（pipeline ログ初期化前）に 1 回実行する
- retention チェックのエラーは warning として報告し、pipeline 実行はブロックしない

#### Scenario: 超過時に最古のログが削除される

- **WHEN** `.specrunner/logs/` に 22 個の job ログが存在し、`logs.maxJobs` が 20
- **AND** 新しい run を開始する
- **THEN** mtime が最古の 2 job のログファイル（`<jobId>.log`）とディレクトリ（`<jobId>/`）が削除される

#### Scenario: retention エラーは pipeline をブロックしない

- **WHEN** `.specrunner/logs/` の走査中にパーミッションエラーが発生する
- **THEN** stderr に warning が出力される
- **AND** pipeline 実行は正常に開始される

### Requirement: finish / cancel でも pipeline ログを出力する

finish / cancel コマンドでも pipeline ログを初期化し、主要イベント（開始、完了、エラー）を記録しなければならない（MUST）。

- finish: slug → jobId 解決後に初期化する
- cancel: jobId 解決後に初期化する（`--all-terminated` パスは対象外）
- doctor: job に紐づかない環境診断コマンドのため対象外とする（SHALL NOT）

#### Scenario: finish で pipeline ログが記録される

- **WHEN** `specrunner finish <slug>` を実行する
- **THEN** 解決された jobId の `.specrunner/logs/<jobId>.log` に finish の開始/完了イベントが JSONL で記録される

### Requirement: job show でログパスを表示する

`specrunner job show <slug>` の出力に `Log:` フィールドを含めなければならない（MUST）。

- ログファイルが存在する場合: repoRoot からの相対パスを表示する
- ログファイルが存在しない場合: `(none)` を表示する

#### Scenario: ログファイルが存在する場合

- **WHEN** `specrunner job show <slug>` を実行する
- **AND** 対応する `.specrunner/logs/<jobId>.log` が存在する
- **THEN** 出力に `Log:     .specrunner/logs/<jobId>.log` が含まれる

#### Scenario: ログファイルが存在しない場合

- **WHEN** `specrunner job show <slug>` を実行する
- **AND** 対応するログファイルが存在しない
- **THEN** 出力に `Log:     (none)` が含まれる

### Requirement: ログファイルは 0600 パーミッションで作成する

pipeline ログファイルおよび agent session log ファイルは `0600` 相当のパーミッションで作成しなければならない（MUST）。ログディレクトリは `0700` 相当のパーミッションで作成しなければならない（MUST）。agent session log は tool_result 経由でソースコードやシークレットを含む可能性があるため、所有者のみがアクセス可能でなければならない。

- `mkdirSync` でログディレクトリを作成する際は `mode: 0o700` を指定すること（execute bit が走査に必要）。
- `openSync` でファイルを開く際は `mode: 0o600` を指定すること。

#### Scenario: agent session log ファイルのパーミッションが 0600 である

- **WHEN** `specrunner run -vv <slug>` を実行する
- **AND** pipeline が agent step を実行する
- **THEN** 作成された `.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` のパーミッションが `0600` である（所有者のみ読み書き可）

#### Scenario: ログディレクトリのパーミッションが 0700 である

- **WHEN** `specrunner run -vv <slug>` を実行する
- **THEN** 作成された `.specrunner/logs/<jobId>/` ディレクトリのパーミッションが `0700` である（所有者のみ走査・読み書き可）

### Requirement: PipelineLogger は書き込みエラーで pipeline をブロックしない

`PipelineLogger` のファイル書き込みでエラーが発生した場合、fd を閉じて以降の書き込みを no-op にしなければならない（MUST）。pipeline の実行を阻害してはならない（MUST NOT）。

#### Scenario: 書き込みエラー後の回復

- **WHEN** pipeline ログファイルへの書き込み中にディスクフルエラーが発生する
- **THEN** fd が閉じられ、以降の書き込みは no-op になる
- **AND** pipeline の step 実行は正常に継続する

### Requirement: ログファイルにセンシティブ値を書き込まない

pipeline ログおよび agent session log の書き込み時に、`maskSensitive()` でセンシティブ値（API key、GitHub token 等）をマスクしなければならない（MUST）。

#### Scenario: API key がマスクされる

- **WHEN** verbose ログエントリに `sk-ant-xxxx` を含む文字列が書き込まれる
- **THEN** ログファイル上では `sk-ant-...` に置換される

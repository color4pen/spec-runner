## Purpose

`specrunner` CLI が管理するジョブ状態ファイルの保存先・スキーマ・書き込みアトミシティ・履歴管理・破損耐性を定義する。
## Requirements
### Requirement: ジョブ状態ファイルは固定パスに保存される

ジョブ状態ファイルは MUST `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/<jobId>.json` に保存される。`jobId` は SHALL uuid v4 形式の文字列である。

#### Scenario: XDG_DATA_HOME 未設定

- **WHEN** `XDG_DATA_HOME` が未設定で `HOME=~`
- **THEN** ファイルは `~/.local/share/specrunner/jobs/<uuid>.json` に作成される

#### Scenario: XDG_DATA_HOME 設定済み

- **WHEN** `XDG_DATA_HOME=/tmp/data`
- **THEN** ファイルは `/tmp/data/specrunner/jobs/<uuid>.json` に作成される

### Requirement: 状態ファイルは固定スキーマに従う

各状態ファイルは MUST 以下の必須フィールドを持つ JSON オブジェクトである: `version` (number)、`jobId` (string, uuid v4)、`createdAt` (ISO8601)、`updatedAt` (ISO8601)、`request` (`{ path, title, type }`)、`repository` (`{ owner, name }`)、`session` (`{ id, agentId, environmentId } | null`)、`step` (string、現在実行中の step。`"propose" | "spec-review"`)、`status` (`"running"` | `"success"` | `"failed"`)、`branch` (string | null)、`history` (Array<HistoryEntry>)、`error` (`{ code, hint, message }` | null)、`steps` (`Record<StepName, StepResult>`)。`steps` は SHALL 各 step ごとに `{ session: SessionInfo, verdict: "approved" | "needs-fix" | "escalation" | null, findingsPath: string | null, completedAt: ISO8601 | null, error: ErrorInfo | null }` を保持する。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。読み込み時に `steps` フィールドが欠落している場合、空オブジェクト `{}` で補う（既存の version: 1 状態ファイルとの後方互換）。

#### Scenario: 必須フィールド検証

- **WHEN** 状態ファイルを読み書きする
- **THEN** 必須フィールドのいずれかが欠ける場合、読み込み時に `STATE_FILE_INVALID` エラーを発生させ、当該ファイルをスキップする。ただし `steps` フィールドの欠落は SHALL `STATE_FILE_INVALID` を発生させず、空オブジェクトで補う

#### Scenario: steps フィールドの記録

- **WHEN** propose step が完了し spec-review step が完了した
- **THEN** state.steps に `propose` キーと `spec-review` キーが両方存在し、それぞれ session.id と completedAt が記録されている

#### Scenario: spec-review verdict の記録

- **WHEN** spec-review step が完了した
- **THEN** state.steps["spec-review"].verdict が `approved` / `needs-fix` / `escalation` のいずれかであり、findingsPath には `openspec/changes/<slug>/spec-review-result.md` が記録されている

### Requirement: 状態ファイル書き込みは atomic に行う

状態ファイルの書き込みは MUST `<path>.tmp.<random>` に書き込んだ後 `fs.rename` で正規パスに rename する。書き込み前に親ディレクトリを SHALL `mkdir -p` で作成する。

#### Scenario: 書き込み中の SIGINT

- **WHEN** CLI が状態ファイルへの書き込み中に SIGINT で終了する
- **THEN** 正規パスのファイルは前回の完全な状態を保持し、temp file が残ることがあっても本体ファイルは破損しない

#### Scenario: 並行 ps と書き込み

- **WHEN** `specrunner run` が状態ファイルを更新中に `specrunner ps` が同じファイルを読む
- **THEN** ps は古い完全な内容か、新しい完全な内容のどちらかを読み、部分書き込みを観測しない

### Requirement: 履歴は append-only で最大 100 entry まで保持する

`history` 配列は MUST append-only で、各 entry は SHALL `{ ts: ISO8601, step: string, status: "ok"|"warning"|"error"|"started", message: string }` の形式である。entry 数が 100 を超えたら先頭から truncate する。

#### Scenario: 通常の append

- **WHEN** 既存の history が 5 entry でステップ完了が記録される
- **THEN** history が 6 entry になる

#### Scenario: 100 entry を超える

- **WHEN** 100 entry の状態で 1 件 append する
- **THEN** 先頭の 1 entry が drop され、結果として 100 entry のままになる（最新が末尾）

### Requirement: 状態ファイルの enumeration は破損に耐える

`specrunner ps` が `jobs/` を走査する際、CLI は MUST JSON パース不可な、または必須フィールド欠落のファイルは skip し、stderr に `Skipping malformed file: <path>` を出力した上で SHALL 残りのファイル処理を継続する。

#### Scenario: 1 ファイルが破損

- **WHEN** ジョブディレクトリに 3 ファイルあり、1 ファイルが JSON パース不可
- **THEN** 残り 2 ファイルが正常に表示され、stderr に skip メッセージが 1 行出力される

### Requirement: 状態ファイルの step フィールドは実行中 step を指す

`state.step` は MUST 現在実行中の step 名を保持する。propose step 実行中は `"propose"`、spec-review step 実行中は `"spec-review"` である。step 完了後に runPipeline が次 step を起動する直前に SHALL `state.step` を更新する。

#### Scenario: step 遷移

- **WHEN** propose step が完了し spec-review step が起動された
- **THEN** state.step が `"propose"` から `"spec-review"` に更新され、history に `step-transition` entry が append される


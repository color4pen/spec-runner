## ADDED Requirements

### Requirement: ジョブ状態ファイルは固定パスに保存される

ジョブ状態ファイルは MUST `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/<jobId>.json` に保存される。`jobId` は SHALL uuid v4 形式の文字列である。

#### Scenario: XDG_DATA_HOME 未設定

- **WHEN** `XDG_DATA_HOME` が未設定で `HOME=~`
- **THEN** ファイルは `~/.local/share/specrunner/jobs/<uuid>.json` に作成される

#### Scenario: XDG_DATA_HOME 設定済み

- **WHEN** `XDG_DATA_HOME=/tmp/data`
- **THEN** ファイルは `/tmp/data/specrunner/jobs/<uuid>.json` に作成される

### Requirement: 状態ファイルは固定スキーマに従う

各状態ファイルは MUST 以下の必須フィールドを持つ JSON オブジェクトである: `version` (number)、`jobId` (string, uuid v4)、`createdAt` (ISO8601)、`updatedAt` (ISO8601)、`request` (`{ path, title, type }`)、`repository` (`{ owner, name }`)、`session` (`{ id, agentId, environmentId }`)、`step` (string、Phase 1 では `"propose"` 固定)、`status` (`"running"` | `"success"` | `"failed"`)、`branch` (string | null)、`history` (Array<HistoryEntry>)、`error` (`{ code, hint, message }` | null)。CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 必須フィールド検証

- **WHEN** 状態ファイルを読み書きする
- **THEN** 必須フィールドのいずれかが欠ける場合、読み込み時に `STATE_FILE_INVALID` エラーを発生させ、当該ファイルをスキップする

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

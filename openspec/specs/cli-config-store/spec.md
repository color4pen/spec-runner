## Purpose

Persist CLI authentication, agent IDs, and other config under the user's XDG config directory.

## Requirements
### Requirement: 設定ファイルは固定パスに保存される

設定ファイルは MUST `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/config.json` に保存される。CLI は SHALL このパス以外を config の正規ストアとして用いない。

#### Scenario: XDG_CONFIG_HOME 未設定

- **WHEN** `XDG_CONFIG_HOME` が未設定で `HOME=~`
- **THEN** ファイルパスは `~/.config/specrunner/config.json` になる

#### Scenario: XDG_CONFIG_HOME 設定済み

- **WHEN** `XDG_CONFIG_HOME=/tmp/cfg`
- **THEN** ファイルパスは `/tmp/cfg/specrunner/config.json` になる

### Requirement: 設定ファイルはパーミッション 0600 で保存される

config の作成・更新時、CLI は MUST ファイルパーミッションを `0600` に設定する。読み込み時にモードをチェックし、グループまたは other に読み権限がある場合は SHALL stderr に警告を出す（読み込み自体は継続）。

#### Scenario: 新規作成時のパーミッション

- **WHEN** `specrunner init` が config を新規作成する
- **THEN** ファイルパーミッションは 0600 で作成される

#### Scenario: 既存ファイルの権限が緩い

- **WHEN** 既存 config が 0644 で配置されている
- **THEN** stderr に `Warning: ~/.config/specrunner/config.json has loose permissions (recommend 0600).` を出力し、書き込み時には 0600 に修正する

> **Note**: `specrunner ps` は config を読み込むが書き込みを行わない read-only 経路である。ps 経路では permission の自動修正（`chmod 0600`）は行わない。これは意図的な設計であり、read-only 処理が副作用を持たないことを保証する。permission 修正が必要な場合は `specrunner init` または `specrunner login` の実行を促すこと。

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である: `version` (number, 1)、`anthropic.apiKey` (string)、`agent.id` (string)、`agent.definitionHash` (string)、`agent.lastSyncedAt` (ISO8601)、`environment.id` (string)、`environment.lastSyncedAt` (ISO8601)、`github.accessToken` (string)、`github.tokenObtainedAt` (ISO8601)、`github.scopes` (string[])。`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

#### Scenario: 不完全な config

- **WHEN** config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

### Requirement: 設定の更新は atomic に行う

config の書き込みは MUST `<path>.tmp.<random>` に書き込み後に rename する atomic write で行う。CLI は SHALL 部分書き込みされた config を残さない。

#### Scenario: 書き込み途中の異常終了

- **WHEN** init 中にプロセスが kill される
- **THEN** 既存の config は破損せず保持される

### Requirement: 機微情報は stdout に出力されない

`anthropic.apiKey` および `github.accessToken` は MUST CLI の通常出力（stdout）に出力されてはならない。デバッグログでも SHALL マスク（先頭 6 文字 + `...`）が必須である。

#### Scenario: init 完了メッセージ

- **WHEN** `specrunner init` が完了する
- **THEN** stdout に `apiKey` の生値が一切含まれず、`API key configured (sk-ant-...).` のようなマスク表記のみ含まれる

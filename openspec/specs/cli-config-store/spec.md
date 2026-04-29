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

設定ファイルは MUST 以下の構造を持つ JSON である: `version` (number, 1)、`anthropic.apiKey` (string)、`agents.propose` (`{ id, definitionHash, lastSyncedAt }`)、`agents.specFixer` (`{ id, definitionHash, lastSyncedAt }`)、`agent.id` (string、deprecated だが backward compat のため必須維持)、`agent.definitionHash` (string、deprecated)、`agent.lastSyncedAt` (ISO8601、deprecated)、`environment.id` (string)、`environment.lastSyncedAt` (ISO8601)、`github.accessToken` (string)、`github.tokenObtainedAt` (ISO8601)、`github.scopes` (string[])、`pipeline.maxRetries` (number、既定 2)。`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

`agents.specReview` フィールドは SHALL 将来の spec-review 専用 Agent 化に備えた予約キーとして許容するが、本 request では未使用（spec-review は引き続き propose Agent と異なる文脈で運用、専用 Agent 化は別 request）。読み込み時に存在しても無視される。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 不完全な config（apiKey 欠落）

- **WHEN** config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

#### Scenario: spec-fixer Agent ID 欠落

- **WHEN** `specrunner run` 実行時に `config.agents.specFixer.id` が無く、かつ legacy `agent.id` のみ存在する
- **THEN** propose ロールは legacy `agent.id` でフォールバックするが、spec-fixer ロールは `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-fixer agent.` を返す

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

### Requirement: ロール解決はフォールバックチェーンに従う

CLI は MUST `getAgentId(config, role)` ヘルパを提供する。`role` は `"propose" | "specFixer" | "specReview"` のいずれかである。解決順は以下:

1. `config.agents[role].id` が存在し非空文字列 → それを返す
2. role が `"propose"` で `config.agent.id` が存在 → それを返す（legacy fallback）
3. それ以外 → `CONFIG_INCOMPLETE` エラーを throw する

#### Scenario: propose ロールの新形式

- **WHEN** `config.agents.propose.id = "agent_01x"` かつ `config.agent.id = "agent_01x"`
- **THEN** `getAgentId(config, "propose")` は `"agent_01x"` を返す

#### Scenario: propose ロールの legacy フォールバック

- **WHEN** `config.agents.propose.id` が未設定で `config.agent.id = "agent_01x"`
- **THEN** `getAgentId(config, "propose")` は `"agent_01x"` を返す

#### Scenario: spec-fixer ロールで legacy fallback は不可

- **WHEN** `config.agents.specFixer.id` が未設定で `config.agent.id = "agent_01x"`
- **THEN** `getAgentId(config, "specFixer")` は `CONFIG_INCOMPLETE` エラーを throw する

### Requirement: `pipeline.maxRetries` は iteration loop の上限値である

`config.pipeline.maxRetries` は MUST `runLoopUntil` の `maxIterations` に渡される正整数である。値は SHALL 1 以上 10 以下に制約され、範囲外は `CONFIG_INVALID` エラーで拒絶される。未設定時は SHALL 既定値 2 を採用する。

#### Scenario: 既定値の採用

- **WHEN** `config.pipeline.maxRetries` が未設定
- **THEN** `runPipeline` は loop プリミティブに `maxIterations: 2` を渡す

#### Scenario: 範囲外の値

- **WHEN** `config.pipeline.maxRetries = 0` で config 読み込みを試みる
- **THEN** `CONFIG_INVALID` エラーで `pipeline.maxRetries must be between 1 and 10.` を返す

### Requirement: config 書き込みは新形式と legacy 形式を両方更新する

`specrunner init` が config を書き込む際、CLI は MUST `agents.propose` と `agent`（legacy）の両方に同じ propose Agent ID / definitionHash / lastSyncedAt を書き込む。これは SHALL 旧コードパスとの互換のため。`agents.specFixer` は新規追加であり、legacy 互換キーは存在しない。

#### Scenario: 新形式と legacy の同期

- **WHEN** `specrunner init` が propose Agent を新規作成し ID `agent_01x` を得る
- **THEN** config 書き込み後、`config.agents.propose.id === config.agent.id === "agent_01x"` が成立する


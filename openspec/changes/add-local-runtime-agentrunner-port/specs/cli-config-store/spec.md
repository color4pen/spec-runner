## ADDED Requirements

### Requirement: 設定ファイルは runtime field を保持する

config schema は MUST top-level に `runtime: "managed" | "local"` field を持つ。値は SHALL `"managed"` または `"local"` のみ許容され、それ以外は `CONFIG_INVALID` エラーで拒絶される。未設定の既存 config は `ConfigStore.load()` の migration で MUST `"managed"` に正規化される（idempotent）。

`runtime === "local"` の場合、`anthropic.apiKey` および `agents` map は MUST 空のままでもよく、CLI は SHALL この欠落を許容する。`runtime === "managed"` の場合は既存挙動通り `anthropic.apiKey` および `agents` の各 entry が必要である。

#### Scenario: managed runtime の正常 load

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "managed", "anthropic": { "apiKey": "sk-..." }, "agents": { "propose": {...} } }` を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime === "managed"` である
- **AND** load は success である

#### Scenario: local runtime の正常 load

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "local" }` のみを持つ（apiKey も agents も無い）
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime === "local"` である
- **AND** `config.anthropic.apiKey` 不在で `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** `config.agents` は空オブジェクトのまま

#### Scenario: runtime field 未設定の既存 config

- **GIVEN** config ファイルが `runtime` field を持たない（本 change 適用前の形式）
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime` は `"managed"` に正規化される
- **AND** `ConfigStore.save()` 後の永続 JSON にも `runtime: "managed"` が書き込まれる

#### Scenario: 不正な runtime 値

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "remote" }` を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーで `runtime must be "managed" or "local".` を返す

### Requirement: local runtime では apiKey 不在を許容する

`config.runtime === "local"` の場合、CLI は MUST `anthropic.apiKey` の存在チェックを skip する。`getAgentId(config, role)` 系の解決路は SHALL `runtime === "managed"` のときにのみ呼ばれる経路となる（呼び出し側 = CLI composition root の責務）。

#### Scenario: local runtime で apiKey 不在でも run できる

- **GIVEN** `config.runtime === "local"` で `config.anthropic.apiKey` が空である
- **WHEN** `specrunner run` を実行する
- **THEN** `CONFIG_INCOMPLETE` で startup が止まることはない
- **AND** Anthropic API への HTTP リクエストは pipeline 中に発生しない（pr-create の GitHub API は別系統）

#### Scenario: managed runtime では apiKey 必須が継続する

- **GIVEN** `config.runtime === "managed"` で `config.anthropic.apiKey` が空である
- **WHEN** `ConfigStore.load()` を呼ぶ、または `specrunner run` を実行する
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' first.` を返す（既存挙動）

## MODIFIED Requirements

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`。将来の schema bump に備えて `number` 型で宣言するが、現時点での有効値は `1` のみ。未知の version 値を読み込んだ場合は `CONFIG_INVALID` エラーを throw する)
- `runtime` (string, `"managed"` または `"local"`、未設定時は `"managed"` に正規化される)
- `anthropic.apiKey` (string、`runtime === "local"` のときは空でも許容)
- `agents` (`Record<StepName, AgentRecord>`) — Step 名をキーとする単一マップ。各 `AgentRecord` は `{ agentId: string, definitionHash: string, lastSyncedAt: ISO8601 }`。`runtime === "local"` のときは空オブジェクトでも許容
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `github.accessToken` (string)
- `github.tokenObtainedAt` (ISO8601)
- `github.scopes` (string[])
- `pipeline.maxRetries` (number、既定 2)

`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

`agents` マップは MUST `Record<StepName, AgentRecord>` の単一マップであり、Step 名（`"propose"`, `"spec-review"`, `"spec-fixer"` など）をキーとする。固定キー型 `agents.propose` / `agents.specReview` / `agents.specFixer` を持つ中間スキーマは廃止される。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 不完全な config（apiKey 欠落、managed runtime）

- **WHEN** `runtime === "managed"` の config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: 不完全な config（apiKey 欠落、local runtime は許容）

- **WHEN** `runtime === "local"` の config に `anthropic.apiKey` が無い
- **THEN** 読み込みは success で `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** in-memory `config.anthropic.apiKey` は空文字列または undefined のまま保持される

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

#### Scenario: spec-review Agent ID 欠落（managed runtime のみ）

- **WHEN** `runtime === "managed"` で `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-review agent.` を返す

#### Scenario: spec-review Agent ID 欠落（local runtime は許容）

- **WHEN** `runtime === "local"` で `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** ClaudeCodeRunner 経由で spec-review step が実行される

#### Scenario: agents マップが単一形である

- **GIVEN** `specrunner init` 完了後の config
- **WHEN** JSON を確認する
- **THEN** `config.agents` は `Record<StepName, AgentRecord>` 形である
- **AND** `config.agent`（旧 単数形）は存在しない
- **AND** `config.agents` の固定キー型（`propose` / `specReview` / `specFixer` のみを持つ型）ではなく、任意の StepName をキーとして許容する形である

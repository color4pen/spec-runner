## Requirements

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`)
- `runtime` (string, `"managed"` または `"local"`)
- `agents` (`Record<StepName, AgentRecord>`)
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `pipeline.maxRetries` (number)
- `steps` (`StepConfigMap`, optional) — Step 実行パラメータの外部設定。以下の構造を持つ:
  - `steps.defaults` (`StepExecutionConfig`, optional) — 全 step に適用されるデフォルト値
  - `steps.<stepName>` (`StepExecutionConfig`, optional) — 特定 step のオーバーライド値
  - `StepExecutionConfig` は以下のフィールドを持つ:
    - `model` (string, optional) — 使用する model 名（例: `"claude-opus-4-6[1m]"`）
    - `maxTurns` (number | null, optional) — 最大ターン数。`null` は unlimited を意味する
    - `timeoutMs` (number | null, optional) — タイムアウト（ミリ秒）。`null` は no timeout を意味する
    - `byRequestType` (`Record<string, StepExecutionConfig>`, optional) — request type ごとの override。key は request type 名（`"bug-fix"` / `"spec-change"` / `"new-feature"` 等）、value は `StepExecutionConfig`（ただし `byRequestType` のネストは MUST 禁止、1 階層のみ）
- `progress` (`ProgressConfig`, optional)
- `models` (`ModelsConfig`, optional)
- `verification` (`VerificationConfig`, optional) — verification step の実行方法を設定。以下の構造を持つ:
  - `verification.commands` (`(string | { name?: string; run: string })[]`, optional) — 順次実行する command 配列。各 command は `sh -c` 経由で実行される。fail-fast（1 件失敗で残り skip）。未定義時は既存の phase 検出 fallback（`package.json` script → `bun run`）を使用する
- `github` (`GitHubHostConfig`, optional) — GitHub host 設定。以下の構造を持つ:
  - `github.host` (string, optional) — GitHub ホスト名。既定 `"github.com"`。GHES 等の別ホストを指定する
  - `github.apiBaseUrl` (string, optional) — GitHub REST API の base URL。未設定時は `host` から導出する（`github.com` → `https://api.github.com`、それ以外 → `https://{host}/api/v3`）。設定時は host からの導出より優先する。MUST `https://` で始まる非空文字列

`jobs` section は廃止された。旧 config に `jobs` section が残っていても SHALL 未知 field として無視される（error にならない）。`JobsConfig` 型は削除される。

#### Scenario: jobs section が残っていても無視される

- **WHEN** 既存の config file に `{ "jobs": { "location": "xdg" } }` が含まれている
- **THEN** config load は成功し、jobs section は無視される
- **AND** CLI は常に `<repo-root>/.specrunner/` をジョブ格納先として使用する

#### Scenario: byRequestType を含む steps 設定が読み込まれる

- **GIVEN** config に以下が設定されている:
  ```json
  { "steps": { "design": { "model": "claude-opus-4-6[1m]", "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }
  ```
- **WHEN** config を読み込む
- **THEN** `config.steps.design.byRequestType["bug-fix"].model` は `"claude-sonnet-4-6"` である

#### Scenario: byRequestType 未設定の後方互換

- **GIVEN** 既存の config に `byRequestType` が含まれない steps 設定がある
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了する

#### Scenario: github.host の設定

- **GIVEN** config に `{ "github": { "host": "ghes.corp.example.com" } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.github.host` は `"ghes.corp.example.com"` である

#### Scenario: github.apiBaseUrl の設定

- **GIVEN** config に `{ "github": { "apiBaseUrl": "https://custom-proxy.example.com/gh" } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.github.apiBaseUrl` は `"https://custom-proxy.example.com/gh"` である

#### Scenario: github セクション未設定の後方互換

- **GIVEN** 既存の config に `github` セクションが含まれない
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了する（github は undefined）

#### Scenario: github.host が空文字の場合

- **GIVEN** config に `{ "github": { "host": "" } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `CONFIG_INVALID` エラーが発生する

#### Scenario: github.apiBaseUrl が https:// で始まらない場合

- **GIVEN** config に `{ "github": { "apiBaseUrl": "http://insecure.example.com" } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `CONFIG_INVALID` エラーが発生する

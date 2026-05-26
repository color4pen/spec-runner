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
- **AND** 既存の step config resolution（4 レベル）と同等の挙動が維持される

#### Scenario: verification.commands を含む config が読み込まれる

- **GIVEN** config に以下が設定されている:
  ```json
  { "verification": { "commands": ["bun run build", "bun run test", { "name": "lint", "run": "eslint ./src" }] } }
  ```
- **WHEN** config を読み込む
- **THEN** `config.verification.commands` は 3 要素の配列として取得される

#### Scenario: verification section なしの後方互換

- **GIVEN** 既存の config に `verification` section が含まれない
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了する
- **AND** `config.verification` は `undefined` である

### Requirement: verification config の値は型と形式が検証される

`validateConfig()` は MUST `verification` section が存在する場合、以下のルールで検証する:

- `verification`: object 型であること。違反時は `CONFIG_INVALID` エラーを throw する
- `verification.commands`: array 型であること。違反時は `CONFIG_INVALID` エラーを throw する
- 各 commands element: string（非空）または object（`run` が非空 string、`name` は optional string）であること。違反時は `CONFIG_INVALID` エラーを throw する

未指定（`undefined` / JSON でキーが不在）の `verification` section は SHALL 検証をスキップする。

error message には MUST 問題の key path が含まれる（例: `CONFIG_INVALID: verification.commands[2].run must be a non-empty string`）。

#### Scenario: valid な verification.commands が検証を通過する

- **GIVEN** config に `{ "verification": { "commands": ["bun run build", { "run": "bun run test" }, { "name": "lint", "run": "eslint ./src" }] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: verification section なしで検証通過

- **GIVEN** config に `verification` section が存在しない
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: commands が array でない場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": "not-an-array" } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: commands element に空文字列がある場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": [""] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: commands element の run が空文字列の場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": [{ "run": "" }] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `verification.commands[0].run` が含まれる

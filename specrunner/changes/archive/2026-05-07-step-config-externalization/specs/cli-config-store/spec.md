## MODIFIED Requirements

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`。将来の schema bump に備えて `number` 型で宣言するが、現時点での有効値は `1` のみ。未知の version 値を読み込んだ場合は `CONFIG_INVALID` エラーを throw する)
- `anthropic.apiKey` (string)
- `agents` (`Record<StepName, AgentRecord>`) — Step 名をキーとする単一マップ。各 `AgentRecord` は `{ agentId: string, definitionHash: string, lastSyncedAt: ISO8601 }`
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `github.accessToken` (string)
- `github.tokenObtainedAt` (ISO8601)
- `github.scopes` (string[])
- `pipeline.maxRetries` (number、既定 2)
- `steps` (`StepConfigMap`, optional) — Step 実行パラメータの外部設定。以下の構造を持つ:
  - `steps.defaults` (`StepExecutionConfig`, optional) — 全 step に適用されるデフォルト値
  - `steps.<stepName>` (`StepExecutionConfig`, optional) — 特定 step のオーバーライド値
  - `StepExecutionConfig` は以下のフィールドを持つ:
    - `model` (string, optional) — 使用する model 名（例: `"claude-opus-4-6[1m]"`）
    - `maxTurns` (number | null, optional) — 最大ターン数。`null` は unlimited を意味する
    - `timeoutMs` (number | null, optional) — タイムアウト（ミリ秒）。`null` は no timeout を意味する。現時点では config 定義のみで未使用

`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

`agents` マップは MUST `Record<StepName, AgentRecord>` の単一マップであり、Step 名（`"propose"`, `"spec-review"`, `"spec-fixer"` など）をキーとする。固定キー型 `agents.propose` / `agents.specReview` / `agents.specFixer` を持つ中間スキーマは廃止される。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 不完全な config（apiKey 欠落）

- **WHEN** config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

#### Scenario: spec-review Agent ID 欠落

- **WHEN** `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-review agent.` を返す

#### Scenario: agents マップが単一形である

- **GIVEN** `specrunner init` 完了後の config
- **WHEN** JSON を確認する
- **THEN** `config.agents` は `Record<StepName, AgentRecord>` 形である
- **AND** `config.agent`（旧 単数形）は存在しない
- **AND** `config.agents` の固定キー型（`propose` / `specReview` / `specFixer` のみを持つ型）ではなく、任意の StepName をキーとして許容する形である

#### Scenario: steps セクション未設定の後方互換

- **GIVEN** 既存の config に `steps` セクションが存在しない
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了し、`config.steps` は `undefined` である
- **AND** 既存の動作（step 定義のハードコード値を使用）が維持される

#### Scenario: steps.defaults で全 step のデフォルトを設定

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-opus-4-6[1m]", "maxTurns": null } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.steps.defaults.model` は `"claude-opus-4-6[1m]"` である
- **AND** `config.steps.defaults.maxTurns` は `null`（unlimited）である

#### Scenario: step 個別設定がデフォルトを上書きする

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": 30 }, "implementer": { "maxTurns": 100 } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.steps.implementer.maxTurns` は `100` である
- **AND** `config.steps.defaults.maxTurns` は `30` である

## ADDED Requirements

### Requirement: step 実行パラメータの解決順序

CLI は MUST `getStepExecutionConfig(config, stepName, stepDefaults)` ヘルパを提供する。解決順は以下:

1. `config.steps?.[stepName]?.[field]` が `undefined` でない → その値を使用
2. `config.steps?.defaults?.[field]` が `undefined` でない → その値を使用
3. `stepDefaults[field]` が `undefined` でない → その値を使用（step 定義のハードコード値）
4. フィールド固有のフォールバック: `model` は step 定義の値が必ず存在するため到達しない。`maxTurns` は `undefined` のまま（SDK 側で unlimited）。`timeoutMs` は `null`（no timeout）

解決時、`null` は SHALL 有効値として扱われる（「制限なし」を明示的に指定）。`undefined`（JSON でキーが不在）のみが「未設定、次の fallback に進む」を意味する。

`ResolvedStepConfig` は MUST 以下の型を持つ:
- `model: string` — 必ず解決済み
- `maxTurns: number | null` — `null` = unlimited
- `timeoutMs: number | null` — `null` = no timeout

#### Scenario: config step-level が最優先で解決される

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6" }, "propose": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-opus-4-6[1m]"` である
- **WHEN** `getStepExecutionConfig(config, "propose", { model: "claude-opus-4-6[1m]" })` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（config step-level の値）である

#### Scenario: config defaults が step 定義より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `60` である
- **AND** `config.steps.implementer` は未設定
- **WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-sonnet-4-6", maxTurns: 60 })` を呼ぶ
- **THEN** `resolved.maxTurns` は `null`（unlimited、config defaults の値）である

#### Scenario: config 未設定時は step 定義のハードコード値を使用

- **GIVEN** config に `steps` セクションが存在しない
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` で maxTurns が `30` である
- **WHEN** `getStepExecutionConfig(config, "spec-fixer", { model: "claude-sonnet-4-6", maxTurns: 30 })` を呼ぶ
- **THEN** `resolved.model` は `"claude-sonnet-4-6"` である
- **AND** `resolved.maxTurns` は `30` である

#### Scenario: null は有効値として解決される

- **GIVEN** config に `{ "steps": { "implementer": { "maxTurns": null } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `60` である
- **WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-sonnet-4-6", maxTurns: 60 })` を呼ぶ
- **THEN** `resolved.maxTurns` は `null`（unlimited）である
- **AND** step 定義の `60` は使用されない

#### Scenario: timeoutMs のデフォルトは null

- **GIVEN** config に `steps` セクションが存在しない
- **WHEN** `getStepExecutionConfig(config, "propose", { model: "claude-opus-4-6[1m]" })` を呼ぶ
- **THEN** `resolved.timeoutMs` は `null`（no timeout）である

### Requirement: specrunner init --runtime=local は steps.defaults を生成する

`specrunner init --runtime=local` は MUST config に `steps` セクションが存在しない場合、以下の `steps.defaults` を追加する:

```json
{
  "steps": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "maxTurns": null,
      "timeoutMs": null
    }
  }
}
```

既存 config に `steps` セクションが既に存在する場合は SHALL 上書きしない。

#### Scenario: 新規 init で steps.defaults が生成される

- **GIVEN** config ファイルが存在しない
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** 生成された config に `steps.defaults` が含まれる
- **AND** `steps.defaults.model` は `"claude-sonnet-4-6"` である
- **AND** `steps.defaults.maxTurns` は `null` である
- **AND** `steps.defaults.timeoutMs` は `null` である

#### Scenario: 既存 config に steps がない場合に追加される

- **GIVEN** 既存 config に `steps` セクションが存在しない
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** config に `steps.defaults` が追加される
- **AND** 既存の他のフィールド（agents, github 等）は保持される

#### Scenario: 既存 config に steps がある場合は上書きしない

- **GIVEN** 既存 config に `{ "steps": { "defaults": { "maxTurns": 50 } } }` が設定されている
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** `config.steps.defaults.maxTurns` は `50` のまま変更されない

### Requirement: steps config の値は型と範囲が検証される

`validateConfig()` は MUST `steps` セクションが存在する場合、各 `StepExecutionConfig` のフィールドを以下のルールで検証する:

- `model`: `string` 型かつ空文字列でないこと。違反時は `CONFIG_INVALID` エラーを throw する
- `maxTurns`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する
- `timeoutMs`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する

未指定（`undefined` / JSON でキーが不在）のフィールドは SHALL 検証をスキップする（解決順序で後続の fallback に委ねる）。

検証は `steps.defaults` および `steps.<stepName>` の全エントリに対して適用される。

> **Note**: `steps` のキー名（step 名）自体の存在検証は本 change では対象外とする。存在しない step 名はサイレントに無視される（将来 `specrunner doctor` で検証可能にする）。

#### Scenario: maxTurns に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": -1 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: maxTurns に 0 を設定した場合

- **GIVEN** config に `{ "steps": { "implementer": { "maxTurns": 0 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: maxTurns に文字列を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": "unlimited" } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: model に空文字列を設定した場合

- **GIVEN** config に `{ "steps": { "propose": { "model": "" } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: timeoutMs に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "timeoutMs": -500 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: null は有効値として検証を通過する

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null, "timeoutMs": null } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: 未指定フィールドは検証をスキップする

- **GIVEN** config に `{ "steps": { "implementer": { "model": "claude-opus-4-6[1m]" } } }` が設定されている（maxTurns と timeoutMs は未指定）
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

### Requirement: steps config は local runtime でのみ効果を持つ

`config.steps` の設定は SHALL `runtime: "local"`（ClaudeCodeRunner）でのみ step 実行パラメータに反映される。`runtime: "managed"`（ManagedAgentRunner）では `config.steps` は読み込まれるが step 実行には適用されない（Managed Agents API が session 単位の model / maxTurns 変更をサポートしないため）。

config の読み込み・validation 自体は runtime に関わらず実行される（steps セクションの型・範囲検証は managed runtime でも適用される）。

> **Note**: managed runtime で steps を設定してもエラーにはならないが、設定は step 実行に反映されない。将来 Managed Agents API が対応した場合に拡張する。

#### Scenario: managed runtime で steps 設定が存在しても読み込みは成功する

- **GIVEN** config に `runtime: "managed"` と `{ "steps": { "defaults": { "maxTurns": 100 } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了し、`config.steps.defaults.maxTurns` は `100` である
- **AND** ManagedAgentRunner は `config.steps` を参照せず、agent 定義の値を使用する

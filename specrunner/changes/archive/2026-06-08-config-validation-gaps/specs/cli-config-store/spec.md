## ADDED Requirements

### Requirement: validateConfig は型付き全フィールドの shape を検証する

`validateConfig` は MUST `SpecRunnerConfig` interface で型を持つフィールドのうち、これまで未検証だった `agents` / `environment` / `specReview.pollIntervalMs` と、`pipeline` のオブジェクト型ガードを検証する。検証は既存の手書き validator パターンに従い、違反時は `code: "CONFIG_INVALID"` を持つ Error を throw する。

各フィールドは optional であり、SHALL **存在する場合にのみ**検証される（未設定は後方互換のため常に通す）。

- `agents`（`Partial<Record<AgentStepName, AgentRecord>>`）: 値が存在する場合、object であり、各エントリ値が object かつ `agentId` / `definitionHash` / `lastSyncedAt` がすべて string であること。空 object `{}` および key 欠落は valid。
- `environment`（`EnvironmentConfig`）: 存在する場合、object であり `id` / `lastSyncedAt` が string であること。
- `specReview.pollIntervalMs`（number）: 存在する場合、正の整数（`>= 1`）であること（既存 `archive.mergeWaitPollIntervalMs` と同一パターン）。
- `pipeline`（`PipelineConfig`）: 存在する場合、object であること。非 object（`"fast"` 等）は `CONFIG_INVALID`。この型ガードは既存 `maxRetries` チェックより前に評価される。

`validateConfig` の最終 cast（`return raw as SpecRunnerConfig`）構造の解消はスコープ外。本 requirement は未検証フィールドの shape 検証のみを追加する。

#### Scenario: agents のエントリが不正な shape

- **GIVEN** config に `{ "agents": { "design": { "agentId": 123, "definitionHash": "h", "lastSyncedAt": "2026-01-01T00:00:00.000Z" } } }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: agents が空 object

- **GIVEN** config に `{ "agents": {} }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** throw されない（local runtime で agents 未構成は valid）

#### Scenario: environment の id が非 string

- **GIVEN** config に `{ "environment": { "id": 1, "lastSyncedAt": "2026-01-01T00:00:00.000Z" } }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: specReview.pollIntervalMs が 0 または負数

- **GIVEN** config に `{ "specReview": { "pollIntervalMs": 0 } }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: specReview.pollIntervalMs が正の整数

- **GIVEN** config に `{ "specReview": { "pollIntervalMs": 10000 } }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** throw されない

#### Scenario: pipeline が非 object

- **GIVEN** config に `{ "pipeline": "fast" }` が設定されている
- **WHEN** `validateConfig` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: 未設定フィールドの後方互換

- **GIVEN** 既存の valid な config に `agents` / `environment` / `specReview` が含まれない、あるいは正しい値を持つ
- **WHEN** `validateConfig` を呼ぶ
- **THEN** throw されない（既存挙動を維持）

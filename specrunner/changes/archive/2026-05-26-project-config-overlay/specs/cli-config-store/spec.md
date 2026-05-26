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

### Requirement: 設定ファイルは固定パスに保存される

設定ファイルは MUST `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/config.json` (user global) に保存される。CLI は SHALL このパス以外を user global config の正規ストアとして用いない。

#### Scenario: XDG_CONFIG_HOME 未設定

- **WHEN** `XDG_CONFIG_HOME` が未設定で `HOME=~`
- **THEN** user global ファイルパスは `~/.config/specrunner/config.json` になる

#### Scenario: XDG_CONFIG_HOME 設定済み

- **WHEN** `XDG_CONFIG_HOME=/tmp/cfg`
- **THEN** user global ファイルパスは `/tmp/cfg/specrunner/config.json` になる

### Requirement: step 実行パラメータの解決順序

CLI は MUST `getStepExecutionConfig(config, stepName, stepDefaults, requestType?)` ヘルパを提供する。解決順は以下:

1. `config.steps?.[stepName]?.byRequestType?.[requestType]?.[field]` が `undefined` でない → その値を使用（type 別 step level）
2. `config.steps?.[stepName]?.[field]` が `undefined` でない → その値を使用（step level）
3. `config.steps?.defaults?.byRequestType?.[requestType]?.[field]` が `undefined` でない → その値を使用（type 別 default）
4. `config.steps?.defaults?.[field]` が `undefined` でない → その値を使用（global default）
5. `stepDefaults[field]` が `undefined` でない → その値を使用（step 定義のハードコード値）
6. フィールド固有のフォールバック: `model` は step 定義の値が必ず存在するため到達しない。`maxTurns` は `null`（unlimited）。`timeoutMs` は `null`（no timeout）

`requestType` が未指定（undefined）の場合、level 1 と 3 は SHALL スキップされ、既存の 4 レベル解決（level 2, 4, 5, 6）と同等の挙動を維持する。

解決時、`null` は SHALL 有効値として扱われる（「制限なし」を明示的に指定）。`undefined`（JSON でキーが不在）のみが「未設定、次の fallback に進む」を意味する。

`ResolvedStepConfig` は MUST 以下の型を持つ:
- `model: string` — 必ず解決済み
- `maxTurns: number | null` — `null` = unlimited
- `timeoutMs: number | null` — `null` = no timeout

#### Scenario: type 別 step level が最優先で解決される

- **GIVEN** config に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]", "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-opus-4-6[1m]"` である
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-opus-4-6[1m]" }, "bug-fix")` を呼ぶ
- **THEN** `resolved.model` は `"claude-sonnet-4-6"`（type 別 step level の値）である

#### Scenario: step level が type 別 default より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } }, "design": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" }, "bug-fix")` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（step level の値）である
- **AND** type 別 default の `"claude-sonnet-4-6"` は使用されない

#### Scenario: type 別 default が global default より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6", "byRequestType": { "spec-change": { "model": "claude-opus-4-6[1m]" } } } } }` が設定されている
- **AND** `config.steps.design` は未設定
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" }, "spec-change")` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（type 別 default の値）である

#### Scenario: requestType 未指定で既存 4 レベル解決と同等

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6" }, "design": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" })` を呼ぶ（requestType 省略）
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（step level の値）である
- **AND** byRequestType は参照されない

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

### Requirement: steps config の値は型と範囲が検証される

`validateConfig()` は MUST `steps` セクションが存在する場合、各 `StepExecutionConfig` のフィールドを以下のルールで検証する:

- `model`: `string` 型かつ空文字列でないこと。違反時は `CONFIG_INVALID` エラーを throw する
- `maxTurns`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する
- `timeoutMs`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する
- `byRequestType`: `object` 型であること。key は非空文字列であること。各 value は上記の `StepExecutionConfig` 検証を再帰的に適用する。value 内にネストした `byRequestType` が存在する場合は `CONFIG_INVALID` を throw する

未指定（`undefined` / JSON でキーが不在）のフィールドは SHALL 検証をスキップする（解決順序で後続の fallback に委ねる）。

検証は `steps.defaults` および `steps.<stepName>` の全エントリに対して適用される。

`byRequestType` の key（request type 名）について:
- 空文字列 key は MUST `CONFIG_INVALID` で reject する
- 既知の type 集合（`bug-fix` / `spec-change` / `new-feature` / `refactoring` / `chore`）と一致しない key は SHALL warning ログのみ出力し、reject しない

error message には MUST 問題の key path が含まれる（例: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`）。

> **Note**: `steps` のキー名（step 名）自体の存在検証は本 change では対象外とする。存在しない step 名はサイレントに無視される（将来 `specrunner doctor` で検証可能にする）。

#### Scenario: byRequestType 内の valid config が検証を通過する

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: byRequestType の空文字列 key で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.design.byRequestType` が含まれる

#### Scenario: byRequestType 内の model 空文字列で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "code-review": { "byRequestType": { "spec-change": { "model": "" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.code-review.byRequestType.spec-change.model` が含まれる

#### Scenario: ネストした byRequestType で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "byRequestType": { "nested": { "model": "x" } } } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: 未知 type key が warning のみで通過する

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "unknown-type": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する
- **AND** stderr に warning が出力される

#### Scenario: byRequestType 内の maxTurns / timeoutMs が検証される

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "maxTurns": -1 } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.design.byRequestType.bug-fix.maxTurns` が含まれる

#### Scenario: maxTurns に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": -1 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: model に空文字列を設定した場合

- **GIVEN** config に `{ "steps": { "propose": { "model": "" } } }` が設定されている
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

### Requirement: project local config は repo root 配下に配置され user global に overlay される

CLI は MUST `<repo-root>/.specrunner/config.json` を project local config として認識する。`loadConfig(repoRoot?)` は以下の優先順で config を解決する:

1. `~/.config/specrunner/config.json` (user global) を読み込む → base
2. `<repoRoot>/.specrunner/config.json` (project local) が存在する場合、読み込む → overlay
3. deep merge で overlay が base を上書き、不在 key は base を継承

不在時の挙動:
- **両方存在**: project local は partial overlay として許容される（必須 field 全部書かなくて OK、user global の値を継承）
- **user global なし + project local のみ**: project local は standalone config として valid（`version: 1` + 必須 field を含む完全な schema）でなければならない。部分 config だけだと `CONFIG_INVALID`
- **project local なし + user global のみ**: 既存挙動（regression なし）
- **両方なし**: 既存挙動通り（`CONFIG_MISSING`）

deep merge のルール:
- object 型の value は再帰的に merge
- primitive は overlay が上書き
- overlay に key が不在（undefined）→ base を維持
- overlay に `null` → `null` で上書き

`repoRoot` が `loadConfig()` に渡されない場合は SHALL user global config のみを使用する（既存挙動と完全同等）。

repo root 解決は既存の `resolveRepoRoot()` (`src/util/repo-root.ts`) を再利用する。

#### Scenario: user global + project local が deep merge される

- **GIVEN** user global に `{ "version": 1, "steps": { "defaults": { "model": "claude-sonnet-4-6" } } }` が存在する
- **AND** project local に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]" } } }` が存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** merged config の `steps.defaults.model` は `"claude-sonnet-4-6"`（user global から継承）
- **AND** `steps.design.model` は `"claude-opus-4-6[1m]"`（project local から上書き）

#### Scenario: project local のみで standalone config として valid

- **GIVEN** user global config が存在しない
- **AND** project local に `{ "version": 1, "runtime": "local", "agents": {}, "steps": { "defaults": { "model": "claude-sonnet-4-6" } } }` が存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** config load は成功し、`config.steps.defaults.model` は `"claude-sonnet-4-6"` である

#### Scenario: project local のみで部分 config も migration により valid として扱われる

- **GIVEN** user global config が存在しない
- **AND** project local に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]" } } }` のみが存在する（version なし）
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** config load は成功する。`applyMigration()` が `version: 1` と `agents: {}` を自動補完するため、部分 config でも standalone として valid と判定される。model が有効な registry エントリを指していれば `CONFIG_INVALID` にならない。
- **NOTE**: 当初の仕様では「部分 config のみで CONFIG_INVALID」としていたが、`applyMigration()` の version 補完挙動を活用することで partial overlay も standalone として動作するよう決定した（impl が仕様より先行、ここで仕様を実装に合わせて修正）。

#### Scenario: project local なしで既存挙動

- **GIVEN** user global config のみが存在する
- **AND** `<repoRoot>/.specrunner/config.json` が存在しない
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** user global config がそのまま返される（既存挙動と同等）

#### Scenario: repoRoot 未指定で user global のみ

- **WHEN** `loadConfig()` を呼ぶ（repoRoot 省略）
- **THEN** user global config のみが読み込まれる
- **AND** project local config は一切参照されない

#### Scenario: project local config の JSON parse error

- **GIVEN** user global config が valid で存在する
- **AND** project local config が不正な JSON（parse error）である
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

### Requirement: CLI entry は起動直後に config を load する

各 CLI command は MUST pipeline 実行の前段階（起動直後）で `loadConfig()` を呼び出す。config の不正値は SHALL pipeline 中盤ではなく起動直後に `CONFIG_INVALID` として検出される。

`loadConfig()` を呼び出す timing:
- `run.ts`: `runPreflight()` 内（既存、起動直後）
- `resume.ts`: `bootstrap()` 内（既存、起動直後）
- `init.ts`: best-effort（config 作成が目的のため例外）
- `doctor.ts`: best-effort（診断目的のため例外）
- その他 config 不要 command（`ps`, `cancel`）: 不要

repoRoot を解決可能な command（`run`, `resume` 等）は SHALL `loadConfig(repoRoot)` を呼び project local overlay を適用する。

#### Scenario: run command で不正 config が起動直後に検出される

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "model": "" } } } } }` が設定されている
- **WHEN** `specrunner job start <slug>` を実行する
- **THEN** pipeline 開始前に `CONFIG_INVALID` エラーで終了する
- **AND** error message に `steps.design.byRequestType.bug-fix.model` が含まれる

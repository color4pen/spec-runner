## ADDED Requirements

### Requirement: CLI composition root が runtime に応じた AgentRunner を注入する

`src/cli/` の composition root SHALL `config.runtime` を読み、`"managed"` の場合は `ManagedAgentRunner` を、`"local"` の場合は `ClaudeCodeRunner` を構築して `StepExecutor` の constructor に注入する。`StepExecutor` 自身は SHALL `config.runtime` を読まない。

#### Scenario: managed 選択

- **GIVEN** `config.runtime === "managed"`
- **WHEN** CLI が起動して `StepExecutor` を構築する
- **THEN** `runner` には `ManagedAgentRunner` の instance が渡される
- **AND** `ClaudeCodeRunner` のコンストラクタは呼ばれない

#### Scenario: local 選択

- **GIVEN** `config.runtime === "local"`
- **WHEN** CLI が起動して `StepExecutor` を構築する
- **THEN** `runner` には `ClaudeCodeRunner` の instance が渡される
- **AND** `ManagedAgentRunner` のコンストラクタは呼ばれない
- **AND** `SessionClient` の生成も skip される

#### Scenario: 未指定 runtime は managed 扱い

- **GIVEN** `config.runtime` が未設定（既存 config の後方互換）
- **WHEN** CLI が起動する
- **THEN** `runner` には `ManagedAgentRunner` が注入される
- **AND** ConfigStore.load() の migration で in-memory `config.runtime` は `"managed"` に正規化される

#### Scenario: StepExecutor が runtime 値を読まない

- **WHEN** `grep -E "config\\.runtime|runtime\\s*===" src/core/step/executor.ts` を実行する
- **THEN** マッチ行は 0 である

### Requirement: `specrunner init --runtime local` は API 呼び出しゼロで完了する

CLI は SHALL `specrunner init --runtime local` をサポートする。このコマンドは MUST 以下の挙動である:

- `config.runtime` を `"local"` に書き込む
- `config.anthropic.apiKey` の入力 prompt を skip する（local mode では未設定でよい）
- `AgentSyncer.syncAll()` を呼ばない（Anthropic API への HTTP リクエストはゼロ）
- 既存 `github` ブロックには影響しない（login は別経路）

`specrunner init --runtime managed`（または `--runtime` 未指定）は MUST 既存挙動と同一である（apiKey 入力 + AgentSyncer 起動）。

#### Scenario: --runtime local で AgentSyncer が呼ばれない

- **GIVEN** `specrunner init --runtime local` を実行する
- **WHEN** init が完了する
- **THEN** Anthropic API への HTTP リクエストは 1 件も発生しない
- **AND** config に `runtime: "local"` が書き込まれる
- **AND** `config.agents` は空オブジェクトのまま、または既存値が保たれる

#### Scenario: --runtime managed は既存挙動

- **GIVEN** `specrunner init --runtime managed`（または `--runtime` 未指定）を実行する
- **WHEN** init が完了する
- **THEN** apiKey 入力 prompt が表示される
- **AND** `AgentSyncer.syncAll()` が呼ばれて agents が create / sync される
- **AND** config に `runtime: "managed"` が書き込まれる

#### Scenario: --runtime local で apiKey 不在を許容する

- **GIVEN** `config.anthropic.apiKey` が未設定の状態で `specrunner init --runtime local` を実行する
- **WHEN** init が完了する
- **THEN** init は success で終わる
- **AND** stderr / stdout に `apiKey required` のエラーは出ない
- **AND** `config.anthropic.apiKey` は空のまま保持される

### Requirement: local runtime では agent ID 解決が不要である

`config.runtime === "local"` の場合、`getAgentId(config, role)` は MUST 呼ばれない。CLI composition root は SHALL local runtime のとき agent ID 解決を skip するパスを持つ。`StepExecutor` は agent ID を直接知らないため（D1 / D8）、本要件は composition root レベルでのみ適用される。

#### Scenario: local runtime で getAgentId が呼ばれない

- **GIVEN** `config.runtime === "local"` で full pipeline を実行する
- **WHEN** 全 step が処理される
- **THEN** `getAgentId(config, ...)` の呼び出しは 0 回である
- **AND** `config.agents` が空でもエラーは発生しない

#### Scenario: managed runtime では従来通り getAgentId が呼ばれる

- **GIVEN** `config.runtime === "managed"` で agent step を実行する
- **WHEN** `ManagedAgentRunner.run(ctx)` が走る
- **THEN** adapter 内部で `ConfigStore.getAgentId(ctx.step.agent.role)` が呼ばれる
- **AND** 解決失敗時は `CONFIG_INCOMPLETE` エラーが伝搬する（既存挙動踏襲）

### Requirement: composition root が runtime ごとの依存だけを生成する

CLI composition root は MUST runtime に応じて以下の依存を生成する:

- `runtime === "managed"`: `SessionClient`, `GitHubClient`, `ConfigStore`, `ManagedAgentRunner`
- `runtime === "local"`: `ClaudeCodeRunner`, `ConfigStore`（`SessionClient` は生成しない）

`runtime === "local"` で `SessionClient` を生成しないことで、Anthropic API key 不在時にも CLI が起動できることを保証する。`GitHubClient` は MUST pr-create step で必要なため両 runtime で生成される（既存挙動）。

#### Scenario: local 起動時に SessionClient が生成されない

- **GIVEN** `config.runtime === "local"` で `specrunner run` を実行する
- **WHEN** composition root が wiring する
- **THEN** `SessionClient` のコンストラクタは呼ばれない
- **AND** `anthropic.apiKey` が空でも startup error は発生しない

#### Scenario: managed 起動時は両 client が生成される

- **GIVEN** `config.runtime === "managed"`
- **WHEN** composition root が wiring する
- **THEN** `SessionClient` と `GitHubClient` の両方が生成される
- **AND** `apiKey` 不在時は `CONFIG_INCOMPLETE` エラーで起動が止まる（既存挙動）

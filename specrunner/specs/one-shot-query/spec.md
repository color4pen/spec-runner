## Purpose

TBD
## Requirements

### Requirement: queryOneShot 関数が one-shot query の共通実行基盤を提供する

`src/adapter/claude-code/query-one-shot.ts` SHALL `queryOneShot` 関数を export する。この関数は pipeline step lifecycle (`AgentRunner`) とは独立した one-shot コマンド向けの query() 呼び出し基盤である。

`QueryOneShotOptions` は MUST 以下の field を持つ:
- `systemPrompt: string` — system prompt (MUST)
- `prompt: string` — user message (MUST)
- `allowedTools?: string[]` — 許可ツール一覧 (optional)
- `maxTurns?: number` — 最大ターン数 (optional — config chain の stepDefaults に入る)
- `timeoutMs?: number` — タイムアウト ms (optional — config chain の stepDefaults に入る)
- `cwd?: string` — 作業ディレクトリ (optional)
- `stepName?: string` — config 解決の key (optional, default: `"one-shot"`)
- `model?: string` — config chain の stepDefaults.model (optional)

`QueryOneShotResult` は MUST 以下の field を持つ:
- `text: string` — assistant の最終 text response (MUST)
- `sessionId?: string` — SDK result の session_id (optional)
- `turnCount?: number` — 将来拡張用 (optional)
- `stopReason?: string` — SDKResultMessage.subtype (optional)

#### Scenario: queryOneShot が config 解決 / AbortController / for await loop を内包する

- **GIVEN** `queryOneShot` が呼ばれる
- **WHEN** `SpecRunnerConfig` と `QueryOneShotOptions` が渡される
- **THEN** `getStepExecutionConfig()` 経由で model / maxTurns / timeoutMs が解決される
- **AND** `AbortController` が構築され `timeoutMs` が設定される
- **AND** `for await` loop で SDK result が取得される
- **AND** success の場合 `QueryOneShotResult` が返される

#### Scenario: timeout で QUERY_ONE_SHOT_TIMEOUT error を throw する

- **GIVEN** `queryOneShot` が `timeoutMs` 付きで呼ばれる
- **WHEN** timeout 時間を超過する
- **THEN** `AbortController.abort()` が呼ばれる
- **AND** `SpecRunnerError` with code `QUERY_ONE_SHOT_TIMEOUT` が throw される

#### Scenario: 非 success result で QUERY_ONE_SHOT_FAILED error を throw する

- **GIVEN** SDK query が `subtype !== "success"` の result を返す
- **WHEN** `queryOneShot` が result を判定する
- **THEN** `SpecRunnerError` with code `QUERY_ONE_SHOT_FAILED` が throw される

### Requirement: reviewer / manager / generator は OneShotQueryClient port に依存する

`src/core/request/reviewer.ts` の `runReview()` と `src/core/request/manager.ts` / `src/core/request/generator.ts` は MUST `OneShotQueryClient` port interface に依存し、adapter / SDK の直接 import を持たない。

`OneShotQueryClient` は `src/core/port/one-shot-query-client.ts` に定義され、`run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>` メソッドを持つ。具象実装 `ClaudeCodeOneShotQueryClient` は `src/adapter/claude-code/` に配置され、既存の `queryOneShot()` 関数に委譲する。

composition point（`executeReview` / `executeCreate` の呼び出し元）が具象を生成し、core 層の関数に注入する。core 層の関数は default fallback を持たない（SDK に暗黙フォールバックしない）。

review 固有の責務（prompt 構築 / `parseReviewOutput` による structured JSON 抽出）は `runReview()` 側に残る。

#### Scenario: reviewer / manager / generator が OneShotQueryClient port に依存する

- **WHEN** `src/core/request/reviewer.ts` の import を inspect する
- **THEN** `OneShotQueryClient` が `../port/` から import されている
- **AND** `adapter/` からの import は存在しない
- **AND** `@anthropic-ai/` からの import は存在しない

#### Scenario: runReview が OneShotQueryClient を引数に受け取る

- **WHEN** `runReview()` の signature を inspect する
- **THEN** `client: OneShotQueryClient` が必須引数として存在する
- **AND** `queryFn` optional 引数は存在しない
- **AND** `config: SpecRunnerConfig` 引数は存在しない（client が内部に保持する）

#### Scenario: generator が SDK 型を直接 import しない

- **WHEN** `src/core/request/generator.ts` の import を inspect する
- **THEN** `@anthropic-ai/claude-agent-sdk` からの import は存在しない
- **AND** `OneShotQueryClient` が `../port/` から import されている
- **AND** `generate()` は `client.run()` 経由で query を実行する

#### Scenario: 既存 review の振る舞いが保たれる

- **GIVEN** `runReview()` が `OneShotQueryClient` 経由に置き換えられている
- **WHEN** 正常な query result が返される
- **THEN** `parseReviewOutput()` で structured result に変換される
- **AND** 既存の `RequestReviewResult` 型と同一の shape が返される

### Requirement: queryOneShot と agent-runner-port は別 entry point として共存する

`queryOneShot` (one-shot コマンド用) と `AgentRunner` (pipeline step lifecycle 用) は MUST 独立した entry point として共存する。`queryOneShot` は `AgentRunContext` を受け取らない。`AgentRunner` interface に `queryOneShot` を追加しない。

#### Scenario: queryOneShot が AgentRunContext を要求しない

- **WHEN** `queryOneShot` の引数を inspect する
- **THEN** `AgentRunContext` / `AgentStep` / `JobState` への依存は存在しない
- **AND** `QueryOneShotOptions` + `SpecRunnerConfig` のみで呼び出せる

### Requirement: OneShotQueryResult に modelUsage を含める

`OneShotQueryResult` SHALL include a `modelUsage` field that returns per-model token usage from the LLM invocation.

#### Scenario: SDK result に modelUsage がある場合

- WHEN `queryOneShot()` を実行する
- AND SDK の `SDKResultSuccess` に `modelUsage` が含まれる (model 名 → token 数の mapping)
- THEN `OneShotQueryResult.modelUsage` に `Record<string, ModelUsage>` が設定される
- AND 各 model の `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens` が正しく mapping される

#### Scenario: SDK result に modelUsage がない場合

- WHEN `queryOneShot()` を実行する
- AND SDK の `SDKResultSuccess` に `modelUsage` が含まれない (undefined or 空オブジェクト)
- THEN `OneShotQueryResult.modelUsage` は `undefined` になる

#### Scenario: port interface の型互換性

- WHEN `OneShotQueryClient.run()` を呼び出す
- THEN 戻り値の `OneShotQueryResult` に optional `modelUsage?: Record<string, ModelUsage>` field がある
- AND 既存の `text`, `sessionId`, `turnCount`, `stopReason` field に変更はない

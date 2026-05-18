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

### Requirement: request-review は queryOneShot 経由で query() を呼び出す

`src/core/request/reviewer.ts` の `runReview()` は MUST `queryOneShot` 経由で query() を呼び出す。inline の config 解決 / AbortController / for await loop / success 判定は削除される。

review 固有の責務 (prompt 構築 / `parseReviewOutput` による structured JSON 抽出) は `runReview()` 側に残る。

#### Scenario: runReview が queryOneShot を呼び出す

- **WHEN** `runReview()` の import を inspect する
- **THEN** `queryOneShot` が import されている
- **AND** `getStepExecutionConfig` の直接 import は存在しない
- **AND** `AbortController` の直接構築は存在しない

#### Scenario: 既存 review の振る舞いが保たれる

- **GIVEN** `runReview()` が `queryOneShot` 経由に置き換えられている
- **WHEN** 正常な query result が返される
- **THEN** `parseReviewOutput()` で structured result に変換される
- **AND** 既存の `RequestReviewResult` 型と同一の shape が返される

### Requirement: queryOneShot と agent-runner-port は別 entry point として共存する

`queryOneShot` (one-shot コマンド用) と `AgentRunner` (pipeline step lifecycle 用) は MUST 独立した entry point として共存する。`queryOneShot` は `AgentRunContext` を受け取らない。`AgentRunner` interface に `queryOneShot` を追加しない。

#### Scenario: queryOneShot が AgentRunContext を要求しない

- **WHEN** `queryOneShot` の引数を inspect する
- **THEN** `AgentRunContext` / `AgentStep` / `JobState` への依存は存在しない
- **AND** `QueryOneShotOptions` + `SpecRunnerConfig` のみで呼び出せる

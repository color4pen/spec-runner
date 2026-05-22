# managed-agent usage tracking

## Requirements

### Requirement: SessionClient port に read 専用 usage メソッドを追加する

`src/core/port/session-client.ts` に `getSessionUsage(sessionId: string)` 相当の read 専用メソッドを追加する SHALL。

- 戻り型は SDK 型 (`BetaManagedAgentsSessionUsage`) を露出しない。`{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }` 互換構造で返す SHALL。
- SDK → 互換構造への変換は adapter 実装 (`src/adapter/managed-agent/`) 側で行う。

#### Scenario: port メソッドが SDK 型を露出しない

Given: `src/core/port/session-client.ts` に `getSessionUsage` が定義されている  
When: メソッドの戻り型を確認する  
Then: `BetaManagedAgentsSessionUsage` は型に現れず、`{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }` 互換構造が返る

### Requirement: usage 抽出の純粋関数を adapter 層に置く

`src/adapter/managed-agent/` 配下に `BetaManagedAgentsSessionUsage → ModelUsage 互換構造` の純粋関数を置く SHALL。

- `cache_creation.ephemeral_1h_input_tokens + ephemeral_5m_input_tokens` を平坦化して `cacheCreationInputTokens` にマップする。
- 全フィールドは optional のため欠損時のデフォルト (0 埋め等) を定義する。
- SDK モック不要で table-driven テスト可能な形にする。

#### Scenario: cache_creation ネストを平坦化する

Given: `BetaManagedAgentsSessionUsage` の `cache_creation.ephemeral_1h_input_tokens = 100` / `ephemeral_5m_input_tokens = 50`  
When: 純粋関数を呼ぶ  
Then: 戻り値の `cacheCreationInputTokens === 150`

#### Scenario: 全フィールド欠損時にデフォルト値を返す

Given: `BetaManagedAgentsSessionUsage` の全フィールドが `undefined`  
When: 純粋関数を呼ぶ  
Then: 戻り値の各フィールドはデフォルト値 (0 等) であり、例外は発生しない

### Requirement: run() の SSE / polling 両経路で終端 1 read を行い usage を返す

`ManagedAgentRunner.run()` は `AgentRunResult.modelUsage` を返す SHALL (従来の空から脱却)。

- `runDesignStyle` (SSE) / `runPollingStyle` (polling) の各 success return 直前で `getSessionUsage(sessionId)` を 1 回呼ぶ。
- session cumulative なので終端 1 read = follow-up turn 込みの総量となり、per-turn 加算は不要。
- usage read は best-effort とし、失敗時は `undefined` にして pipeline を止めない。

#### Scenario: SSE 経路で usage が result に含まれる

Given: `runDesignStyle` が end_turn で正常終了し、`getSessionUsage` が usage を返す  
When: `run()` の戻り値を確認する  
Then: `AgentRunResult.modelUsage` に usage が含まれる

#### Scenario: polling 経路で usage が result に含まれる

Given: `runPollingStyle` が正常終了し、`getSessionUsage` が usage を返す  
When: `run()` の戻り値を確認する  
Then: `AgentRunResult.modelUsage` に usage が含まれる

#### Scenario: usage read 失敗時に pipeline が止まらない

Given: `getSessionUsage` が例外を throw する  
When: `run()` を呼ぶ  
Then: `AgentRunResult.modelUsage` が `undefined` で返り、例外は外部に伝播しない

### Requirement: モデル名キーは step.agent.model を一次キーとする

`AgentRunResult.modelUsage` のキーに `step.agent.model` を使う SHALL。

- SSE end_turn 成功経路では `resolvedConfig` が scope 外のため、全経路で常に scope 内の `step.agent.model` を一次キーとする。
- 値抽出 (usage 抽出純粋関数) とキー付与は別責務として分離する。

#### Scenario: SSE 成功経路でモデル名キーが付与される

Given: `step.agent.model = "claude-opus-4-5"` で SSE 経路が成功する  
When: `run()` の戻り値を確認する  
Then: `AgentRunResult.modelUsage["claude-opus-4-5"]` に usage が格納されている

### Requirement: unit test を追加する

`tests/unit/adapter/managed-agent/` に以下の unit test を追加する SHALL。

- usage 抽出純粋関数: 4 フィールドマップ + `cache_creation` 平坦化の table-driven test。
- `run()` SSE 経路 / polling 経路それぞれで usage が result に反映されることを、sessionClient mock で検証する。

#### Scenario: table-driven test で純粋関数の各ケースが網羅される

Given: usage 抽出純粋関数の unit test が `tests/unit/adapter/managed-agent/` に存在する  
When: `bun run test` を実行する  
Then: 全フィールドマップ・cache_creation 平坦化・欠損時デフォルトの各ケースが pass する

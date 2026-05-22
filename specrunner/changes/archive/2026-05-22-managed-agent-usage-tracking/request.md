# managed-agent adapter の token usage 追跡を追加する (= Claude/Codex と整合)

## Meta

- **type**: spec-change
- **slug**: managed-agent-usage-tracking
- **base-branch**: main
- **adr**: false

<!-- adr=false: 既存 adapter (Claude/Codex) の usage 追跡パターンを managed に展開する、設計上のトレードオフなし -->

## 背景

`ManagedAgentRunner.run()` は `AgentRunResult` に **`modelUsage` を一切含めず返している** (= `src/adapter/managed-agent/agent-runner.ts` の return は `{ completionReason, resultContent, sessionId }` のみ)。

一方、他 2 adapter は token usage を追跡している:
- Claude (`claude-code/agent-runner.ts`): `SDKResultSuccess.modelUsage` を map
- Codex (`codex/agent-runner.ts`): `Turn.usage` を map

= **managed runtime で実行した job は StepRun.modelUsage が空のまま** → cost 追跡・可視化ができない。adapter 間で usage 追跡に非対称がある。

この gap は PR #362 (= delta-spec-session-followup) の事後監査で発見した既存の穴であり、本 request で埋める。

## 外部 API 制約 (= module-architect が SDK 型で確認済み)

**Managed Agents SDK は `BetaManagedAgentsSession.usage: BetaManagedAgentsSessionUsage` を提供する** (= `node_modules/@anthropic-ai/sdk/resources/beta/sessions/sessions.d.ts:235`)。doc コメントに **"Cumulative token usage for a session across all turns"** と明記。

- フィールド: `input_tokens?` / `output_tokens?` / `cache_read_input_tokens?` / `cache_creation?: { ephemeral_1h_input_tokens?, ephemeral_5m_input_tokens? }` (= 全 optional)
- `retrieveSession` が既に `BetaManagedAgentsSession` を取得している (= `completion.ts` の `pollUntilComplete` 内、`:80,95`)。その session オブジェクトが `.usage` を持つが、adapter 実装 `src/adapter/managed-agent/session-client.ts` の `pollUntilComplete` 戻り型が `{ status, error }` に縮約しており usage が捨てられている

> **`session-client.ts` は 2 ファイル存在する (混同注意)**: (a) **port interface** `src/core/port/session-client.ts` (= SDK import 無し、core 層)、(b) **adapter 実装** `src/adapter/managed-agent/session-client.ts` (= `:3` に「ONLY file allowed to import @anthropic-ai/sdk in the adapter」コメント)。**ただし (b) のコメントは既に形骸化**しており、実際は `completion.ts` / `sdk/sessions.ts` / `sse-stream.ts` 等 adapter 内 7 file が `@anthropic-ai/sdk` を import している。= **SDK 境界は「adapter ディレクトリ全体」であり単一 file ではない**。SDK 型を扱う変換は adapter 層に置けばよく、`completion.ts` の既存 retrieve に相乗りする経路も SDK 境界内で正当。

= **usage は session cumulative** であり、新規 API call 不要。既に取得済みの捨てている情報を拾うだけ。

ただし全フィールド optional のため、実 API レスポンスで欠損する可能性は型上残る (= 実行時の値有無は dogfood で確認)。

## 要件

### 1. port に session usage の read 専用メソッド追加

`SessionClient` port (`src/core/port/session-client.ts`) に **read 専用メソッド (= 例: `getSessionUsage(sessionId)`)** を追加する SHALL (= module-architect 推奨)。

**理由**: SSE 正常終了経路 (`runDesignStyle` の end_turn) は `pollUntilComplete` を通らない (`agent-runner.ts:224`) ため、`pollUntilComplete` の戻り型拡張では SSE 経路の usage を取り損ねる。両経路の終端から独立に呼べる read 専用メソッドが、2 経路 DRY と port 最小拡張を両立する。

port interface (`src/core/port/session-client.ts`) は core 層なので **SDK 型を露出できない**。戻り型は `BetaManagedAgentsSessionUsage` を直接露出せず、手書きの `{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }` 構造 (= ModelUsage 互換) で返す SHALL (= port が SDK 型を漏らさない契約を維持)。SDK→互換構造の変換は adapter 実装側で行う。

### 2. usage 抽出の純粋関数化

**adapter 層** (= `src/adapter/managed-agent/` 配下、SDK 型を扱ってよい) に `BetaManagedAgentsSessionUsage → ModelUsage 互換構造` の純粋関数を置く SHALL (= core port `src/core/port/session-client.ts` には SDK 型が入るので置けない)。配置先は `session-client.ts` 実装 / `completion.ts` / 新規 file のいずれかを design step が選ぶ。`cache_creation` のネスト (`ephemeral_1h_input_tokens + ephemeral_5m_input_tokens`) を平坦化して `cacheCreationInputTokens` に map する。SDK モック不要で table-driven test 可能にする。

### 3. run() 2 経路での usage 反映 (= 終端で 1 read)

`runDesignStyle` (SSE) / `runPollingStyle` (polling) の **各 success return 直前で `getSessionUsage(sessionId)` を 1 回呼び、result に乗せる** SHALL。

- **session cumulative なので follow-up turn 込みで「終端で 1 read」すれば総量になる** (= Codex 流の per-turn 加算は不要、PR #362 contract「session 総量が勝つ」を自動的に満たす)
- usage read は best-effort とし、失敗時は undefined にして fatal にしない (= Claude `:190` のガードのみパターンと同じ)
- follow-up turn block の中に加算ロジックを差し込まない (= cohesion 維持、終端 1 read に集約)

### 4. モデル名キーの解決

`AgentRunResult.modelUsage` は `Record<string, ModelUsage>` でキーがモデル名。`BetaManagedAgentsSessionUsage` はモデル名を含まないため、**`step.agent.model` をキーに使う** SHALL (= 全 return 経路で常に scope 内)。`resolvedConfig.model` が利用可能な経路ではそちらを優先してよいが、**SSE end_turn 成功経路では `resolvedConfig` が success return の scope 外** (= `agent-runner.ts` の `resolvedConfig` は `if(needsPollingFallback)` ブロック内 `:201` でのみ計算) のため、`step.agent.model` を一次キーとする。design step が必要なら `resolvedConfig` を hoist して resolved model をキーにする (= Codex `agent-runner.ts:258` と整合)。値抽出 (要件 2) とキー付与は別責務として分離する (= SRP)。

### 5. test

`tests/unit/adapter/managed-agent/` に usage 抽出純粋関数 (= 4 フィールド map + cache_creation 平坦化) と run() 2 経路での反映の unit test を追加する SHALL。sessionClient mock で usage を返す経路を検証する。

## スコープ外

- **job-level の cost 集約** (= 全 StepRun を合計して job 総コストを出す機構)。本 request は managed の per-step usage 記録まで。job 集約 + resume の cumulative 二重計上検証は別 issue
- **Claude/Codex の usage 処理変更** (= 既存 2 adapter は touch しない)
- **cost 可視化 UI / コマンド** (= 別 issue)
- **Managed Agents API が usage 非対応だった場合の代替 API 設計** (= 検証で判明したら別途判断)

## 受け入れ基準

- [ ] `ManagedAgentRunner.run()` が `AgentRunResult.modelUsage` を返す (= 従来の空から脱却)
- [ ] `SessionClient` port に read 専用 usage メソッドが追加され、戻り型が SDK 型を露出しない (= ModelUsage 互換構造)
- [ ] usage 抽出が純粋関数化され、`cache_creation` ネストを平坦化して map する (= SDK モック不要の table-driven test あり)
- [ ] SSE 経路 / polling 経路の両方で、終端 1 read で usage が result に反映される
- [ ] follow-up turn 込みの session 累積総量が返る (= cumulative なので終端 1 read で自動的に総量、加算ロジック不要)
- [ ] usage read が best-effort で、失敗時 undefined・pipeline は止まらない
- [ ] モデル名キーは全 return 経路で scope 内の `step.agent.model` を一次キーとして付与され (= SSE 成功経路は `resolvedConfig` 未計算)、値抽出と分離されている
- [ ] Claude/Codex adapter の usage 処理は無改修である
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect が SDK 型を確認した上での確定事項:

1. **抽出元は `BetaManagedAgentsSession.usage` (= session cumulative)** — SSE event でも別 API call でもなく、`retrieveSession` が既に取得済みで捨てている情報を拾う
2. **session cumulative なので follow-up turn 込みで「終端 1 read」= 総量** — Codex 流 per-turn 加算は移植しない (= 最重要の構造判断)
3. **port に read 専用メソッド 1 つ追加** — `pollUntilComplete` 戻り型拡張だと SSE 正常経路 (pollUntilComplete を通らない) で usage を取り損ねる
4. **変換純粋関数は adapter 層に** (= `src/adapter/managed-agent/` 配下。core port `src/core/port/session-client.ts` は SDK 型を漏らせないため不可。SDK 境界は adapter ディレクトリ全体であり `completion.ts` 等既存 SDK importer と同列)
5. **0 埋め共通化は深追いしない** (= SDK 入力型の差が大きく偽共通化になる、ModelUsage 出力契約のみ共有が上限)
6. **usage は best-effort** (= 失敗で pipeline を止めない、既存 Claude/Codex と同じ)

design step に委ねる残論点:

- read 専用メソッドの正確なシグネチャと配置
- 全 optional フィールドの欠損時デフォルト (= 0 埋めの具体)
- usage read を `completion.ts` の既存 retrieve に相乗りさせるか独立呼び出しにするか

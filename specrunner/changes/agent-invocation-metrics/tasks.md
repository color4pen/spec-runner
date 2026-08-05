# Tasks: SDK result の turn 数・所要時間・実コストを usage.json に記録する

> 依存順:
> T-01（型追加）は基盤で他の全タスクが依存する。
> T-02（adapter agent-runner 抽出）・T-03（one-shot 抽出）は T-01 に依存し互いに独立。
> T-04（executor + commit-orchestrator 配線）は T-01/T-02 に依存。
> T-05（usage show）・T-06（job stats）は T-01 に依存し互いに独立。
> T-07（後方互換・受け入れ固定・全体検証）は全実装後。
> 実装は `node:*` と既存 util のみを用い、新規 runtime 依存を追加しない。
> フィールド名は全層で `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` に統一する。

## T-01: metrics 型を追加する（AgentInvocationMetrics / CommandInvocation / AgentRunResult）

- [x] `src/core/port/agent-runner.ts` に共有型 `AgentInvocationMetrics` を追加する（doc comment 付き）:
  - `numTurns?: number` / `durationMs?: number` / `durationApiMs?: number` / `totalCostUsd?: number`。各フィールドの意味（SDK result の `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` 由来、欠落時は undefined）を doc comment に書く。
- [x] `AgentRunResult`（`src/core/port/agent-runner.ts:205-268`）に `invocationMetrics?: AgentInvocationMetrics` を追加する（doc comment: local runtime runner が SDK result から取得。managed は undefined）。
- [x] `CommandInvocation`（`src/core/usage/types.ts:9-20`）に flat な optional フィールド `numTurns?: number` / `durationMs?: number` / `durationApiMs?: number` / `totalCostUsd?: number` を追加する（**doc comment 必須**、AC #1）。doc comment に「値を提供しない runtime（managed 等）と本変更前の usage.json では undefined。既存フィールドの意味は不変」と明記する。既存フィールド（`command` / `timestamp` / `modelUsage` / `jobId` / `stepName`）の意味・並びは変えない。

**Acceptance Criteria**:
- `AgentInvocationMetrics` が 4 つの optional な number フィールドを持ち、`AgentRunResult` に `invocationMetrics?` が生える。
- `CommandInvocation` に `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が optional フィールドとして存在し、型定義に doc comment がある（AC #1）。
- `bun run typecheck` が green。既存の usage 型を参照するコードがコンパイルを通る。

## T-02: adapter (agent-runner) で success / error 双方の result から metrics を抽出する

- [x] `src/adapter/claude-code/agent-runner.ts` に純ヘルパ `extractInvocationMetrics(raw: Record<string, unknown>): AgentInvocationMetrics` を追加する。各フィールドを `typeof raw["num_turns"] === "number" ? raw["num_turns"] : undefined` の形で読み、number でない/欠落は `undefined` にする（`0`/`null` で埋めない、AC #5）。キー対応は `num_turns→numTurns` / `duration_ms→durationMs` / `duration_api_ms→durationApiMs` / `total_cost_usd→totalCostUsd`。
- [x] success 抽出箇所（`:827-844`）で、`extractedModelUsage` / `extractedSessionId` と並べて `extractedMetrics = extractInvocationMetrics(successResult as Record<string, unknown>)` を組み立てる（メソッド冒頭の `extractedModelUsage`/`extractedSessionId` と同様に `let extractedMetrics: AgentInvocationMetrics | undefined` を宣言）。
- [x] success の戻り `baseResult`（`:1029-1041`）に `invocationMetrics: extractedMetrics` を載せる。follow-up マージ（`mergeFollowUpResult`）後も metrics が保持されること（`baseResult` 起点なら自動的に保持される）を確認する。
- [x] error subtype 早期 return（`subtype !== "success"`、`:810-825`）の返り値 error object に `invocationMetrics: extractInvocationMetrics(errorResult as Record<string, unknown>)` を載せる（requirement 2）。
- [x] timeout（`:1047`）・generic catch（`:1065`）・redirect-limit（`~:800`）・result-file-not-found（`:1014`）等、SDK result message を伴わない/対象外の早期 return は `invocationMetrics` を undefined のままにする（変更しない）。

**Acceptance Criteria**（`_queryFn` 注入の adapter テストで固定、`tests/unit/adapter/claude-code/agent-runner.test.ts` 近傍）:
- `subtype: "success"` + 4 metrics を含む result message を注入 → `AgentRunResult.invocationMetrics` に 4 値が対応して載る（AC #2 success）。
- `subtype: "error_during_execution"`（または他 error 系）+ 4 metrics を含む result message を注入 → `completionReason: "error"` の `AgentRunResult.invocationMetrics` に 4 値が載る（AC #2 error）。
- success result に 4 metrics のいずれも含まない message を注入 → `invocationMetrics` の各フィールドが `undefined`（`0`/`null` でない）（AC #5）。
- 既存 agent-runner テストが無変更で green。`bun run typecheck` green。

## T-03: one-shot (query-one-shot) で metrics を抽出する

- [x] `src/adapter/claude-code/query-one-shot.ts` の success 抽出（`:174-197`）で、`modelUsage` と同じ result message から 4 値を取り出す（`typeof number` ガードで欠落は undefined）。`QueryOneShotResult`（`:69-80`）に `numTurns?: number` / `durationMs?: number` / `durationApiMs?: number` / `totalCostUsd?: number` を追加する。
- [x] 既存の `turnCount?`（"Reserved for future use"、`:74-75`）を削除し `numTurns` に置き換える（D4。queryOneShot は production caller ゼロで安全）。型の後方互換のため `turnCount?` は deprecated として型に残すが、返却オブジェクトには設定しない。
- [x] 抽出ロジックは agent-runner の `extractInvocationMetrics` と同型（number ガード）にする。one-shot は success のみ返す（非 success は throw）ため error 抽出は不要。

**Acceptance Criteria**（`tests/unit/adapter/claude-code/query-one-shot.test.ts`）:
- 4 metrics を含む success result を注入 → `QueryOneShotResult` に `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が対応して載る（AC #3）。
- metrics を含まない success result → 各 metrics フィールドが `undefined`。
- 既存の "turnCount is undefined"（`:90-99`）テストは placeholder 撤去に伴い `numTurns` の抽出/欠落を固定するテストへ**更新**する（AC #10 の保全対象＝usage / job-stats テスト外のため許容）。
- 既存の他の query-one-shot テスト（modelUsage 抽出等）は無変更で green。

## T-04: executor と commit-orchestrator を配線し metrics を usage.json に記録する

- [x] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult`（success、`:56-93`）に `invocationMetrics?: AgentInvocationMetrics` を追加する。
- [x] `src/core/step/executor.ts` の agent step success 構築（`:508-520`、`modelUsage: runResult.modelUsage` の隣）に `invocationMetrics: runResult.invocationMetrics` を追加する。CLI step success（`:613-621`）は runResult を持たないため対象外（変更しない）。
- [x] `commit-orchestrator.ts` の `applySuccessPostPersistEffects`（`:217-243`）で、`result` から `invocationMetrics` を分解し、`appendInvocation` に渡す `CommandInvocation` に `...(invocationMetrics ?? {})` で spread する（runner が値を返さないときフィールド省略、requirement 4）。既存 gate `if (modelUsage && deps.cwd && deps.slug)` は**変えない**（D3。metrics は modelUsage を伴うエントリに相乗り）。sequential（`commitSuccess`）/ parallel（`commitRound`）は同じヘルパを通るため両経路で有効。

**Acceptance Criteria**:
- `commitSuccess` を通した後、usage.json の当該エントリに 4 metrics が記録されることをテストで固定する（`src/core/step/__tests__/commit-orchestrator.test.ts` 近傍。`deps.cwd`/`deps.slug` を実ディレクトリにし、`invocationMetrics` を持つ success 結果を渡し、`readUsageFile` で 4 値を確認）。
- runner が `invocationMetrics` を返さない success 結果では、エントリに metrics フィールドが現れない（`0`/`null` で埋めない）。
- 既存の commit-orchestrator テストが無変更で green。`bun run typecheck` green。

## T-05: usage show が metrics を表示する

- [x] `src/core/command/usage-show.ts` の invocation 行出力（`:41-63`）で、`inv.numTurns` / `inv.durationMs` / `inv.durationApiMs` / `inv.totalCostUsd` のうち存在するものを追記表示する（例: `turns=… duration=…ms api=…ms cost=$…`。cost は既存 `formatUsd` を再利用してよい）。全て欠落するエントリは追記なしで、既存の modelUsage 出力・Totals ブロックを変えない（AC #6）。

**Acceptance Criteria**（`src/core/command/usage-show.ts` 用の新規テスト。一時 usage.json + stdout spy）:
- metrics 付き invocation を含む usage.json で `showUsage` を実行 → 出力に turn 数・所要時間・実コストが含まれる（AC #6）。
- metrics を一切持たない invocation だけの usage.json で `showUsage` を実行 → 例外なく exit 0 で、既存の modelUsage 出力が保たれる（AC #6）。

## T-06: job stats が実測 cost を優先し、cost basis と turn 総和を出力する

- [x] `src/core/command/job-stats.ts` の `JobStatRow`（`:31-38`）に **optional** フィールド `costBasis?: "measured" | "estimated" | "mixed" | null` と `turns?: number | null` を追加する（D8。optional にすることで既存テストの手書きリテラルが型検査を通る）。
- [x] `deriveRunStat`（`:88-177`）の cost 算出（`:146-171`）を invocation 単位のロジックに変える（既存の jobId フィルタ・legacy no-jobId 包含は不変）:
  - `typeof inv.totalCostUsd === "number"` → 総和に `inv.totalCostUsd` を加算し `hasMeasured = true`。**同 invocation の `modelUsage` からは `computeCostUsd` を加えない**（二重計上防止、requirement 6）。
  - そうでなく `inv.modelUsage` があれば → 各 priced モデルの `computeCostUsd` を加算（既存挙動）。1 つでも priced なら `hasEstimated = true`。
  - どちらでもない invocation は寄与なし。
  - `costUsd` は寄与があれば総和、無ければ `null`（既存と同じ）。
  - `costBasis`: `hasMeasured && hasEstimated → "mixed"` / `hasMeasured → "measured"` / `hasEstimated → "estimated"` / どちらも無し → `null`。
- [x] `deriveRunStat` で turn 総和を算出する: 対象 job の各 invocation の `inv.numTurns`（`typeof === "number"`）を総和し、1 件も無ければ `null`。`turns` に設定する（requirement 7、AC #9）。
- [x] `deriveRunStat` の戻り値は `turns` / `costBasis` を**常に**設定する（値または `null`）。これにより実出力（JSON / table）に常に含まれる（D8）。
- [x] `renderJobStatsTable`（`:271-324`）に「Turns」列を追加し、cost basis を可視化する（Cost セルへの注記 or 独立列。undefined/null は `-`）。ヘッダ・null セルの既存表示（`-`）を壊さない。summary ブロックは**変えない**。
- [x] `renderJobStatsJson`（`:334-336`）は `JobStatRow` を丸ごと `JSON.stringify` するため、`deriveRunStat` が `turns` / `costBasis` を設定すれば JSON に自動的に含まれる（追加改修不要、確認のみ）。summary schema・top-level keys（`runs` / `summary`）は変えない。

**Acceptance Criteria**（`tests/unit/core/command/job-stats.test.ts` に新規 TC を追加）:
- `totalCostUsd` を持つ invocation → その実測値で計上され、同 invocation の modelUsage 試算は加算されない（requirement 6、AC #7）。
- `totalCostUsd` を持たず priced modelUsage を持つ invocation → `computeCostUsd` 試算で計上される（AC #7）。
- 実測 invocation と試算 invocation が混在する run → 総和が二重計上されず、`costBasis === "mixed"`（AC #7/#8）。全て実測 → `"measured"`、全て試算 → `"estimated"`、cost 無し → `null`。
- 単価表に無いモデル + `totalCostUsd` あり → `totalCostUsd` で計上され脱落しない（問題 1 の解消）。
- `numTurns` を持つ複数 invocation → run の `turns` がその総和（AC #9）。`numTurns` を持つ invocation が 1 件も無い run → `turns === null`（AC #9）。
- **既存の job-stats テスト（TC-JSTATS-001..030）が無変更で green**（AC #10）。特に TC-JSTATS-008/009/010（cost）・TC-JSTATS-024（JSON row exact-key）・TC-JSTATS-025（summary exact-key）・TC-JSTATS-020/021/022（table）を回帰確認する。
- `bun run typecheck` green。

## T-07: 後方互換・受け入れ基準の固定と全体検証

- [x] metrics フィールドを持たない既存形式の usage.json を `appendInvocation` で読み書きしても、既存エントリが保持されパースエラーにならないことをテストで固定する（`tests/core/usage/store.test.ts` 近傍に新規 TC。legacy エントリ（metrics 無し）を書いた usage.json → 読取成功 → metrics 付き新エントリを append → 既存 + 新の両方が読める、AC #4/#8）。
- [x] request の受け入れ基準を対応テストで網羅する（T-02〜T-06 の各 Acceptance の確認）:
  - CommandInvocation の 4 optional フィールド + doc comment（AC #1、T-01）。
  - adapter success/error 双方の metrics 抽出（AC #2、T-02）。
  - one-shot の metrics 抽出（AC #3、T-03）。
  - legacy usage.json の後方互換読み書き（AC #4、T-07）。
  - 欠落フィールドが undefined（AC #5、T-02）。
  - usage show の metrics 表示 + 非保持でも例外なし（AC #6、T-05）。
  - job stats の実測優先・二重計上なし（AC #7、T-06）・cost basis 判別（AC #8、T-06）・turn 総和と null（AC #9、T-06）。
  - 既存 usage / job-stats テストが無変更で green（AC #10）。
- [x] `package.json` に新規 runtime 依存が追加されていないことを確認する（実装は `node:*` + 既存 util のみ）。
- [x] `bun run build && bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- request の受け入れ基準 1〜10 が全てテストで固定される。
- 既存の usage 関連テスト（`tests/core/usage/store.test.ts`）および job-stats 既存テスト（`tests/unit/core/command/job-stats.test.ts`）が**無変更で green**（AC #10）。
- 新規 runtime 依存の追加なし。
- `bun run build && bun run typecheck && bun run test` が green。

# Design: SDK result の turn 数・所要時間・実コストを usage.json に記録する

## Context

`job stats` は run 単位のコスト・収束回数・所要時間を集計するが、**cost は静的単価表からの試算**であり、SDK が返す実測値を使っていない。Claude Agent SDK は result message で `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を返すが、spec-runner は `modelUsage` と `session_id` だけを取り出して残りを捨てている。結果として (1) cost が試算のままで単価表の保守に依存する、(2) 未知モデル（`claude-opus-5` / `claude-sonnet-5` / `claude-fable-5` 等）は `computeCostUsd` が `null` を返し集計から静かに脱落する、(3) turn 数・API 待ち時間という次元が存在しない。本変更は SDK が既に返している値を記録に載せ、`job stats` が試算でなく実測を報告できる状態にする。

### 現状データフロー（変更の土台）

- **SDK 型**: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` の `SDKResultSuccess`（success）と `SDKResultError`（error 系）の両方が `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd`（いずれも非 optional な `number`）と `modelUsage` / `session_id` を持つ。
- **adapter のローカル型**: `src/adapter/claude-code/agent-runner.ts:370-374` の `SDKResultSuccess` は `result` / `session_id` / `modelUsage` のみ宣言。基底 `SDKResultMessage` がインデックスシグネチャ `[key: string]: unknown` を持つため、他フィールドは型上 `unknown` として参照可能。
- **success 抽出箇所**: `agent-runner.ts:827-844` が `subtype === "success"` のとき `modelUsage`（`extractedModelUsage`）と `session_id`（`extractedSessionId`）だけを取り出す。
- **error 抽出箇所**: `agent-runner.ts:810-825` が `subtype !== "success"` のとき metrics を一切取り出さず error object を早期 return する。
- **success の戻り**: `agent-runner.ts:1029-1041` の `baseResult`（`AgentRunResult`）に `modelUsage: extractedModelUsage` / `sessionId: extractedSessionId` を載せて返す。
- **one-shot 経路**: `src/adapter/claude-code/query-one-shot.ts:174-197` が success result から `modelUsage` のみ抽出。`QueryOneShotResult`（`:69-80`）は `turnCount?`（"Reserved for future use"）placeholder を持つが常に undefined。**production caller は現状ゼロ**（request 背景の「request-review / request-generate が使う」は現行コードでは不正確）。
- **port 型**: `src/core/port/agent-runner.ts:205-268` の `AgentRunResult` に metrics フィールドは無い（`modelUsage?` / `addedTurns?` はある）。
- **executor → StepExecutionResult**: `src/core/step/executor.ts:508-520` が agent step の success 結果に `modelUsage: runResult.modelUsage` を載せる。`StepExecutionResult`（success）は `src/core/step/commit-orchestrator.ts:56-93`。CLI step の success（`executor.ts:613-621`）は runResult を持たず modelUsage も無い。
- **usage.json 追記**: `commit-orchestrator.ts:217-243` の `applySuccessPostPersistEffects` が `result.modelUsage` を `appendInvocation`（`src/core/usage/store.ts:42-49`）に渡す。gate は `if (modelUsage && deps.cwd && deps.slug)`。sequential（`commitSuccess`）/ parallel（`commitRound`）の両方から呼ばれる。**error 結果はこの経路を通らない**（success のみ）。
- **記録型**: `src/core/usage/types.ts:9-20` の `CommandInvocation` は `command` / `timestamp` / `modelUsage` / `jobId` / `stepName` のみ。読取 `readUsageFile`（`store.ts:16-36`）は `commandInvocations` が配列であることだけを検査する寛容なパーサ。
- **集計**: `src/core/command/job-stats.ts` の `deriveRunStat`（`:88-177`）が `costUsd`（`:146-171`、対象 job の invocation の `computeCostUsd(model, usage)` 総和、`null` は除外）/ `durationSec` / `convergence` を算出。turn 数の項目は無い。JSON 出力（`renderJobStatsJson`, `:334-336`）は `JobStatRow` を丸ごと `JSON.stringify` する。
- **試算単価**: `src/core/usage/pricing.ts:210-220` の `computeCostUsd` は `lookupPricing(model) === null`（単価表に無いモデル）のとき `null` を返す。単価表は現行世代モデルのエントリを持たない。
- **既存テスト（AC #10 の保全対象）**: `tests/core/usage/store.test.ts`（TC-USG-01..06、`toMatchObject` ベースで exact-key 検査なし）、`tests/unit/core/command/job-stats.test.ts`（TC-JSTATS-001..030）。後者の TC-JSTATS-024 は JSON row の**キー集合を exact 一致**（`["convergence","costUsd","date","durationSec","outcome","slug"]`）で固定し、TC-JSTATS-025 は summary キー集合を exact 固定する。これらは**手書きの `JobStatRow` リテラル**（optional フィールドを省略）を `buildJobStatsReport` に渡している。

## Goals / Non-Goals

**Goals**:

- SDK result の `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を、`modelUsage` / `session_id` と同じ result message から取り出し、`CommandInvocation` に optional な実測フィールドとして記録する。
- local runtime の agent step（success / error 双方の subtype）と one-shot 経路の両方で metrics を抽出し、`AgentRunResult` / `QueryOneShotResult` に載せて呼び出し側へ渡す。
- 欠落フィールドは `undefined` のまま保つ（`0` / `null` で埋めない）。値を提供しない runtime（managed 等）と本変更前に書かれた既存 usage.json を後方互換に保つ。
- `usage show` が metrics を表示する。metrics を持たないエントリでも例外なく出力する。
- `job stats` の cost 算出を、記録された `totalCostUsd`（実測）を invocation 単位で優先し、無い invocation のみ `computeCostUsd`（試算）にフォールバックする。実測/試算/混在の別を出力から判別できるようにし、混在 run でも二重計上しない。
- `job stats` が run 単位の turn 数総和を出力する（`numTurns` を持つ invocation が 1 件も無い run では null）。
- 既存の usage 関連テストおよび `job stats` の既存テストを**無変更で green** に保つ（AC #10）。

**Non-Goals**（request のスコープ外を継承）:

- managed runtime での metrics 取得（CMA の session usage が turn 数・コストを提供するかは未調査。local 経路の記録が入った後に別途判断）。
- `src/core/usage/pricing.ts` の単価表への現行世代モデル追加（実測 cost が入れば試算はフォールバック経路になる）。
- cache write の TTL 内訳取得（SDK / API が TTL 別トークン数を返すかは未調査）。
- コスト上限・コストに基づく制御（#784 で退けられている）。
- 既存 `modelUsage` 記録形式の変更。

## Decisions

### D1: metrics は共有型 `AgentInvocationMetrics` に束ね、`CommandInvocation` には flat な optional フィールドとして展開する

`src/core/port/agent-runner.ts` に共有型を追加する:

```
AgentInvocationMetrics = {
  numTurns?: number;
  durationMs?: number;
  durationApiMs?: number;
  totalCostUsd?: number;
}
```

- `AgentRunResult`（port）に `invocationMetrics?: AgentInvocationMetrics` を追加。
- `StepExecutionResult`（success、`commit-orchestrator.ts:56-93`）に `invocationMetrics?: AgentInvocationMetrics` を追加。
- `CommandInvocation`（`types.ts`）には束ねずに **flat な 4 optional フィールド** `numTurns?` / `durationMs?` / `durationApiMs?` / `totalCostUsd?` を doc comment 付きで追加する（AC #1）。フィールド名を `AgentInvocationMetrics` と一致させることで、記録側は `...invocationMetrics` の spread だけで CommandInvocation に載せられる（D3）。

- **Rationale**: 中間層（runner → executor → orchestrator）を 4 個の optional フィールドで貫通させると literal 構築サイトが増えノイズになる。1 個の束ね型で運べば追加は最小。一方 `CommandInvocation` は永続化 schema であり、request AC #1 が flat フィールドを名指しし、`job stats` / `usage show` が個別フィールドを読むため flat に展開する。両者のフィールド名を揃えることで変換コード無しに繋がる。
- **Alternatives considered**: `CommandInvocation` に `metrics: {...}` ネストで持たせる → 却下（AC #1 が flat 4 フィールドを要求、既存 `modelUsage` 等も flat）。中間層も flat 4 フィールドで貫通 → 却下（threading ノイズ）。

### D2: adapter は success / error 双方の result message から metrics を防御的に抽出する（欠落は undefined）

`agent-runner.ts` で、`modelUsage` を取り出すのと同じ result message から 4 値を抽出する純ヘルパ `extractInvocationMetrics(raw: Record<string, unknown>): AgentInvocationMetrics` を用意する。各フィールドは `typeof raw[key] === "number" ? raw[key] : undefined` で読み、number でない/欠落しているものは `undefined` にする（`0` / `null` で埋めない、AC #5）。

- **success 経路**（`:827-844`）: `extractedModelUsage` / `extractedSessionId` と並べて `extractedMetrics` を組み立て、戻り値 `baseResult`（`:1029-1041`）と follow-up マージ結果に `invocationMetrics: extractedMetrics` を載せる。
- **error 経路**（`subtype !== "success"`、`:810-825`）: 早期 return する error object にも `invocationMetrics: extractInvocationMetrics(errorResult)` を載せる（requirement 2、AC #2 の error subtype）。
- timeout（`:1047`）・generic catch（`:1065`）・redirect-limit・result-file-not-found（`:1014`）等、SDK result message を伴わない/伴っても error に落ちる早期 return は `invocationMetrics` を undefined のままにする（result message が無い、または本変更の対象外の error 分類のため）。

- **Rationale**: SDK の実型では 4 値は非 optional だが、テストは部分的な result message を注入して欠落時の undefined を固定する（AC #5）。防御的な `typeof number` 読取が両者を満たす。error subtype は SDK が同じ 4 値を返すため抽出は success と対称にする。
- **Alternatives considered**: `extractedMetrics` を success 経路だけで抽出 → 却下（requirement 2 が error subtype も明示）。欠落を `0` 埋め → 却下（AC #5 違反、「実行はしたが計測不能」と「0 turn」を区別できなくなる）。

### D3: 記録は既存 `appendInvocation` 経路に metrics を相乗りさせる（新規エントリを作らない）

metrics は次の経路で usage.json に届く:

1. adapter が `AgentRunResult.invocationMetrics` に載せる（D2）。
2. `executor.ts:508-520`（agent step の success 構築）が `invocationMetrics: runResult.invocationMetrics` を `StepExecutionResult` に載せる。CLI step の success（`:613-621`）は runResult を持たないため対象外。
3. `commit-orchestrator.ts` の `applySuccessPostPersistEffects`（`:217-243`）が `result.invocationMetrics` を分解し、`appendInvocation` に渡す `CommandInvocation` に `...(invocationMetrics ?? {})` で spread する（runner が値を返さないときはフィールドを省略、requirement 4）。

既存 gate `if (modelUsage && deps.cwd && deps.slug)` は**変えない**。metrics は「既に modelUsage を載せているエントリ」に相乗りする。local runtime の agent step success では modelUsage が常在するため、実測 metrics はそのエントリに載る。

- **error subtype の metrics は永続化されない**: error 結果は `commitSuccess` を通らない（success のみ）。requirement 4 は success 経路の commit-orchestrator 呼び出しだけを対象にする。error subtype の metrics 抽出は AgentRunResult 上で adapter テストが固定する（AC #2）。将来 error の記録経路が必要になれば別 request で扱う（Open Questions）。

- **Rationale**: usage.json の追記点は 1 箇所（`applySuccessPostPersistEffects`）に集約済みで、sequential / parallel の両方がここを通る。gate を変えず spread で足すのが最小侵襲。`deriveFromJobState`（`store.ts:58`）は現状 production caller ゼロの死んだ経路なので触らない（StepRun への metrics 追加も不要 → `state/schema` を変えない）。
- **Alternatives considered**: metrics-only（modelUsage 欠落）でも新規エントリを書くよう gate を緩める → 却下（local success では modelUsage が常在し実益が無い一方、record 生成条件を変えると既存挙動に波及する）。StepRun に metrics を persist し `deriveFromJobState` 経由で載せる → 却下（`deriveFromJobState` に caller が無く、state schema 拡張はスコープ拡大）。

### D4: one-shot は `turnCount` placeholder を実 metrics に置き換える

`query-one-shot.ts` の success 抽出（`:174-197`）で `modelUsage` と同じ result message から 4 値を `extractInvocationMetrics` 相当で取り出し、`QueryOneShotResult` に `numTurns?` / `durationMs?` / `durationApiMs?` / `totalCostUsd?` を追加する。既存の `turnCount?`（"Reserved for future use"、常に undefined）は本変更が満たす placeholder なので `numTurns` に置き換えて削除する。queryOneShot は success のみ返す（非 success は throw）ため error subtype 抽出は無い。

- **Rationale**: request requirement 3 が「同じ 4 値を取り出す」を要求し、`turnCount` はまさにこの用途の予約枠。production caller がゼロなので repurpose は安全。フィールド名を `CommandInvocation` / `AgentInvocationMetrics` と揃える。
- **Alternatives considered**: `turnCount` を残し `numTurns` を併設 → 却下（turn 系フィールドが二重化して汚い。placeholder の役目は本変更で終わる）。
- **既存テスト影響**: `tests/unit/adapter/claude-code/query-one-shot.test.ts:90-99`（"turnCount is undefined"）は placeholder 前提のテストで、この repurpose に伴い `numTurns` の抽出を固定するテストへ更新する。これは AC #10 の保全対象（usage / job-stats）**外**のため許容される（tasks T-03 で明示）。

### D5: `usage show` は metrics を存在時のみ追記表示する

`src/core/command/usage-show.ts` の invocation 行出力（`:41-63`）で、`numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` のうち存在するものを追記する（例: `turns=… duration=…ms api=…ms cost=$…`）。全て欠落するエントリは既存出力のまま（追記なし）で例外を出さない（AC #6）。既存の modelUsage 集計・Totals ブロックは変えない。

- **Rationale**: 追加は additive。metrics 非保持エントリ（既存形式・managed）でも壊れないことが要件。
- **Alternatives considered**: 常に列を出し欠落を `-` にする → どちらでも可。逐次テキスト出力なので「存在時のみ追記」が既存フォーマットへの侵襲が少なく、AC #6 の「省略または `-`」に合致する。

### D6: `job stats` の cost は invocation 単位で実測優先・試算フォールバック。`costBasis` で判別可能にする

`deriveRunStat`（`job-stats.ts:146-171`）の costUsd 算出を次に変える。対象 job の各 invocation（既存の jobId フィルタ・legacy no-jobId 包含は不変）について:

- `typeof inv.totalCostUsd === "number"` → その値を総和に加える。**この invocation の `modelUsage` からは computeCostUsd を加えない**（二重計上防止）。`hasMeasured = true`。
- そうでなく `inv.modelUsage` があれば → 各 priced モデルの `computeCostUsd` を加える（既存挙動）。1 つでも priced なら `hasEstimated = true`。
- どちらでもない invocation（totalCostUsd 無し + priced modelUsage 無し）は総和に寄与しない。

`costUsd` は寄与があれば総和、無ければ `null`（既存と同じ）。判別情報として `JobStatRow` に `costBasis?: "measured" | "estimated" | "mixed" | null` を追加する:

- `hasMeasured && hasEstimated` → `"mixed"`
- `hasMeasured` のみ → `"measured"`
- `hasEstimated` のみ → `"estimated"`
- どちらも無い（costUsd も null） → `null`

この設計により、**単価表に無いモデルでも `totalCostUsd` があれば集計に載る**（問題 1 の「静かな脱落」を解消）。

- **Rationale**: invocation 単位で「実測があればそれ、無ければ試算」を選ぶと、同一 invocation の二重計上が構造的に起きない（各 invocation は高々 1 経路で寄与）。混在 run でも寄与は invocation ごとに 1 回。`costBasis` を run 単位に持たせれば「この run の $ は実測か試算か」が JSON / table から読める（AC #8）。
- **Alternatives considered**: run 全体で「totalCostUsd が 1 つでもあれば全部実測、無ければ全部試算」 → 却下（一部 invocation だけ実測を持つ混在 run で試算分を落とすか二重計上する）。cost の判別を出力の注記文だけで表す → 却下（JSON からは機械判定できない。フィールドの方が固定しやすい）。

### D7: `job stats` は run 単位の turn 数総和を出力する（無ければ null）

`deriveRunStat` で、対象 job の各 invocation の `inv.numTurns`（`typeof === "number"` のもの）を総和する。1 件も持たなければ `null`。`JobStatRow` に `turns?: number | null` を追加する（`durationSec` / `convergence` が null になり得るのと同じ扱い、AC #9）。table renderer には Turns 列を追加し、JSON には `turns` を含める。

- **Rationale**: turn 数はコスト主要因（context 量 × 周回数）。run 単位総和は既存の `convergence`（review-loop 周回数）と相補的な次元。
- **Alternatives considered**: invocation 単位で出す → 却下（`job stats` は run 単位のサマリ。run 単位総和が既存の粒度と整合）。

### D8: 新 `JobStatRow` フィールドは **optional** にして AC #10（既存 job-stats テスト無変更）を機械的に満たす

`turns?` / `costBasis?` を `JobStatRow` の **optional** フィールドにする。これにより:

- 既存テスト（TC-JSTATS-020/021/022/024/025 等）が `buildJobStatsReport` に渡す**手書き `JobStatRow` リテラル**は、新フィールドを省略しても TypeScript の型検査を通る（required だと全リテラルがコンパイルエラーになり AC #10 が広範に破れる）。
- TC-JSTATS-024（JSON row のキー exact 一致）は手書きリテラルを使うため、`turns`/`costBasis` を省略したリテラルは `JSON.stringify` で当該キーが出ず、`["convergence","costUsd","date","durationSec","outcome","slug"]` の exact 一致が**そのまま成立**する。
- 一方、実コード経路 `deriveRunStat` は `turns` / `costBasis` を**常に**設定する（値または `null`）ため、実際の `job stats` 出力（IO fixture 経由の JSON / table）には常に含まれる（AC #8/#9）。IO fixture テスト（TC-JSTATS-026..030）は row の exact-key 集合を検査せず個別フィールド（costUsd / durationSec 等）だけを見るため無変更で green。
- table renderer は Turns 列・cost basis 表示を追加するが、`renderJobStatsTable` のヘッダ検査（TC-JSTATS-020, `toContain`）・null セル検査（TC-JSTATS-021, ダッシュ数 `>= 3`）・summary 検査（TC-JSTATS-022）はいずれも列追加で壊れない（undefined は `-` で描画）。summary schema は**変えない**ため TC-JSTATS-025 も無変更で green。

- **Rationale**: request は「新出力の追加」（AC #8/#9）と「既存 job-stats テスト無変更 green」（AC #10）を同時に要求する。両者は「新フィールドを optional にし、実経路 `deriveRunStat` では常時設定・手書きリテラルでは省略可」とすることで、テスト改変なしに両立する。summary へ集計を足さないことで TC-JSTATS-025 も温存する。
- **Alternatives considered**: 新フィールドを required にして既存テストのリテラルを一斉修正 → 却下（AC #10「無変更」に反し、修正範囲も広い）。turn 総和/cost basis を summary にも足す → 却下（TC-JSTATS-025 の summary exact-key を壊す。request は run 単位のみ要求）。

## Risks / Trade-offs

- **[Risk] `JobStatRow` optional 化で実出力に `turns`/`costBasis` が入る一方、既存 exact-key テストは手書きリテラルで温存される二重基準になる** → **Mitigation**: 実経路 `deriveRunStat` が常時設定することを新規テスト（AC #8/#9 固定）で担保する。設計意図（optional はリテラル互換のため、実経路は常時設定）を design/tasks に明記し、レビューで「実出力に含まれる」ことを確認する。**[Permanent Trade-off]**: TC-JSTATS-024 は手書きリテラルを使い続けるため、`turns`/`costBasis` を含む行スキーマのロックとしては永続的に機能しなくなる。これは意図的な設計上のトレードオフであり、AC #10（既存テスト無変更）を優先した帰結。当該フィールドの実出力への含有は TC-JSTATS-024 ではなく AC #8/#9 の新テストが永続的に担保する役割を担う。
- **[Known Limitation] `totalCostUsd` は main work turn 分のコストのみを反映し、follow-up ターン分のコストを含まない** → `agent-runner.ts` の reportRetry / postWorkPrompts / outputVerification の各 follow-up ターンは query invocation ごとに modelUsage を積算するが（`:918-929`, `:965-977`）、`extractedMetrics`（D2）は success result message から 1 回だけ抽出し follow-up ループでは更新しない。各 query invocation の `total_cost_usd` はその invocation 単体のコストを表す（コメント `:915-917`）。D6 のロジック（`totalCostUsd` 有 → `computeCostUsd` をスキップ）と組み合わせると、follow-up ターンが発生したステップでは job stats の cost が実際より低くなる可能性がある。request の目標「実額が得られる」に対して、follow-up ターンが多い run（多段 retry 等）では誤差が拡大するという既知制限。follow-up ターンが少ない通常の run では影響は小さい。根本解は SDK が累計コストを返す経路が整備されるまで保留とする。
- **[Risk] error subtype の metrics が usage.json に載らない** → **Trade-off**: 既存の記録経路は success のみ（`applySuccessPostPersistEffects`）。requirement 4 も success 経路のみを対象にする。error subtype の抽出は adapter の `AgentRunResult` で固定（AC #2）し、永続化は将来課題とする（Open Questions）。silent な要件縮小ではなく明示的なスコープ確認。
- **[Risk] metrics は modelUsage を伴うエントリにのみ相乗りするため、modelUsage 欠落 + metrics 有りの稀ケースで記録されない** → **Mitigation**: local runtime の agent step success では modelUsage が常在するため実害は無い。gate を変えると既存の record 生成条件に波及するため変えない（D3）。design に前提として明記。
- **[Risk] `computeCostUsd` の試算（USD）と SDK の `total_cost_usd`（実測 USD）を同一 `costUsd` 総和に混ぜる** → **Trade-off**: 両者とも USD なので加算の単位は整合する。混在の事実は `costBasis: "mixed"` で可視化する（AC #8）。厳密な実測/試算の分離出力は Non-Goal。
- **[Risk] SDK ローカル型（`agent-runner.ts:370-374`）を拡張せず index-signature 経由の `unknown` 読取に頼る** → **Mitigation**: `extractInvocationMetrics` の `typeof number` ガードで型安全に number/undefined へ落とす。ローカル型に 4 フィールドを追記してもよいが、`unknown` 防御読取は欠落テスト（AC #5）とも整合するため必須ガードは残す。

## Open Questions

- error subtype で実行された step の metrics を usage.json に記録する経路が要るか（現状 success のみ記録）。local の実測記録が入った後、error step のコスト可視化の需要が出れば別 request で `applyFailurePostPersistEffects` 相当を検討する。
- managed runtime の session usage が turn 数・実コストを提供するか（Non-Goal。local 記録が入った後に調査）。

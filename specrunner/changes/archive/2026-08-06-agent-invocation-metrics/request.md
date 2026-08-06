# SDK result の turn 数・所要時間・実コストを usage.json に記録する — 事後分析が試算に頼る状態を解消する

## Meta

- **type**: new-feature
- **slug**: agent-invocation-metrics
- **base-branch**: main
- **adr**: false

## 背景

`job stats` は既に run 単位のコスト・収束回数・所要時間を集計している。ただし **cost は静的単価表からの試算**であり、SDK が返している実測値を使っていない。

Claude Agent SDK は result message で `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を返すが、spec-runner はそのうち `modelUsage` と `session_id` だけを取り出して残りを捨てている。結果として 3 つの問題がある。

**1. cost が試算のままで、単価表の保守に依存する。**`job stats` の `costUsd` は `modelUsage` のトークン数に `src/core/usage/pricing.ts` の静的単価を掛けて算出する。この表は保守が必要で、実際に現行世代のモデル（`claude-opus-5` / `claude-sonnet-5` / `claude-fable-5`）のエントリを持たない。未知モデルは `computeCostUsd` が `null` を返し、`job stats` の集計から**静かに脱落する**（エラーにも警告にもならない）。SDK は `total_cost_usd` を返しているので、記録すれば単価表への依存なしに実額が得られる。

**2. 試算は cache write の TTL 内訳を区別できない。**5 分 TTL（input × 1.25）と 1 時間 TTL（input × 2）で単価が倍違うが、`modelUsage.cacheCreationInputTokens` は内訳を持たない。単価表は一方の係数しか持てないため、試算には構造的な誤差幅が残る。

**3. turn 数という次元が存在しない。**agent が何周したかは記録されておらず、`job stats` も算出できない。turn 数はコストの主要因（context 量 × 周回数）でありながら、現状は cacheRead / cacheWrite 比を代理指標にするしかない。`duration_api_ms` も同様で、API 待ち時間とローカル処理時間の切り分けができない。

本 request は SDK が既に返している値を記録に載せ、`job stats` が試算でなく実測を報告できる状態にする。

## 現状コードの前提

- **SDK が返す値**: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` の `SDKResultSuccess` は `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` / `modelUsage` / `session_id` を持つ。`SDKResultError` も `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を持つ。
- **adapter のローカル型が絞っている**: `src/adapter/claude-code/agent-runner.ts:370-374` の `SDKResultSuccess` は `result` / `session_id` / `modelUsage` のみを宣言する（インデックスシグネチャ `[key: string]: unknown` を持つため、他フィールドは型上アクセス不可ではないが参照されていない）。
- **抽出箇所**: `src/adapter/claude-code/agent-runner.ts:827-844` が `lastResult.subtype === "success"` のとき `modelUsage` と `session_id` だけを取り出す。
- **one-shot 経路も同様**: `src/adapter/claude-code/query-one-shot.ts:177-196` が `modelUsage` のみ抽出する。この経路は `request-review` / `request-generate` コマンドが使う。
- **記録先の型**: `src/core/usage/types.ts:9-20` の `CommandInvocation` は `command` / `timestamp` / `modelUsage` / `jobId` / `stepName` のみ。
- **既存の集計コマンド**: `src/core/command/job-stats.ts` が `job stats` を実装済み。`durationSec`（StepRun の startedAt..endedAt）/ `convergence`（review-loop step の非 skip StepRun 数）/ `costUsd`（:147-169 で `computeCostUsd` の総和）を返す。turn 数の項目は無い。
- **cost は静的単価表からの試算**: `src/core/usage/pricing.ts:210-220` の `computeCostUsd(model, usage)` が `modelUsage` の 4 種トークンに単価表を掛ける。単価表（:40-166）は `claude-opus-4-8` / `claude-opus-4-7` / `claude-opus-4-6` / `claude-opus-4-5` / `claude-sonnet-4-6` / `claude-sonnet-4-5` / `claude-haiku-4-5` と gpt 系を持つが、`claude-opus-5` / `claude-sonnet-5` / `claude-fable-5` のエントリは無い。
- **未知モデルは静かに脱落する**: `computeCostUsd` は `lookupPricing(model) === null` のとき `null` を返す（:211-212）。`job-stats.ts:85` の doc comment に「sum of computeCostUsd for all non-null modelUsage entries」とあり、null は加算対象から外れる。単価表に無いモデルで実行された分は、警告なく集計から消える。
- **追記関数**: `src/core/usage/store.ts:42` の `appendInvocation`。append-only（エントリは削除・上書きされない）。
- **呼び出し側**: `src/core/step/commit-orchestrator.ts:233` が `appendInvocation` を呼ぶ。
- **managed runtime では usage が取れない場合がある**: `CommandInvocation.modelUsage` の doc comment に「null if usage was unavailable (e.g. managed runtime)」とある。`src/adapter/managed-agent/usage.ts:23-24` は `cache_creation.ephemeral_1h_input_tokens` と `ephemeral_5m_input_tokens` を合算して平坦化しており、TTL 内訳は managed 経路でも失われる。

## 要件

1. **`CommandInvocation` に metrics フィールドを追加する。**`numTurns?: number` / `durationMs?: number` / `durationApiMs?: number` / `totalCostUsd?: number` を optional で追加する。optional である理由は、値を提供しない runtime（managed 等）と既存の usage.json（本変更前に書かれたエントリ）を後方互換に保つため。既存フィールドの意味は変更しない。

2. **local runtime の agent step で SDK result から metrics を取り出す。**`src/adapter/claude-code/agent-runner.ts` の result 抽出箇所で、`modelUsage` / `session_id` と同じ result message から上記 4 値を取り出し、`AgentRunResult` に載せて呼び出し側へ渡す。`subtype === "success"` と `subtype !== "success"`（error 系）の両方で `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を取得する。値が欠落している場合は当該フィールドを undefined のままにする（0 で埋めない）。

3. **one-shot 経路でも同様に取り出す。**`src/adapter/claude-code/query-one-shot.ts` の抽出箇所を同じ形にする。`request-review` / `request-generate` の invocation にも metrics が載る。

4. **`appendInvocation` の呼び出し側が metrics を渡す。**`src/core/step/commit-orchestrator.ts` の呼び出しで、runner から受け取った metrics を `CommandInvocation` に載せる。runner が値を返さない場合はフィールドを省略する。

5. **`usage show` が metrics を表示する。**`src/core/command/usage-show.ts` の出力に、値が存在する invocation について turn 数・所要時間・実コストを含める。値が存在しない invocation では該当列を省略または `-` とし、既存出力の意味を変えない。

6. **`job stats` が実測 cost を優先する。**`src/core/command/job-stats.ts` の `costUsd` 算出を、記録された `totalCostUsd` の総和を優先し、それが存在しない invocation についてのみ既存の `computeCostUsd` 試算にフォールバックする形にする。実測と試算のどちらに基づく値かを出力から判別できるようにする（フィールド追加でも表示上の注記でもよい）。混在した run で総和が二重計上されないこと。

7. **`job stats` が turn 数を報告する。**記録された `numTurns` の run 単位の総和を出力に含める。値を持たない invocation は加算対象から除外し、`durationSec` / `convergence` が null になり得るのと同じ扱い（算出不能なら null）とする。

8. **既存 usage.json の読み取りが壊れないことをテストで固定する。**metrics フィールドを持たない既存形式の usage.json を読み込んだとき、パースが成功し `commandInvocations` が失われないことをテストする。

## スコープ外

- managed runtime での metrics 取得（CMA の session usage が turn 数・コストを提供するかは未調査。local 経路の記録が入った後に別途判断する）
- `src/core/usage/pricing.ts` の単価表に現行世代モデルを追加すること（実測 cost の記録が入れば試算はフォールバック経路になるため、表の更新は別判断）
- cache write の TTL 内訳の取得（SDK / API が TTL 別トークン数を返すかは未調査）
- コスト上限やコストに基づく制御（#784 の論点で「途中打ち切りは branch を半実装状態にする」として退けられている）
- 既存の `modelUsage` 記録形式の変更

## 受け入れ基準

1. `CommandInvocation` に `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が optional フィールドとして存在し、型定義に doc comment がある。
2. local runtime の agent step 実行後、`usage.json` の当該エントリに 4 つの metrics が記録されることを、SDK result message を注入した adapter テストで固定する。success / error 双方の subtype について検証する。
3. `query-one-shot` 経路でも同じ 4 値が記録されることをテストで固定する。
4. metrics フィールドを持たない既存形式の usage.json を `appendInvocation` で読み書きしても、既存エントリが保持され、パースエラーにならないことをテストで固定する。
5. SDK result に該当フィールドが欠落している場合、対応する `CommandInvocation` フィールドが undefined になり、`0` や `null` で埋められないことをテストで固定する。
6. `usage show` が metrics を含めて表示し、metrics を持たないエントリでも例外なく出力できることをテストで固定する。
7. `job stats` が試算 cost と実測 cost を別列で出力する。`costUsd` は `modelUsage` からの `computeCostUsd` 試算のまま（既存挙動を変更しない）、`measuredCostUsd` は `totalCostUsd` の総和とし、同一 invocation が両列に寄与しても二重計上にならないことをテストで固定する。
8. `job stats` の `measuredCostUsd` が、`totalCostUsd` を持つ invocation が 1 件も無い run では `null` になり、その場合も `costUsd` が従来どおり算出されることをテストで固定する。
9. `job stats` が run 単位の turn 数総和を出力し、`numTurns` を持つ invocation が 1 件も無い run では null になることをテストで固定する。
10. 既存の usage 関連テストおよび `job stats` の既存テストが無変更で green。

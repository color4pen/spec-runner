# Spec: SDK result の turn 数・所要時間・実コストを usage.json に記録する

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: local runtime の agent step は SDK result から 4 metrics を抽出する

local runtime の agent runner は、`modelUsage` / `session_id` を取り出すのと同じ result message から `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を取り出し、`AgentRunResult` に載せて呼び出し側へ渡す MUST。`subtype === "success"` と `subtype !== "success"`（error 系）の**両方**で抽出する MUST。result message に該当フィールドが欠落している場合、対応する metrics は `undefined` にする MUST（`0` や `null` で埋めない SHALL）。

#### Scenario: success result から 4 metrics を抽出する

**Given** SDK が `subtype: "success"` の result message を返し、`num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を含む
**When** agent runner が step を実行して結果を返す
**Then** 返り値の invocation metrics に 4 値が対応して載る

#### Scenario: error subtype の result からも 4 metrics を抽出する

**Given** SDK が `subtype !== "success"`（error 系）の result message を返し、4 metrics を含む
**When** agent runner が step を実行して error 結果を返す
**Then** 返り値の invocation metrics に 4 値が載る

#### Scenario: 欠落フィールドは undefined になる

**Given** SDK の result message が `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` の一部または全部を含まない
**When** agent runner が metrics を抽出する
**Then** 欠落した各フィールドは `undefined` であり、`0` にも `null` にもならない

### Requirement: one-shot 経路も同じ 4 metrics を抽出する

one-shot query（`queryOneShot`）は、success result から `modelUsage` を取り出すのと同じ result message で `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` を取り出し、その結果に `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` として載せる MUST。欠落フィールドは `undefined` にする SHALL。

#### Scenario: one-shot success result から 4 metrics を抽出する

**Given** `queryOneShot` が呼ばれ、SDK が 4 metrics を含む success result を返す
**When** one-shot 結果を組み立てる
**Then** 結果に `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が対応して載る

### Requirement: agent step の metrics が usage.json のエントリに記録される

local runtime の agent step が成功したとき、その step の `CommandInvocation`（usage.json エントリ）には、runner が返した `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が記録される MUST。runner が値を返さない（undefined）フィールドは、エントリから省略される SHALL（`0` や `null` で埋めない）。

#### Scenario: metrics を持つ agent step が usage.json に記録される

**Given** agent step の成功結果が 4 metrics と modelUsage を伴う
**When** step 完了の後処理で usage.json にエントリが追記される
**Then** 追記された `CommandInvocation` に 4 metrics が載り、既存の `modelUsage` 記録も保持される

#### Scenario: metrics 未提供の runtime ではフィールドが省略される

**Given** runner が metrics を返さない（値が undefined）step の成功結果
**When** usage.json にエントリが追記される
**Then** `CommandInvocation` に metrics フィールドは現れず、パースやその後の読取が壊れない

### Requirement: metrics を持たない既存形式の usage.json を後方互換に読み書きできる

本変更前に書かれた（metrics フィールドを持たない）usage.json を読み込んだとき、パースは成功し `commandInvocations` の既存エントリが失われない MUST。metrics フィールドを持たないエントリに対して `appendInvocation` で新エントリを追記しても、既存エントリは保持され、パースエラーにならない MUST。

#### Scenario: legacy usage.json を読み書きしても既存エントリが保持される

**Given** metrics フィールドを持たないエントリだけの usage.json が存在する
**When** それを読み込み、metrics 付きの新エントリを `appendInvocation` で追記する
**Then** 既存エントリはそのまま保持され、末尾に新エントリが追加され、読み直しても両者が読める

### Requirement: usage show が metrics を表示し、metrics 非保持でも壊れない

`usage show` は、metrics を持つ invocation について turn 数・所要時間・実コストを表示に含める MUST。metrics を持たない invocation では該当の値を省略または `-` とし、既存出力の意味を変えず例外なく出力する MUST。

#### Scenario: metrics 付きエントリで metrics を表示する

**Given** turn 数・所要時間・実コストを持つ invocation を含む usage.json
**When** `usage show <slug>` を実行する
**Then** 出力に当該 invocation の turn 数・所要時間・実コストが含まれる

#### Scenario: metrics 非保持エントリでも例外なく出力する

**Given** metrics フィールドを一切持たない invocation だけの usage.json
**When** `usage show <slug>` を実行する
**Then** 例外を出さずに既存の modelUsage 出力を表示し、metrics 列は省略または `-` になる

### Requirement: job stats は実測 cost を invocation 単位で優先し試算にフォールバックする

`job stats` の run 単位 cost は、`totalCostUsd` を持つ invocation についてはその実測値を用い、持たない invocation についてのみ既存の単価表試算（`computeCostUsd`）にフォールバックする MUST。1 つの invocation が実測と試算の両方に計上されない（二重計上しない）SHALL。実測と試算が混在する run でも run 総和が二重計上されない MUST。run の cost が実測・試算・混在のいずれに基づくかを出力から判別できる情報を含める MUST。

#### Scenario: totalCostUsd を持つ invocation は実測値で計上される

**Given** run の invocation が `totalCostUsd` を持つ（`modelUsage` も持つ）
**When** `job stats` が cost を算出する
**Then** その invocation は `totalCostUsd` の値で計上され、同 invocation の `modelUsage` からの試算は加算されない

#### Scenario: totalCostUsd を持たない invocation は試算にフォールバックする

**Given** run の invocation が `totalCostUsd` を持たず、priced な `modelUsage` を持つ
**When** `job stats` が cost を算出する
**Then** その invocation は `computeCostUsd` の試算で計上される

#### Scenario: 実測と試算が混在する run で二重計上しない

**Given** 同一 run に `totalCostUsd` を持つ invocation と持たない invocation が混在する
**When** `job stats` が run 総和を算出する
**Then** 実測分は `totalCostUsd`、試算分は `computeCostUsd` で各 invocation が高々 1 回だけ寄与し、cost が実測・試算・混在のいずれに基づくかを判別できる情報が出力に含まれる（この場合は「混在」）

#### Scenario: 単価表に無いモデルでも totalCostUsd があれば集計に載る

**Given** run の invocation が単価表に存在しないモデルの `modelUsage` を持つが、`totalCostUsd` も持つ
**When** `job stats` が cost を算出する
**Then** その invocation は `totalCostUsd` で計上され、集計から静かに脱落しない

### Requirement: job stats は run 単位の turn 数総和を出力する

`job stats` は、run 内の `numTurns` を持つ invocation の総和を run 単位で出力に含める MUST。`numTurns` を持つ invocation が 1 件も無い run では、turn 数総和は `null` になる MUST（`durationSec` / `convergence` が算出不能時に `null` になるのと同じ扱い）。

#### Scenario: numTurns を持つ invocation の総和を出力する

**Given** run の複数 invocation が `numTurns` を持つ
**When** `job stats` が run 統計を算出する
**Then** 出力に当該 run の turn 数総和が含まれる

#### Scenario: numTurns を持つ invocation が無い run は null になる

**Given** run のどの invocation も `numTurns` を持たない
**When** `job stats` が run 統計を算出する
**Then** 出力の turn 数総和は `null` になる

# Spec: usage / pricing と one-shot デフォルトモデルの provider 中立化

## Requirements

### Requirement: OpenAI / Codex 系モデルが数値の USD コストに解決される

`computeCostUsd(model, usage)` は、`BUILTIN_MODEL_REGISTRY` に provider `"openai"` として登録された
モデル名に対して、有限の数値（`null` でない）を MUST 返す。コストは既存の 4 軸合算式
（`inputTokens`・`outputTokens`・`cacheReadInputTokens`・`cacheCreationInputTokens` にそれぞれの単価を
乗じた総和）で SHALL 計算する。`ModelPricing` の型（`input` / `output` / `cacheRead` / `cacheWrite`）と
cost 計算式は変更しない SHALL。

#### Scenario: OpenAI/Codex モデル名で cost が数値になる

**Given** `BUILTIN_MODEL_REGISTRY` に provider `"openai"` で登録されたモデル名（例: `gpt-5.3-codex`）と、
正の token を持つ `ModelUsage`
**When** `computeCostUsd(model, usage)` を呼ぶ
**Then** 返り値は有限の数値であり `null` ではない

#### Scenario: 4 軸合算式が OpenAI モデルにも成立する

**Given** OpenAI モデルの `MODEL_PRICING` エントリと `ModelUsage`
**When** `computeCostUsd` の結果を、テーブルの単価から 4 軸合算式で再計算した値と比較する
**Then** 両者は一致する

### Requirement: registry 登録済みモデルは単価未登録のまま残らない

`BUILTIN_MODEL_REGISTRY` に登録された全モデルは、`lookupPricing()` で非 `null` の単価へ MUST 解決される
（registry の key 集合 ⊆ pricing で解決可能な key 集合）。

#### Scenario: 全 registry モデルが pricing を持つ

**Given** `BUILTIN_MODEL_REGISTRY` の全モデル名
**When** 各モデル名に対し `lookupPricing(name)` を呼ぶ
**Then** いずれも `null` ではない

### Requirement: 未知モデルは従来どおり料金不明（null / "$?"）を維持する

pricing テーブル（key 正規化後）に登録の無いモデルに対して、`computeCostUsd` は `null` を MUST 返す。
`formatUsd(null)` は `"$?"` を MUST 返す（既存挙動の維持＝退行なし）。

#### Scenario: 未知モデルは null を返す

**Given** registry にも pricing にも存在しないモデル名（例: `totally-unknown-model-xyz`）と任意の `ModelUsage`
**When** `computeCostUsd(model, usage)` を呼ぶ
**Then** 返り値は `null` であり、`formatUsd(null)` は `"$?"` を返す

### Requirement: one-shot クエリのデフォルトモデルは config 経由で解決される

`queryOneShot` は使用モデルを config 解決チェーン（`getStepExecutionConfig`）で SHALL 解決する。
`opts.model` も呼び出し側 config も値を与えない場合のフォールバックは、provider 固有のインラインリテラル
ではなく、config 層が所有する単一の共有定数 `DEFAULT_ONE_SHOT_MODEL` を MUST 用いる。

#### Scenario: config の steps.defaults.model が one-shot モデルを駆動する

**Given** `config.steps.defaults.model` に任意のモデル名が設定され、`opts.model` は未指定
**When** `queryOneShot` を実行する
**Then** SDK query に渡される `model` は `config.steps.defaults.model` の値である

#### Scenario: config も opts.model も無いときは共有定数にフォールバックする

**Given** `config` に steps モデル設定が無く、`opts.model` も `modelOverride` も未指定
**When** `queryOneShot` を実行する
**Then** SDK query に渡される `model` は `DEFAULT_ONE_SHOT_MODEL` の値であり、adapter 内のインライン
provider 固有リテラルは参照されない

### Requirement: 既存 Claude 系コストと型・式の互換を保つ

Claude 系モデルの cost 計算結果・`MODEL_PRICING` の既存エントリ・`ModelPricing` 型・cost 計算式・
`formatUsd` の出力契約は変更しない MUST。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: 既存 Claude コスト計算が不変

**Given** 既存の Claude 系モデルと `ModelUsage`
**When** `computeCostUsd` を呼ぶ
**Then** 本変更前と同じ数値を返す

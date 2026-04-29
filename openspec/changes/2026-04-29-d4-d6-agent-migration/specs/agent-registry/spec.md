## ADDED Requirements

### Requirement: AgentRegistry は Step 群から AgentDefinition を集約する pure な集約点である

`AgentRegistry` SHALL Step 配列から各 Step の `agent` フィールド（`AgentDefinition`）を収集し、`role` キーで索引可能なマップとして保持する。Registry は MUST Anthropic API を呼ばない pure なオブジェクトである。Registry は MUST `AgentDefinition` の構築責任を持たない（Step 側が所有）。

#### Scenario: fromSteps が全 Step の AgentDefinition を集約する

- **GIVEN** propose / spec-review / spec-fixer の 3 Step がそれぞれ `role: "propose" | "spec-review" | "spec-fixer"` の AgentDefinition を持つ
- **WHEN** `AgentRegistry.fromSteps([propose, specReview, specFixer])` を呼ぶ
- **THEN** registry に 3 つの AgentDefinition が登録される
- **AND** `registry.list().length === 3`
- **AND** `registry.get("propose")` が ProposeStep の AgentDefinition を返す
- **AND** `registry.get("spec-review")` が SpecReviewStep の AgentDefinition を返す
- **AND** `registry.get("spec-fixer")` が SpecFixerStep の AgentDefinition を返す

#### Scenario: 重複 role は構築時例外になる

- **GIVEN** 2 つの Step が同じ `agent.role = "propose"` を持つ
- **WHEN** `AgentRegistry.fromSteps([stepA, stepB])` を呼ぶ
- **THEN** `Duplicate agent role: propose` を含むメッセージで例外が throw される
- **AND** registry インスタンスは構築されない

#### Scenario: 未登録 role の get は undefined を返す

- **GIVEN** registry に `"propose"` のみ登録されている
- **WHEN** `registry.get("implementer" as StepName)` を呼ぶ
- **THEN** `undefined` を返す（例外を throw しない）

### Requirement: AgentRegistry は state を持たず、複数回呼び出しても同一結果を返す

Registry は MUST 構築後 immutable である。`get` / `list` / `hashOf` の呼び出しは SHALL 副作用を持たず、同一引数で同一結果を返す。

#### Scenario: list の冪等性

- **GIVEN** registry が構築済み
- **WHEN** `registry.list()` を 2 回呼ぶ
- **THEN** 戻り値は等価な配列（要素が同じ AgentDefinition）であり、registry の内部状態は変化しない

### Requirement: AgentRegistry.hashOf は AgentDefinition の canonical JSON SHA-256 を返す

`hashOf(role)` は SHALL 該当 role の AgentDefinition を canonical JSON にシリアライズし、SHA-256 を計算して 16 進文字列で返す。canonical JSON は MUST キーをソートし、空白を含まない。

#### Scenario: hashOf の決定性

- **GIVEN** 同一の AgentDefinition を持つ 2 つの registry インスタンス
- **WHEN** それぞれで `hashOf("propose")` を呼ぶ
- **THEN** 同じ 16 進文字列を返す

#### Scenario: hashOf は AgentDefinition の差分に反応する

- **GIVEN** 2 つの registry が同一 role の AgentDefinition を持つが、`system` 文字列の 1 文字だけ異なる
- **WHEN** それぞれで `hashOf("propose")` を呼ぶ
- **THEN** 異なる 16 進文字列を返す

#### Scenario: 未登録 role の hashOf は例外

- **WHEN** registry に未登録の role に対して `hashOf("implementer" as StepName)` を呼ぶ
- **THEN** `Unknown agent role: implementer` のメッセージで例外を throw する

### Requirement: Step を追加する際の編集箇所は Step 配列のみである

新しい Step を Pipeline に追加する際、AgentRegistry / Config schema / AgentSyncer の各モジュールのコードは MUST 編集不要である。新 Step を `steps` 配列に push するだけで registry への登録、config の per-role エントリ生成、syncer による sync が自動的に行われる。

#### Scenario: 4 つ目の Step 追加で他モジュールが無編集

- **GIVEN** 既存の 3 Step（propose / spec-review / spec-fixer）が動く registry
- **WHEN** 4 つ目の Step `ImplementerStep` を `steps` 配列に push し、`AgentRegistry.fromSteps(steps)` で再構築する
- **THEN** registry は 4 つの AgentDefinition を保持する
- **AND** `AgentRegistry` クラス自体のソースコードは無編集である
- **AND** Config schema 型定義（`agents: Record<StepName, AgentRecord>`）は無編集である
- **AND** `AgentSyncer.syncAll()` の実装は無編集で 4 role を sync する

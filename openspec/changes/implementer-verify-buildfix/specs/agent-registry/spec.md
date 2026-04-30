## MODIFIED Requirements

### Requirement: AgentRegistry は Step 群から AgentDefinition を集約する pure な集約点である

`AgentRegistry` SHALL Step 配列から `kind === "agent"` の Step のみを filter し、各 Step の `agent` フィールド（`AgentDefinition`）を収集して `role` キーで索引可能なマップとして保持する。`kind === "cli"` の Step は SHALL skip され、Registry には含まれない。Registry は MUST Anthropic API を呼ばない pure なオブジェクトである。Registry は MUST `AgentDefinition` の構築責任を持たない（Step 側が所有）。

#### Scenario: fromSteps が agent step の AgentDefinition を集約する

- **GIVEN** propose / spec-review / spec-fixer / implementer / build-fixer の 5 agent step がそれぞれ `role: "propose" | "spec-review" | "spec-fixer" | "implementer" | "build-fixer"` の AgentDefinition を持つ
- **WHEN** `AgentRegistry.fromSteps([propose, specReview, specFixer, implementer, buildFixer])` を呼ぶ
- **THEN** registry に 5 つの AgentDefinition が登録される
- **AND** `registry.list().length === 5`
- **AND** `registry.get("propose")` が ProposeStep の AgentDefinition を返す
- **AND** `registry.get("spec-review")` が SpecReviewStep の AgentDefinition を返す
- **AND** `registry.get("spec-fixer")` が SpecFixerStep の AgentDefinition を返す
- **AND** `registry.get("implementer")` が ImplementerStep の AgentDefinition を返す
- **AND** `registry.get("build-fixer")` が BuildFixerStep の AgentDefinition を返す

#### Scenario: fromSteps は CLI step を skip する

- **GIVEN** Step 配列に `kind: "cli"` の VerificationStep が含まれる
- **WHEN** `AgentRegistry.fromSteps([propose, specReview, specFixer, implementer, verification, buildFixer])` を呼ぶ
- **THEN** registry.list().length === 5（VerificationStep は集約されない）
- **AND** `registry.get("verification")` は `undefined` を返す

#### Scenario: 重複 role は構築時例外になる

- **GIVEN** 2 つの agent step が同じ `agent.role = "propose"` を持つ
- **WHEN** `AgentRegistry.fromSteps([stepA, stepB])` を呼ぶ
- **THEN** `Duplicate agent role: propose` を含むメッセージで例外が throw される
- **AND** registry インスタンスは構築されない

#### Scenario: 未登録 role の get は undefined を返す

- **GIVEN** registry に `"propose"` のみ登録されている
- **WHEN** `registry.get("implementer" as StepName)` を呼ぶ
- **THEN** `undefined` を返す（例外を throw しない）

### Requirement: Step を追加する際の編集箇所は Step 配列のみである

新しい Step を Pipeline に追加する際、AgentRegistry / Config schema / AgentSyncer の各モジュールのコードは MUST 編集不要である。新 agent step を `steps` 配列に push するだけで registry への登録、config の per-role エントリ生成、syncer による sync が自動的に行われる。新 CLI step を push した場合は SHALL Registry / Config / Syncer の対象外として自動的に skip される。

#### Scenario: 新しい agent step 追加で他モジュールが無編集

- **GIVEN** 既存の 5 agent step（propose / spec-review / spec-fixer / implementer / build-fixer）が動く registry
- **WHEN** 6 つ目の agent step を `steps` 配列に push し、`AgentRegistry.fromSteps(steps)` で再構築する
- **THEN** registry は 6 つの AgentDefinition を保持する
- **AND** `AgentRegistry` クラス自体のソースコードは無編集である
- **AND** Config schema 型定義は無編集である
- **AND** `AgentSyncer.syncAll()` の実装は無編集で 6 role を sync する

#### Scenario: 新しい CLI step 追加で他モジュールが無編集

- **GIVEN** 既存の 5 agent step + 1 CLI step（verification）が動く registry
- **WHEN** 2 つ目の CLI step（例: PR 作成 step）を `steps` 配列に push し、`AgentRegistry.fromSteps(steps)` で再構築する
- **THEN** registry は依然として 5 つの AgentDefinition を保持する（CLI step は skip）
- **AND** `AgentRegistry` クラス自体のソースコードは無編集である
- **AND** Config schema 型定義は無編集である
- **AND** `AgentSyncer.syncAll()` は依然として 5 role のみを sync する

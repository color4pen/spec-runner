# agent-definition-ownership Specification

## Purpose
TBD - created by archiving change 2026-04-29-d4-d6-agent-migration. Update Purpose after archive.
## Requirements
### Requirement: StepName は kebab-case の文字列 literal union である

`StepName` 型は MUST kebab-case の文字列 literal union（`"propose" | "spec-review" | "spec-fixer"` など）として定義される。`AgentDefinition.role` は MUST 対応する `Step.name` と同一の `StepName` 値を持つ。

camelCase 表現（`"specReview"`, `"specFixer"`）は `StepName` の正規形として使用しては SHALL ならない。旧 `AgentRole` 型（`"propose" | "specFixer" | "specReview"`）は MUST 削除される。

#### Scenario: AgentDefinition.role は StepName と一致する

- **GIVEN** `SpecReviewStep` のインスタンス
- **WHEN** `step.agent.role` を参照する
- **THEN** 値は `"spec-review"`（kebab-case）であり、`step.name` と等しい
- **AND** `"specReview"`（camelCase）ではない

#### Scenario: 旧 AgentRole 型は削除されている

- **GIVEN** `src/config/getAgentId.ts`（または旧 AgentRole 定義ファイル）
- **WHEN** コードを grep する
- **THEN** `AgentRole` 型宣言 (`"propose" | "specFixer" | "specReview"`) の参照が存在しない

### Requirement: 各 Step は完全な AgentDefinition を所有する

`Step.agent` は MUST 完全な `AgentDefinition` 値である。`AgentDefinition` は SHALL 以下のフィールドを持つ:
- `name: string` — 表示名（例: `"specrunner-propose"`）
- `role: StepName` — Step.name と一致する識別子
- `model: string` — Anthropic model ID
- `system: string` — Agent の system prompt（完全な文字列）
- `tools: ToolSpec[]` — Anthropic SDK に渡す Custom Tool spec の配列
- `capabilities?: AgentCapabilities` — 予約席（Phase 2 で最小権限宣言に使う）

`Step.agent` の `{ agentId: string }` プレースホルダ表現は MUST 廃止される。

#### Scenario: ProposeStep が完全な AgentDefinition を持つ

- **GIVEN** `ProposeStep` のインスタンス
- **WHEN** `step.agent` を参照する
- **THEN** `name === "specrunner-propose"` および `role === "propose"` を満たす AgentDefinition が返る
- **AND** `system` は空でない文字列である
- **AND** `tools` は `register_branch` の ToolSpec を含む配列である
- **AND** `step.agent.agentId` のようなプレースホルダフィールドは存在しない

#### Scenario: SpecReviewStep が独自の AgentDefinition を持つ

- **GIVEN** `SpecReviewStep` のインスタンス
- **WHEN** `step.agent` を参照する
- **THEN** `role === "spec-review"` を満たす AgentDefinition が返る
- **AND** `system` は spec-review 専用の system prompt（propose 用とは別の文字列）である
- **AND** `tools` は空配列または最小集合である（propose 用の `register_branch` を含まない）

#### Scenario: SpecFixerStep が独自の AgentDefinition を持つ

- **GIVEN** `SpecFixerStep` のインスタンス
- **WHEN** `step.agent` を参照する
- **THEN** `role === "spec-fixer"` を満たす AgentDefinition が返る
- **AND** `system` は spec-fixer 専用の system prompt である
- **AND** `tools` は空配列である（`register_branch` を含まない）

### Requirement: spec-review Agent の system prompt は最低限の内容契約を満たす

`SpecReviewStep.agent.system`（spec-review Agent の system prompt）は MUST 以下を満たす:

- (a) `.claude/rules/review-standards.md` の verdict（`approved` / `needs-fix` / `escalation`）および severity（CRITICAL / HIGH / MEDIUM / LOW）の規約を参照すること
- (b) tools = []（read-only Agent）の前提で動作し、Custom Tool の呼び出しを必要としないこと
- (c) 出力ファイルパス契約として `<request-path>/spec-review-result-{NNN}.md` への書き込みを含むこと

これらの契約を欠く system prompt は spec-review Step の実装として SHALL 受け入れられない。

#### Scenario: spec-review system prompt が verdict / severity 規約を含む

- **GIVEN** `SpecReviewStep.agent.system` の文字列
- **WHEN** 内容を確認する
- **THEN** `approved` / `needs-fix` / `escalation` の 3 値 verdict が明示されている
- **AND** CRITICAL / HIGH / MEDIUM / LOW の severity 定義または参照が含まれている
- **AND** 出力ファイルを `spec-review-result-{NNN}.md` へ書き込む契約が記述されている

### Requirement: Step ごとに独立した Anthropic Agent を使う

Step と Anthropic Agent は MUST 1:1 対応する。同一 Anthropic Agent ID が異なる role で再利用されては SHALL ならない。これは Managed Agents SDK の制約（同一 Agent を異なる role で使うと system prompt と user message が矛盾する）に基づく構造的決定である。

#### Scenario: spec-review が propose Agent を流用しない

- **GIVEN** `specrunner init` 完了後の config
- **WHEN** `config.agents["spec-review"].agentId` と `config.agents.propose.agentId` を比較する
- **THEN** 2 つの値は異なる文字列である
- **AND** Anthropic API 上に 2 つの独立した Agent が存在する

### Requirement: agent.tools の各 ToolSpec は Step.toolHandlers に対応するエントリを持つ

`AgentDefinition.tools`（`ToolSpec[]`）の各エントリについて、`ToolSpec.name` は MUST 同じ Step の `toolHandlers` Map に対応するキーを持つ。`agent.tools = []` の Step は `toolHandlers` を省略してよい。

この不変条件により、Agent に宣言された Custom Tool に handler が存在しない状態（= 未処理の tool call がランタイムで発生する）を構造的に防ぐ。

#### Scenario: ProposeStep の tools と toolHandlers が対応している

- **GIVEN** `ProposeStep` のインスタンス
- **WHEN** `step.agent.tools` と `step.toolHandlers` を確認する
- **THEN** `step.agent.tools` に `{ name: "register_branch" }` が含まれる
- **AND** `step.toolHandlers.get("register_branch")` が存在する（undefined でない）

#### Scenario: SpecReviewStep は tools = [] なので toolHandlers を省略できる

- **GIVEN** `SpecReviewStep` のインスタンス
- **WHEN** `step.agent.tools` を確認する
- **THEN** `step.agent.tools` は空配列である
- **AND** `step.toolHandlers` は undefined または空 Map であってよい

### Requirement: Step ファイルは self-contained である

各 Step ファイル（`src/core/step/<name>.ts`）は MUST 自身の system prompt / model / tools を class 内で宣言する。prompt 文字列を別ファイル（`src/prompts/`）に置く場合でも、Step ファイルから直接 import して `AgentDefinition.system` に渡し、Step ファイルを読めば prompt の出所が辿れる状態を SHALL 維持する。

#### Scenario: Step ファイル単独で agent 定義が完結する

- **GIVEN** `src/core/step/propose.ts` のソースコード
- **WHEN** ファイルを開く
- **THEN** `AgentDefinition` の `name` / `role` / `model` / `system` / `tools` のいずれもが、このファイル内（あるいはファイルから直接 import している箇所）で参照可能である
- **AND** prompts/ や tools/ の登録を grep して辿る必要がない

### Requirement: ToolSpec は core 側で定義される interface であり SDK 型を直接 re-export しない

`ToolSpec` は MUST `src/core/agent/definition.ts` または `src/core/tools/types.ts` の core 側で定義された interface である。`@anthropic-ai/sdk` の型（例: `Tool`, `ToolParam`）を直接 re-export しては SHALL ならない。adapter 側（`src/adapter/anthropic/`）が `ToolSpec` を SDK の具象型へ map する責務を持つ。

これにより、core 内のすべてのコードは SDK への直接依存を持たず、`ToolSpec` が変わっても adapter 層の変換コードのみを修正すれば済む。

#### Scenario: propose の register_branch は ToolSpec として宣言され、SDK 型に依存しない

- **GIVEN** `ProposeStep` の `agent.tools` 配列
- **WHEN** `agent.tools[0]`（`register_branch`）の型を確認する
- **THEN** 型は `ToolSpec`（core で定義された interface）であり、`@anthropic-ai/sdk` の import から派生した型ではない
- **AND** `adapter/anthropic/` のコードが `ToolSpec` → SDK の `Tool` 型へ変換する責務を持つ

#### Scenario: core 側コードが SDK 型を import しない

- **GIVEN** `src/core/` 配下の全ファイル
- **WHEN** ファイルを grep する
- **THEN** `@anthropic-ai/sdk` の直接 import が存在しない
- **AND** `ToolSpec` の定義は core 側のみに存在する

### Requirement: AgentCapabilities は予約席として型定義される

`AgentCapabilities` 型は MUST `network?: boolean` および `gitWrite?: boolean` のオプショナルフィールドを持つ interface として定義される。本 request では SHALL 予約席であり、実機の挙動には影響しない。Phase 2 で最小権限宣言に使う。

#### Scenario: AgentCapabilities の型定義

- **GIVEN** `src/core/agent/definition.ts`
- **WHEN** `AgentCapabilities` 型を確認する
- **THEN** `network?: boolean` および `gitWrite?: boolean` を含む interface である
- **AND** いずれのフィールドも `readonly` である
- **AND** Step の AgentDefinition でこのフィールドを設定しても、本 request の挙動（Agent 作成・session 作成）には影響を与えない


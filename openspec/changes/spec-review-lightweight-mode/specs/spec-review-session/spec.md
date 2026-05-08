# Delta Spec: spec-review-session (spec-review-lightweight-mode)

## MODIFIED Requirements

### Requirement: spec-review の初回メッセージは specReviewMode に応じた review scope instruction を含まなければならない

The initial message MUST include a review scope instruction corresponding to the specReviewMode. `{{SPEC_REVIEW_MODE}}` プレースホルダには、`buildSpecReviewModeInstruction(mode)` の戻り値が注入される。

full mode: セキュリティを含む全観点の review を指示する 1 行の instruction。

lightweight mode: 振る舞い不変の前提を宣言し、review-standards.md のカテゴリに対応した Verify / Simplify / Skip の 3 段階で review scope を構造化した instruction。

This MODIFIED Requirement replaces:
> 既存の暗黙的な review scope 指示（セキュリティ省略の 1 行のみ）

#### Scenario: lightweight mode の review scope instruction

- **WHEN** `buildSpecReviewModeInstruction("lightweight")` が呼ばれる
- **THEN** 戻り値に "behavior-preserving" を含む前提宣言がある
- **AND** Verify セクションに architecture と correctness が列挙される
- **AND** Simplify セクションに completeness（タスク分割の網羅性のみ）と consistency（既存 spec 照合の省略）が列挙される
- **AND** Skip セクションに feasibility と security が列挙される

#### Scenario: full mode の review scope instruction（変更なし）

- **WHEN** `buildSpecReviewModeInstruction("full")` が呼ばれる
- **THEN** 戻り値が "Full review including security considerations" を含む 1 行の instruction である

## ADDED Requirements

### Requirement: AgentStep は runtime state に基づく動的 maxTurns 解決をサポートしなければならない

AgentStep MUST support dynamic maxTurns resolution based on runtime state. `AgentStep` interface は optional な `getMaxTurns(state: JobState): number | undefined` メソッドを持つ。ClaudeCodeRunner は `getStepExecutionConfig()` の `stepDefaults.maxTurns` を算出する際、`step.getMaxTurns?.(ctx.state) ?? step.maxTurns` を使用する。これにより、config override（priority 1-2）を維持したまま、step definition レイヤー（priority 3）で runtime state に応じた maxTurns 調整が可能になる。

#### Scenario: getMaxTurns が定義されていない step

- **WHEN** `step.getMaxTurns` が undefined である AgentStep を ClaudeCodeRunner が実行する
- **THEN** `step.maxTurns` が stepDefaults として使用される（既存の挙動と同一）

#### Scenario: getMaxTurns が number を返す step

- **WHEN** `step.getMaxTurns(state)` が 10 を返す
- **AND** `step.maxTurns` が 15 である
- **THEN** stepDefaults.maxTurns は 10 が使用される

#### Scenario: config override は getMaxTurns より優先される

- **WHEN** `config.steps["spec-review"].maxTurns` が 20 に設定されている
- **AND** `step.getMaxTurns(state)` が 10 を返す
- **THEN** 最終的な maxTurns は 20 である（config priority 1 が最優先）

### Requirement: spec-review step は lightweight mode 時に maxTurns を 10 に制限しなければならない

The spec-review step MUST limit maxTurns to 10 in lightweight mode. SpecReviewStep は `getMaxTurns` を実装し、`getSpecReviewMode(state.request.type)` が "lightweight" を返す場合に 10 を返す。"full" の場合は undefined を返し、`step.maxTurns: 15` にフォールバックする。

#### Scenario: refactoring type の maxTurns

- **WHEN** `state.request.type` が "refactoring" である spec-review step を実行する
- **THEN** stepDefaults.maxTurns は 10 である

#### Scenario: new-feature type の maxTurns

- **WHEN** `state.request.type` が "new-feature" である spec-review step を実行する
- **THEN** stepDefaults.maxTurns は 15 である（step.maxTurns へのフォールバック）

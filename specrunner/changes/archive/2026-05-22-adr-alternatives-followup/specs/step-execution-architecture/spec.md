## Requirements

### Requirement: AgentStep は getFollowUpPrompt で動的に followUpPrompt を解決できる

`AgentStep` interface SHALL `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` optional method を持つ。この method は実行時の state / deps に基づいて followUpPrompt を動的に解決する。

`getFollowUpPrompt` が定義されている場合、`StepExecutor` はその戻り値を静的 `followUpPrompt` field より優先して使用する。`getFollowUpPrompt` が `undefined` を返した場合、静的 `followUpPrompt` にフォールバックする（`??` 演算子）。`getFollowUpPrompt` が未定義の step は従来通り静的 `followUpPrompt` を使用する。

このパターンは `getMaxTurns` と同型の optional method override である。

#### Scenario: getFollowUpPrompt が AgentStep interface に存在する

- **WHEN** `AgentStep` interface の型定義を inspect する
- **THEN** `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` method が存在する
- **AND** method は optional である

#### Scenario: getFollowUpPrompt 未定義の step は静的 followUpPrompt を使用する

- **GIVEN** `getFollowUpPrompt` が未定義で `followUpPrompt` が `"rules.md を読み直してください"` である AgentStep
- **WHEN** `StepExecutor.runAgentStep` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は `"rules.md を読み直してください"` である

#### Scenario: getFollowUpPrompt が string を返すと静的 followUpPrompt より優先される

- **GIVEN** `getFollowUpPrompt` が `"dynamic prompt"` を返し、静的 `followUpPrompt` が `"static prompt"` である AgentStep
- **WHEN** `StepExecutor.runAgentStep` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は `"dynamic prompt"` である

#### Scenario: getFollowUpPrompt が undefined を返すと静的 followUpPrompt にフォールバックする

- **GIVEN** `getFollowUpPrompt` が `undefined` を返し、静的 `followUpPrompt` が `"static prompt"` である AgentStep
- **WHEN** `StepExecutor.runAgentStep` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は `"static prompt"` である

### Requirement: StepExecutor は followUpPrompt を AgentRunContext に転記する

`StepExecutor.runAgentStep` SHALL `AgentStep.followUpPrompt` を `AgentRunContext.followUpPrompt` に転記する。転記は `needsProjectContext` → `projectContext` と同型の executor 転記パターンに従う。

`getFollowUpPrompt` が定義されている場合は `step.getFollowUpPrompt(state, deps) ?? step.followUpPrompt` で解決した値を転記する。

`StepExecutor` は `followUpPrompt` の解釈や実行を行わない。転記のみを責務とし、2 段実行の制御は adapter に委ねる。

executor / finalizeStep の既存ロジックは無改修とする。`runner.run(ctx)` が内部 2 turn でも executor からは 1 回の await で 1 つの `AgentRunResult` を受け取る。

#### Scenario: executor が followUpPrompt を ctx に転記する

- **GIVEN** `step.followUpPrompt` が `"rules.md を読み直して修正してください"` である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は `"rules.md を読み直して修正してください"` である

#### Scenario: executor が followUpPrompt 未指定時に undefined を渡す

- **GIVEN** `step.followUpPrompt` が undefined である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は undefined である

#### Scenario: executor と finalizeStep が無改修である

- **WHEN** `StepExecutor.runAgentStep` のソースを inspect する
- **THEN** `runner.run(ctx)` は 1 回呼ばれる
- **AND** `finalizeStep` は `followUpPrompt` を参照しない
- **AND** pipeline の step 遷移 / state machine / FIXER_STEP_NAMES に変更はない

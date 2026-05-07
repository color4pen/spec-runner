# Delta Spec: step-execution-architecture — branch format に jobId suffix を付与

## Changed Requirement: setsBranch の branch 生成フォーマット

**Previous**: `setsBranch === true && !state.branch` の場合、`state.branch = feat/${deps.slug}` を設定する。

**Updated**: `setsBranch === true && !state.branch` の場合、`state.branch = feat/${deps.slug}-${state.jobId.slice(0, 8)}` を設定する。`jobId` は UUID 形式であり、先頭 8 文字は hex 文字列。

#### Scenario: setsBranch generates jobId-suffixed branch

- **GIVEN** a step with `setsBranch: true` and `state.branch` is absent
- **AND** `state.jobId` is `"45e9e720-1234-5678-abcd-ef0123456789"`
- **AND** `deps.slug` is `"my-feature"`
- **WHEN** `StepExecutor` processes the `setsBranch` flag after step completion
- **THEN** `state.branch` is set to `"feat/my-feature-45e9e720"`

#### Scenario: ProposeStep.buildMessage passes jobId-suffixed branch to agent

- **GIVEN** `ProposeStep.buildMessage(state, deps)` is invoked
- **AND** `state.jobId` is `"abcdef01-..."`
- **AND** `deps.slug` is `"my-feature"`
- **WHEN** the resulting message is inspected
- **THEN** the `{{BRANCH}}` placeholder is replaced with `"feat/my-feature-abcdef01"`
- **AND** the `{{SLUG}}` placeholder is replaced with `"my-feature"` (unchanged)

## Rationale

同じ slug で `specrunner run` を複数回実行した際に、前回 run の生成ファイル（`review-feedback-001.md` 等）が新 job に持ち越される問題を解消する。branch 名に jobId suffix を含めることで、各 run が独立した branch で動作する。

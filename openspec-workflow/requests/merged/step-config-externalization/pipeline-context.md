## Paths

- **request-md**: openspec-workflow/requests/active/step-config-externalization/request.md
- **request-path**: openspec-workflow/requests/active/step-config-externalization
- **change-folder**: openspec/changes/step-config-externalization/
- **slug**: step-config-externalization
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-step-config-externalization
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/step-config-externalization

## Workflow Options

- enabled: [test-case-generator, adr, module-architect]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: config schema 設計、解決順序ロジック、後方互換性
- **result**: openspec-workflow/requests/active/step-config-externalization/spec-review-result-001.md

## Test Case Generation

- **must-areas**: config 解決順序、後方互換（steps 未設定時）、maxTurns: null → unlimited、init での steps.defaults 生成

## Code Review Configuration

- **emphasis**: config 読み込みと解決ロジック、ClaudeCodeRunner への適用、後方互換性

## Module Analysis Configuration

- **output**: openspec/changes/step-config-externalization/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 200k
- model-context-size-source: request-meta
- step skips: なし
- retries: spec-review iter 1 needs-fix → spec-fixer → iter 2 approved
- Step 9.5: no candidates detected

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md

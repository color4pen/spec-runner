## Paths

- **request-md**: openspec-workflow/requests/active/propose-openspec-cli-and-step-model-config/request.md
- **request-path**: openspec-workflow/requests/active/propose-openspec-cli-and-step-model-config
- **change-folder**: openspec/changes/propose-openspec-cli-and-step-model-config/
- **slug**: propose-openspec-cli-and-step-model-config

## Type

- **type**: spec-change
- **branch**: change/propose-openspec-cli-and-step-model-config

## Workflow Options

- enabled: [test-case-generator, adr]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 既存 spec との整合性（後方互換性）、影響範囲の網羅性
- **result**: openspec-workflow/requests/active/propose-openspec-cli-and-step-model-config/spec-review-result-001.md

## Test Case Generation

- **must-areas**: openspec CLI integration in propose, per-step model selection, per-step maxTurns configuration

## Code Review Configuration

- **emphasis**: ClaudeCodeRunner model/maxTurns 適用、propose system prompt の openspec CLI 呼び出しフロー

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし
- Step 9.5: recommended: [security-reviewer]

## Shared Resources

- **constraints**: openspec-workflow/constraints.md（存在する場合）
- **review-lessons**: openspec-workflow/review-lessons.md（存在する場合）

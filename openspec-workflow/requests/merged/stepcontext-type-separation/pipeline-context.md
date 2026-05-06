## Paths

- **request-md**: openspec-workflow/requests/active/stepcontext-type-separation/request.md
- **request-path**: openspec-workflow/requests/active/stepcontext-type-separation
- **change-folder**: openspec/changes/stepcontext-type-separation/
- **slug**: stepcontext-type-separation
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-stepcontext-type-separation
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: refactoring
- **branch**: refactor/stepcontext-type-separation

## Workflow Options

- enabled: [test-case-generator]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 振る舞い不変の証拠、既存テストの担保、architecture/maintainability 重視
- **result**: openspec-workflow/requests/active/stepcontext-type-separation/spec-review-result-001.md

## Test Case Generation

- **must-areas**: StepContext 型の接続、PipelineDeps extends StepContext の互換性、undefined as any 除去、_updatedState 廃止、executor 統合

## Code Review Configuration

- **emphasis**: architecture (0.25), maintainability (0.15), 振る舞い不変の検証

## Notes

- model-context-size: 1M
- model-context-size-source: runtime-detection
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 7a adr, reason: enabled-absent(adr)
- retries: なし
- Step 9.5: recommended: [security-reviewer]

## Shared Resources

- **constraints**: openspec-workflow/constraints.md（存在する場合）
- **review-lessons**: openspec-workflow/review-lessons.md（存在する場合）

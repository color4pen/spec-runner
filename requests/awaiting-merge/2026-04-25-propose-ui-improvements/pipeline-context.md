## Paths

- **request-md**: requests/active/2026-04-25-propose-ui-improvements/request.md
- **request-path**: requests/active/2026-04-25-propose-ui-improvements
- **change-folder**: openspec/changes/2026-04-25-propose-ui-improvements/
- **slug**: 2026-04-25-propose-ui-improvements
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-25-propose-ui-improvements
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: refactoring
- **branch**: refactor/2026-04-25-propose-ui-improvements

## Workflow Options

- enabled: []

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 振る舞い不変の検証、既存テストとの整合性
- **result**: requests/active/2026-04-25-propose-ui-improvements/spec-review-result-001.md

## Code Review Configuration

- **emphasis**: architecture, maintainability（refactoring weight override）

## Notes

- model-context-size: 1M
- model-context-size-source: runtime-detection (Opus 4.6 1M context)
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 3.5 test-case-generator, reason: enabled-absent(test-case-generator)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 7a adr, reason: enabled-absent(adr)
- retries: なし
- Step 9.5: recommended: [security-reviewer, module-architect]

## Shared Resources

- **constraints**: docs/constraints.md（存在する場合）
- **review-lessons**: docs/review-lessons.md（存在する場合）

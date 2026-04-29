# Pipeline Context — 2026-04-30-port-tidying

## Paths

- **request-md**: openspec-workflow/requests/active/2026-04-30-port-tidying/request.md
- **request-path**: openspec-workflow/requests/active/2026-04-30-port-tidying
- **change-folder**: openspec/changes/2026-04-30-port-tidying/
- **slug**: 2026-04-30-port-tidying
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-30-port-tidying
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: refactoring
- **branch**: refactor/2026-04-30-port-tidying

## Workflow Options

- enabled: []

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 振る舞い不変性、既存仕様との整合性、port 契約の純度、test rewrite の網羅性
- **result**: openspec-workflow/requests/active/2026-04-30-port-tidying/spec-review-result-{NNN}.md

## Code Review Configuration

- **emphasis**: 振る舞い不変、port purity、grep 残存ゼロ、既存テスト全 PASS、weight オーバーライド (architecture 0.25 / maintainability 0.15 / testing 0.05)

## Notes

- model-context-size: 1M
- model-context-size-source: user-prompt
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 3.5 test-case-generator, reason: enabled-absent(test-case-generator)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 7a adr, reason: enabled-absent(adr)
- retries:
  - Step 3 spec-review iter1 needs-fix(6.7) → spec-fixer → iter2 approved(8.4)
  - Step 4 implementer pre-applied delta to canonical specs → orchestrator fixup commit 2588c5f
- Step 9.5 実行履歴:
  - Step 9.5: recommended: [security-reviewer, pattern-reviewer]
- learning extraction already completed at /request-execute Step 9

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md
- **learned-patterns**: openspec-workflow/learned-patterns.md
- **depends-on**: openspec-workflow/requests/merged/2026-04-29-executor-cleanup/

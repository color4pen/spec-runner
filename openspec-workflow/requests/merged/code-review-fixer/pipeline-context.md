# Pipeline Context — code-review-fixer

## Paths

- **request-md**: openspec-workflow/requests/active/code-review-fixer/request.md
- **request-path**: openspec-workflow/requests/active/code-review-fixer
- **change-folder**: openspec/changes/code-review-fixer/
- **slug**: code-review-fixer
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-code-review-fixer
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/code-review-fixer

## Workflow Options

- enabled: [module-architect, test-case-generator, adr]

## Spec Review Configuration

- **agents**: architect (always), spec-reviewer (always)
- **emphasis**: 既存 Step 抽象 (AgentStep | CliStep) との整合性、LOOP_ERROR_CODES lookup table の対称拡張、spec-review との parser 共通化判断
- **result**: openspec-workflow/requests/active/code-review-fixer/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - code-review Step interface 適合性 (kind=agent / role=code-review / resultFilePath / parseResult)
  - code-fixer Step interface 適合性 (kind=agent / role=code-fixer / null parseResult / completionVerdict=approved)
  - Pipeline transitions (verification passed → code-review、code-review approved → end、code-review needs-fix → code-fixer、code-fixer approved → code-review、escalation 経路)
  - LOOP_ERROR_CODES に code-review エントリ追加・grep-no-step-name-hardcode テストの継続 PASS

## Code Review Configuration

- **emphasis**: discriminated union への新 Step 追加が pattern 通りに行われているか、parseSpecReviewVerdict との regex 共通化、agent system prompt の役割分離 (Managed Agents SDK 制約遵守)、loop guard / max iterations の設定経路

## Module Analysis Configuration

- **output**: openspec/changes/code-review-fixer/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips: Step 7b pending-changes (no bump trigger paths changed); Step 9b distill-learnings (count=3<5)
- retries: spec-review iter1 needs-fix → spec-fixer → iter2 approved (8.85); code-review iter1 needs-fix (HIGH executor.ts) → code-fixer commit 00f6dfe → iter2 approved (7.85)
- Step 9.5: no candidates detected

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md
- **learned-patterns**: openspec-workflow/learned-patterns.md

## Fixup Review Scope

- **review-scope**:
  - src/prompts/code-review-system.ts

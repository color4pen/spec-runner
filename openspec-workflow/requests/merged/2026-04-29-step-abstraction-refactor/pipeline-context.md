# Pipeline Context

## Paths

- **request-md**: openspec-workflow/requests/active/2026-04-29-step-abstraction-refactor/request.md
- **request-path**: openspec-workflow/requests/active/2026-04-29-step-abstraction-refactor
- **change-folder**: openspec/changes/2026-04-29-step-abstraction-refactor/
- **slug**: 2026-04-29-step-abstraction-refactor
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-29-step-abstraction-refactor
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: refactoring
- **branch**: refactor/2026-04-29-step-abstraction-refactor

## Workflow Options

- enabled: [test-case-generator, adr, module-architect, security-reviewer]

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer
- **emphasis**: 振る舞い不変の確認、既存仕様との整合性、モジュール境界の明確性、認証・認可・入力バリデーション（security-reviewer enabled）
- **result**: openspec-workflow/requests/active/2026-04-29-step-abstraction-refactor/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - 旧 JobState schema の load + normalization (後方互換性)
  - StepRun[] schema の append / 永続化
  - Step interface 実装（propose / spec-review / spec-fixer）の振る舞い不変
  - Pipeline class の transition table 駆動（spec-review ↔ spec-fixer の cycle）
  - EventBus の subscribe / emit
  - Custom Tool の Step 同居化（global registry 廃止後）
  - エラーコード維持 (`SESSION_TIMEOUT` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` 等)

## Code Review Configuration

- **emphasis**: 振る舞い不変、モジュール境界（core ⇄ adapter ⇄ store ⇄ port）、core 層の SDK 直接 import 禁止、認証・認可・入力検証（security-reviewer enabled）

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-29-step-abstraction-refactor/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: user-prompt (claude-opus-4-7[1m])
- step skips:
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 1a cleanup-stale-knowledge, reason: type-mismatch(refactoring; only runs for spec-change)
- retries: spec-fixer x2 (Step 3), build-fixer x1 (Step 5b), code-fixer x2 (Step 6)
- Step 9.5: no candidates detected (security-reviewer / module-architect / test-case-generator already in enabled; pattern-reviewer regex did not match)

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md（存在確認は実行時）
- **dependency**: openspec-workflow/requests/merged/2026-04-29-spec-fixer-iteration-loop/

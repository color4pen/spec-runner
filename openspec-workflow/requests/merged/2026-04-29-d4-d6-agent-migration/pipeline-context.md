# Pipeline Context — 2026-04-29-d4-d6-agent-migration

## Paths

- **request-md**: openspec-workflow/requests/active/2026-04-29-d4-d6-agent-migration/request.md
- **request-path**: openspec-workflow/requests/active/2026-04-29-d4-d6-agent-migration
- **change-folder**: openspec/changes/2026-04-29-d4-d6-agent-migration/
- **slug**: 2026-04-29-d4-d6-agent-migration
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-29-d4-d6-agent-migration
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: refactoring
- **branch**: refactor/2026-04-29-d4-d6-agent-migration

## Workflow Options

- enabled: [module-architect, test-case-generator]

## Spec Review Configuration

- **agents**: architect, spec-reviewer (refactoring 軽量構成)
- **emphasis**: 振る舞い不変、既存テスト全 PASS、Step が AgentDefinition を所有する設計の明確性
- **result**: openspec-workflow/requests/active/2026-04-29-d4-d6-agent-migration/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**:
  - Config schema migration の境界条件（旧 schema 読み込み、片側欠損、新規初期化）
  - AgentSyncer の境界条件（definitionHash 一致/不一致、404 fallback、orphan rollback、idempotent）
  - AgentRegistry の集約ロジック（fromSteps, get, list, hashOf）
  - STEP_AGENT_ROLE 除去後の StepExecutor の Step.agent 直接参照

## Code Review Configuration

- **emphasis**: 振る舞い不変の検証、architecture（モジュール境界 core/agent vs adapter/anthropic）、maintainability（Step 追加コストの低減）、idempotency

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-29-d4-d6-agent-migration/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips:
  - skipped: Step 7a adr, reason: enabled-absent(adr) (refactoring type recommends `[]`; adr-create is skipped per type-config.md)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし
- Step 9.5 実行履歴:
  - Step 9.5: recommended: [security-reviewer] (mechanical regex match in spec-review-result-001/002.md; matched terms: 認証, 認可, 暗号化, 機密情報 — note: matches are within the standard category description boilerplate, not actual security findings)

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md
- **learned-patterns**: openspec-workflow/learned-patterns.md
- **depends-on (PR #26 merged D1-D9)**: openspec-workflow/requests/merged/2026-04-29-step-abstraction-refactor/

## Fixup Review Scope

- **review-scope**:
  - src/cli/init.ts
  - openspec/changes/2026-04-29-d4-d6-agent-migration/implementation-notes.md

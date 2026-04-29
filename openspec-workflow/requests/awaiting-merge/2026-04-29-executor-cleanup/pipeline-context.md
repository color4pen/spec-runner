# Pipeline Context — 2026-04-29-executor-cleanup

## Paths

- **request-md**: openspec-workflow/requests/active/2026-04-29-executor-cleanup/request.md
- **request-path**: openspec-workflow/requests/active/2026-04-29-executor-cleanup
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-29-executor-cleanup
- **main-worktree-path**: ~/Documents/GitHub/spec-runner
- **change-folder**: openspec/changes/2026-04-29-executor-cleanup/
- **slug**: 2026-04-29-executor-cleanup

## Type

- **type**: refactoring
- **branch**: refactor/2026-04-29-executor-cleanup

## Workflow Options

- enabled: [module-architect]

## Spec Review Configuration

- **agents**: architect, spec-reviewer (refactoring 軽量構成 — security-reviewer / pattern-reviewer は enabled 非含のためスキップ)
- **emphasis**:
  - 振る舞い不変の検証可能性
  - directory-form 移行の sibling 削除完結
  - @deprecated 削除の grep ベース完了判定
  - module-analysis の tasks 落とし込み
- **result**: openspec-workflow/requests/active/2026-04-29-executor-cleanup/spec-review-result-{NNN}.md

## Code Review Configuration

- **emphasis**:
  - architecture (refactoring 重み 0.25) — helper 抽出の cohesion
  - maintainability (refactoring 重み 0.15) — LOC 削減と命名
  - correctness — 振る舞い不変（既存 280 テスト PASS）

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-29-executor-cleanup/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う
- **target-modules**:
  - src/core/step/executor.ts (900 LOC)
  - src/core/agent/registry.ts
  - src/core/agent/definition.ts
  - src/core/agent/hash.ts
  - src/core/step/spec-review.ts

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- depends-on: openspec-workflow/requests/merged/2026-04-29-d4-d6-agent-migration (PR #28)
- step skips: なし（実行時に追記）
- retries: なし
- Step 9.5 実行履歴:
  - Step 9.5: no candidates detected (security-reviewer / pattern-reviewer / test-case-generator regex 0 件; module-architect は enabled に含まれるため検出対象外)

## Shared Resources

- **constraints**: openspec-workflow/constraints.md
- **review-lessons**: openspec-workflow/review-lessons.md
- **learned-patterns**: openspec-workflow/learned-patterns.md

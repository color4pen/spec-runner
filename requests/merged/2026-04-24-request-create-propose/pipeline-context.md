# Pipeline Context

## Paths

- **request-md**: requests/active/2026-04-24-request-create-propose/request.md
- **request-path**: requests/active/2026-04-24-request-create-propose
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-24-request-create-propose
- **main-worktree-path**: ~/Documents/GitHub/spec-runner
- **change-folder**: openspec/changes/2026-04-24-request-create-propose/
- **slug**: 2026-04-24-request-create-propose

## Type

- **type**: new-feature
- **branch**: feat/2026-04-24-request-create-propose

## Workflow Options

- enabled: [test-case-generator, adr]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 状態マシン整合性、API ページネーション、IDOR パターン、delta spec と既存 spec の型乖離
- **result**: requests/active/2026-04-24-request-create-propose/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: request 作成フォーム、propose セッション起動、change folder 閲覧、セッション状態管理

## Code Review Configuration

- **emphasis**: IDOR（Server Action の認可チェック）、状態マシン遵守、N+1 クエリ、外部 API + DB のロールバック

## Module Analysis Configuration

- **output**: openspec/changes/2026-04-24-request-create-propose/module-analysis.md
- **scope**: mechanical division only (testability, readability, cohesion, coupling, reusability, SRP)
- **out-of-scope**: extensibility, deployment independence, security boundary, domain boundary
- **note**: module-analysis.md は implementer の参考情報。参照は任意であり、判断は implementer が行う

## Notes

- model-context-size: 1M
- model-context-size-source: system-info
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし
- Step 9.5 実行履歴:
  - Step 9.5: recommended: [security-reviewer, module-architect]

## Shared Resources

- **constraints**: docs/constraints.md（存在する場合）
- **review-lessons**: docs/review-lessons.md（存在する場合）

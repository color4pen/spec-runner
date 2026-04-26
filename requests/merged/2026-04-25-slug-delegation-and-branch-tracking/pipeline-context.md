## Paths

- **request-md**: requests/active/2026-04-25-slug-delegation-and-branch-tracking/request.md
- **request-path**: requests/active/2026-04-25-slug-delegation-and-branch-tracking
- **change-folder**: openspec/changes/slug-delegation-and-branch-tracking/
- **slug**: slug-delegation-and-branch-tracking
- **slug-with-date**: 2026-04-25-slug-delegation-and-branch-tracking
- **change-folder-symlink**: openspec/changes/2026-04-25-slug-delegation-and-branch-tracking/
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-25-slug-delegation-and-branch-tracking
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: new-feature
- **branch**: feat/2026-04-25-slug-delegation-and-branch-tracking

## Workflow Options

- enabled: [test-case-generator, adr]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: Custom Tool 設計、SSE ハンドリング、DB スキーマ変更、パストラバーサル防止
- **result**: requests/active/2026-04-25-slug-delegation-and-branch-tracking/spec-review-result-001.md

## Test Case Generation

- **must-areas**: register_branch Custom Tool ハンドリング、SSE requires_action イベント処理、branch_name DB 永続化、差分 URL 生成、change folder ビューア

## Code Review Configuration

- **emphasis**: IDOR 防止、Custom Tool input_schema バリデーション、SSE イベントハンドリングの堅牢性、encodeURIComponent の正しい使用

## Notes

- model-context-size: 1M
- model-context-size-source: request-meta
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: 5b x2 (build type error, test shape mismatch)
- Step 9.5: recommended: [security-reviewer]

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md

## Paths

- **request-md**: requests/active/2026-04-25-bootstrap-detection-on-register/request.md
- **request-path**: requests/active/2026-04-25-bootstrap-detection-on-register
- **change-folder**: openspec/changes/2026-04-25-bootstrap-detection-on-register/
- **slug**: 2026-04-25-bootstrap-detection-on-register
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-2026-04-25-bootstrap-detection-on-register
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: spec-change
- **branch**: change/2026-04-25-bootstrap-detection-on-register

## Workflow Options

- enabled: [test-case-generator, adr]

## Spec Review Configuration

- **agents**: architect, spec-reviewer
- **emphasis**: 既存 spec との整合性（後方互換性）、影響範囲の網羅性、GitHub API エラーハンドリング
- **result**: requests/active/2026-04-25-bootstrap-detection-on-register/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: bootstrap_status 判定ロジック（ready/uninitialized 分岐）、GitHub API エラーハンドリング、並列 API 呼び出し

## Code Review Configuration

- **emphasis**: GitHub API 統合、エラーハンドリング（安全側倒し）、既存コードへの影響範囲

## Notes

- model-context-size: 1M
- model-context-size-source: runtime-detection (claude-opus-4-6[1m])
- cleanup-stale-knowledge: N/A — this spec-change modifies behavior (bootstrap_status detection), not technology replacement. No old/new technology pair exists.
- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 3 pattern-reviewer, reason: enabled-absent(pattern-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし
- Step 9.5: recommended: [security-reviewer]
- Step 9.5: follow-up completed: accepted=[security-reviewer], skipped=[], result-files=[requests/awaiting-merge/2026-04-25-bootstrap-detection-on-register/followup-review-security-reviewer-20260425T221424.md]

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md

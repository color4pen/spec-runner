## Paths

- **request-md**: openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/request.md
- **request-path**: openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight
- **change-folder**: openspec/changes/fix-local-runtime-and-finish-preflight/
- **slug**: fix-local-runtime-and-finish-preflight
- **worktree-path**: ~/Documents/GitHub/spec-runner-wt-fix-local-runtime-and-finish-preflight
- **main-worktree-path**: ~/Documents/GitHub/spec-runner

## Type

- **type**: spec-change
- **branch**: fix/fix-local-runtime-and-finish-preflight

## Workflow Options

- enabled: [test-case-generator, adr, pattern-reviewer]

<<<<<<< Updated upstream:openspec-workflow/requests/merged/fix-local-runtime-and-finish-preflight/pipeline-context.md
## Notes

- Step 9.5: recommended: [security-reviewer, module-architect]
=======
## Spec Review Configuration

- **agents**: architect, spec-reviewer, pattern-reviewer
- **emphasis**: 既存 spec との整合性（setsBranch 追加が step-execution-architecture と矛盾しないか）、MERGED bypass の影響範囲
- **result**: openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/spec-review-result-001.md

## Test Case Generation

- **must-areas**: executor completionVerdict fallback, executor setsBranch flag, review-verdict parser tolerance, preflight MERGED bypass

## Code Review Configuration

- **emphasis**: step 名ハードコード排除（TC-003）、local runtime path と managed runtime path の分離、parser regex の正確性

## Notes

- step skips:
  - skipped: Step 2.5 module-architect, reason: enabled-absent(module-architect)
  - skipped: Step 3 security-reviewer, reason: enabled-absent(security-reviewer)
  - skipped: Step 6 security-reviewer, reason: enabled-absent(security-reviewer)
- retries: なし

## Shared Resources

- **constraints**: openspec-workflow/constraints.md（存在する場合）
- **review-lessons**: openspec-workflow/review-lessons.md（存在する場合）
>>>>>>> Stashed changes:openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/pipeline-context.md

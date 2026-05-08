# Implementation Notes: Fix base branch hardcode

## result: completed

## tasks_completed: 13/13

## Summary

All 13 tasks completed. `baseBranch` is now sourced from `ParsedRequest.baseBranch` (parsed from `- **base-branch**: <value>` in the Meta section) and propagated throughout the pipeline. All hardcoded `"main"` / `"origin/main"` base branch references in the implementation have been replaced with dynamic values.

## Files Modified

| File | Operation | Description |
|------|-----------|-------------|
| `src/parser/request-md.ts` | Modified | Added `baseBranch: string` to `ParsedRequest` interface; added extraction logic; fail-fast on missing field |
| `src/core/command/request.ts` | Modified | Added `- **base-branch**: main` to `buildScaffoldTemplate()` output |
| `src/git/dynamic-context.ts` | Modified | Renamed `_branch` → `baseBranch`; now uses it for `git log/diff` commands |
| `src/core/command/runner.ts` | Modified | Uses `request.baseBranch` instead of `jobState.branch ?? "main"` |
| `src/core/runtime/strategy.ts` | Modified | Added `baseBranch?: string` to `WorkspaceOptions` interface |
| `src/core/command/pipeline-run.ts` | Modified | Passes `baseBranch: request.baseBranch` in `workspaceOpts` |
| `src/core/command/resume.ts` | Modified | Passes `baseBranch: request.baseBranch` in `workspaceOpts` |
| `src/core/runtime/local.ts` | Modified | Replaced all `"origin/main"` with dynamic `remoteBaseRef`; updated warning messages |
| `src/core/step/pr-create.ts` | Modified | Uses `deps.request.baseBranch` instead of `"main"` |
| `src/core/finish/orchestrator.ts` | Modified | Added `baseBranch: string` to `FinishInput`; fixed 3 hardcoded `"main"` references |
| `src/cli/finish.ts` | Modified | Parses `request.md` to extract `baseBranch`; falls back to `"main"` for slug-less paths |
| `src/core/worktree/manager.ts` | Modified | Removed `TODO(base-branch)` comment |
| `src/core/pr-create/runner.ts` | Modified | Updated Design D3 comment |
| `src/adapter/claude-code/agent-runner.ts` | Modified | Added `baseBranch: "main"` to internal request stub |
| `src/adapter/managed-agent/agent-runner.ts` | Modified | Added `baseBranch: "main"` to internal request stub |
| `tests/parser.test.ts` | Modified | Added `- **base-branch**: main` to all fixtures; added TC-BB-001/TC-BB-002 test cases |
| `tests/finish-orchestrator.test.ts` | Modified | Added `baseBranch: "main"` to all `runFinishOrchestrator` calls |
| `tests/finish-adversarial.test.ts` | Modified | Added `baseBranch: "main"` to all `runFinishOrchestrator` calls |
| `tests/unit/core/command/request.test.ts` | Modified | Added `- **base-branch**: main` to `buildValidRequestMd()` helper |
| `tests/unit/core/pr-create/body-template.test.ts` | Modified | Added `baseBranch: "main"` to `makeParsedRequest()` |
| `tests/unit/core/runtime/local.test.ts` | Modified | Added `baseBranch: "main"` to `buildRequest()` |
| `tests/unit/core/runtime/managed.test.ts` | Modified | Added `baseBranch: "main"` to `buildRequest()` |
| Various other test files | Modified | Added `baseBranch: "main"` to `ParsedRequest` fixture objects |
| `tests/unit/context/request-patterns.test.ts` | Modified | Added `- **base-branch**: main` to `buildRequestMd()` helper |
| `tests/unit/cli/resume.test.ts` | Modified | Added `baseBranch: "main"` to `parseRequestMd` mock return value |

## Blocked Tasks

None.

## Test Results

- `bun run typecheck`: exit 0 (clean)
- `bun test`: 1122 pass, 74 fail
  - All 74 failures are pre-existing issues unrelated to this change:
    - `vi.resetModules is not a function` (Bun vitest compatibility issue in ~10 test files)
    - `vi.mocked is not a function` (same root cause)
    - Module isolation failures in full test run (pass when run in isolation)
    - `TC-BS-*`, `TC-WTM-*`, `TC-CR-*` etc. all pass when run individually

## Verification

- AC1: `ParsedRequest.baseBranch: string` present in `src/parser/request-md.ts`
- AC2: TC-BB-001 (missing base-branch → REQUEST_MD_INVALID) passes
- AC3: Template includes `- **base-branch**: main`; scaffold validation test passes
- AC4: `grep -rn '"main"' src/...` shows only intentional fallback defaults and comments
- AC5: `FinishInput.baseBranch: string` present in `src/core/finish/orchestrator.ts`
- AC6: `grep -r "TODO(base-branch)" src/` returns empty
- AC7: typecheck exit 0; 74 pre-existing failures unchanged

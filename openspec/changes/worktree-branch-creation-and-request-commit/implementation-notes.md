## result

completed

## tasks_completed

9/9 groups (all tasks)

## Files Modified

### src/core/worktree/manager.ts
- Modified: Added `branchName?: string` to `WorktreeManager.create()` interface and implementation. When provided, uses `git worktree add -b <branchName> <path> <ref>`; otherwise retains `--detach`.

### src/core/runtime/strategy.ts
- Modified: Added `branchName?: string` and `requestType?: string` to `WorkspaceOptions`; added `branch?: string` to `WorkspaceContext`.

### src/core/runtime/local.ts
- Modified: Run path computes `branchName` from `getBranchPrefix(requestType) + slug + "-" + jobId.slice(0,8)`, passes it to `manager.create()`, commits request.md, and records `branch` in jobState via `updateJobState`. Returns `branch` in `WorkspaceContext`.

### src/core/runtime/managed.ts
- Modified: Added `SpawnFn` injection for testability. When `branchName` is provided: `git checkout -b <branchName>`, push, copy+add+commit request.md, push again, record in state. No-op resume path unchanged.

### src/core/command/runner.ts
- Modified: After `setupWorkspace()`, reflects `workspace.branch` to in-memory `jobState.branch` when not already set.

### src/core/command/pipeline-run.ts
- Modified: `prepare()` computes `branchName` and passes it via `WorkspaceOptions`.

### src/prompts/propose-system.ts
- Modified: Removed all `register_branch` references. Added "CLI が既にブランチを作成済み" note. Removed branch creation instructions.

### src/core/step/propose.ts
- Modified: `buildMessage()` uses `state.branch` when set; falls back to computed name for backward compat.

### src/adapter/claude-code/agent-runner.ts
- Modified: Removed "If the branch does not exist yet, create it" and all `register_branch` instructions from `buildAdditionalInstructions()`.

### src/adapter/managed-agent/agent-runner.ts
- Modified: Removed `registerBranchTool` injection from `runProposeStyle()`. Uses `ctx.branch` for session creation. Removed `agentBranch` from return value.

### src/adapter/managed-agent/sse-stream.ts
- Modified: Removed `onBranchRegistered`, `onSlugRegistered` from `SseStreamDeps`. Removed `register_branch` dispatch block.

### src/adapter/managed-agent/session-client.ts
- Modified: Removed `onBranchRegistered`, `onSlugRegistered` from `streamEvents` opts.

### src/core/port/session-client.ts
- Modified: Removed `onBranchRegistered`, `onSlugRegistered` from `streamEvents` opts interface.

### src/adapter/managed-agent/tools/register-branch.ts
- Deleted

### tests/register-branch-schema.test.ts
- Deleted

### tests/custom-tools.test.ts
- Deleted

### tests/core/worktree/manager.test.ts
- Modified: Added TC-WTM-009 verifying `-b` flag when branchName provided, and `--detach` when omitted.

### tests/unit/core/runtime/local.test.ts
- Modified: Added TC-LR-009 (branchName passed, workspace.branch set) and TC-LR-010 (git commit called on request.md).

### tests/prompts/propose-system.test.ts
- Modified: TC-011 now verifies `register_branch` is NOT in the prompt.

### tests/unit/adapter/managed-agent/agent-runner.test.ts
- Modified: TC-016 through TC-021 updated for register_branch removal and pre-set branch behavior.

### tests/core/step/step-interface.test.ts
- Modified: TC-011/TC-012 updated for removed tool.

### tests/pipeline.test.ts
- Modified: Removed `onBranchRegistered` from mock; TC-035 through TC-042 pre-set `jobState.branch`.

### tests/pipeline-integration.test.ts
- Modified: Removed `onBranchRegistered` call from streamEvents mock.

### openspec/changes/worktree-branch-creation-and-request-commit/tasks.md
- Modified: All tasks marked [x].

## Blocked Tasks

None.

## Notes

- All 117 test files, 1080 tests pass (`bun run test`).
- `bun run typecheck` clean.
- The `setsBranch: true` flag on `ProposeStep` is retained for backward compatibility (tests that don't pre-set `jobState.branch` still work via executor fallback).

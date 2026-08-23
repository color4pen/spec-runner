# Cross-Boundary Invariants Review — push-capability-preflight

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Date**: 2026-08-23

## Scope and evidence

- Ran `git diff main...HEAD --stat`: 38 files, 6,584 insertions, 20 deletions.
- Read `design.md`, `tasks.md`, the reviewer definition, and the current implementations around the Layer 1 repair loop and both Layer 2 publish paths.
- Re-read all three prior-round finding sites. The typed `matchedPaths` error transport is fixed. The other two fixes remain defective for the reasons below.
- Ran `bun test tests/unit/step/unpushable-path-contract.test.ts src/core/step/__tests__/commit-scoped-paths.test.ts`: 36 passed, 0 failed. The green tests call the new seams with assumptions that differ from their unchanged consumers, so they do not exercise either failing sequence below.

## Finding 1 — HIGH / FIXABLE

**Title**: The per-contract filter assumes zero-based attempts, but the unchanged adapter invokes `buildPrompt` with one-based attempts

**File**: `src/core/step/step-context-builder.ts` (line 149)

**Rationale**:

The previous global `maxAttempts = 1` regression was changed to filter `unpushable-path` from later prompts. The fix is insufficient because it assumes the first repair call has `attempt === 0`. The unchanged Claude Code adapter's established invariant is one-based: its loop starts with `for (let attempt = 1; ...)` and passes that value directly to `buildPrompt` (`src/adapter/claude-code/agent-runner.ts:1455-1466`). The new predicate is `attempt > 0`, so it removes `unpushable-path` on the very first repair turn.

Concrete execution:

1. An Actions implementer leaves `.github/workflows/ci.yml` in the actual publishable diff.
2. `validateStepOutputs` returns an `unpushable-path` follow-up violation.
3. The adapter enters its first repair iteration with `attempt = 1`.
4. `step-context-builder.ts` filters out the violation because `attempt > 0`.
5. The adapter still sends the generic prompt returned for an empty violation list, but the prompt neither names the workflow path nor asks the agent to remove it. It repeats this on attempt 2.
6. The executor's final output gate finds the unchanged violation and escalates. The required single informed self-repair opportunity never occurs.

The tests stay green because they invoke `buildPrompt(..., 0)` directly for the supposed first attempt; no test runs the real adapter loop with this policy.

**Fix**: Align the filter with the adapter's one-based contract (include `unpushable-path` when `attempt === 1`, filter it only when `attempt > 1`) and add an integration-level policy/adapter test that observes the actual prompts sent across both repair iterations.

## Finding 2 — HIGH / FIXABLE

**Title**: `commitScopedPaths` checks only the new round artifacts even though `git push` publishes all existing unpushed commits

**File**: `src/core/step/commit-push.ts` (line 1010)

**Rationale**:

Operator adjudication F2 explicitly required `commitScopedPaths` to run the same `collectPublishablePaths -> matchUnpushablePaths` check as `commitAndPush`. The current fix instead matches only `stagePaths`, claiming those paths are equivalent to the publishable set. That contradicts the unchanged behavior of `pushOnly`, which runs `git push -u origin <branch>` and therefore publishes every commit missing from the remote, not merely the pathspec of the commit just created.

Concrete execution:

1. The local branch contains an earlier unpushed commit that touches `.github/workflows/ci.yml` (for example, a process interruption occurs after a local commit but before its push, or the branch is resumed with such a commit).
2. A parallel review round produces only `specrunner/changes/.../cross-boundary-invariants-result-NNN.md`; this is the sole entry in `stagePaths`.
3. `commitScopedPaths` matches only that markdown path, finds no protected path, stages and commits it.
4. `pushOnly` pushes the entire branch, including the earlier workflow-changing commit.
5. GitHub rejects the push instead of the Layer 2 backstop stopping before stage/commit/push. The path-specific typed escalation is replaced by generic `ROUND_COMMIT_PUSH_FAILED` handling.

The new tests only cover workflow paths directly present in `stagePaths`, so they do not test the publish-range invariant. This is also why the operator-requested `collectPublishablePaths` call is absent from this path.

**Fix**: Before staging, adapt `infra.spawnFn` and call `collectPublishablePaths`, then match the complete returned set. Add a test where `stagePaths` contains only a safe round artifact while `rev-list`/`diff-tree` reports an unpushed workflow-changing commit; assert that add, commit, and push are never invoked.

## Resolved prior finding

`UnpushablePathBlockedError` now carries `matchedPaths` as a typed property, and executor routing reads it directly. The previous error-message regex coupling and comma-splitting issue are resolved and are not re-reported.

## Verified invariants

- `tasks-complete` retains the scalar maximum of two repair turns when no `unpushable-path` violation is involved.
- `commitAndPush` uses the complete worktree-plus-unpushed-commit publishable set before staging.
- Empty/undefined capability patterns avoid the new inspection commands.
- Managed runtime explicitly skips the local-only output contract.
- The Layer 2 typed error reaches `makeUnpushablePathHalt` without parsing display text.
- Capability detection remains per-run and does not retain the token.

## Evidence summary

- **Checked**: 16 cross-boundary invariants
- **Skipped**: 0
- **Unverified**: 0

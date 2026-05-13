# Spec Review: cli-git-commit-push

- **reviewer**: spec-review (manual)
- **date**: 2026-05-13
- **verdict**: needs-fix

## Summary

The delta specs cleanly define the local runtime changes: commitAndPush in StepExecutor, requiresCommit guard migration, prompt cleanup, and git-push-instruction.ts deletion. The sequencing concern about `state.branch` availability for the propose step is not an issue — `setupWorkspace()` creates the branch and sets `state.branch` before the pipeline starts.

However, the spec set has one high-severity gap: it removes shared git instruction sources (system prompts + `buildGitPushInstruction()`) that both runtimes depend on, but only specifies the local runtime replacement (commitAndPush). The managed runtime replacement is covered in tasks (T-08) but not formalized in any delta spec.

## Findings

### F-01 [HIGH]: Missing delta spec for managed runtime git instruction injection

**What**: After T-06 deletes `git-push-instruction.ts` and removes `buildGitPushInstruction()` from all step `buildMessage()` methods, and T-07 cleans git instructions from 8 system prompts, managed runtime agents lose ALL git commit/push instructions from two sources:

1. `step.buildMessage()` — currently embeds `buildGitPushInstruction(branch)` in 7 files (implementer, spec-fixer, code-fixer, build-fixer, code-review, spec-review-system, test-case-gen-system)
2. `step.agent.system` — currently contains "commit + push" instructions in 8 system prompt files

Verified in codebase: `ManagedAgentRunner` at `src/adapter/managed-agent/agent-runner.ts` line 307 calls `step.buildMessage(state, stepCtx)` directly. It has NO `buildAdditionalInstructions()` or equivalent mechanism to inject runtime-specific instructions.

**Impact**: Without git push instructions, managed runtime agents won't commit/push. The `ManagedAgentRunner.requiresCommit` guard (pre/post SHA comparison, lines 327-411) would then trigger `NO_COMMIT_DETECTED` for every writing step. This violates the acceptance criterion "managed runtime の動作に影響がない" and the request requirement "managed runtime は従来通り agent が commit + push する."

**Fix**: Add a delta spec (either a new `managed-agent-runtime` capability or an addition to `agent-runner-port`) with a requirement like:

> `ManagedAgentRunner` SHALL inject git commit/push instructions via an `additionalInstructions` mechanism appended to the user message. These instructions SHALL replace the ones previously embedded by `buildGitPushInstruction()` in step `buildMessage()` and by system prompts. The injected instructions SHALL include: (a) the target branch name, (b) the commit + push command sequence, (c) the instruction to not end the session until push completes.

And a corresponding scenario:

> **WHEN** `ManagedAgentRunner` constructs the initial message for a writing step (implementer, spec-fixer, code-fixer, build-fixer)
> **THEN** the message contains git commit/push instructions
> **AND** these instructions reference the expected branch name

### F-02 [MEDIUM]: Baseline scenario "StepExecutor verifyBranch/verifyPath" implicitly removed

**What**: The baseline `agent-runner-port` spec has a scenario:

> #### Scenario: StepExecutor が verifyBranch / verifyPath helper を保持しない
> - WHEN `src/core/step/executor.ts` を grep する
> - THEN `verifyBranch` / `verifyPath` / `getFileContent` の helper 呼び出しは 0 マッチである

The delta spec's MODIFIED requirement for "AgentRunner adapter は branch / path verification を内部で行う" replaces the requirement text but doesn't explicitly address this scenario. The new design adds `commitAndPush` with git subprocess calls (`gitExec`) to StepExecutor, which semantically differs from verification (it's doing the work, not checking the agent's work) but would still fail the old grep test for git-related helpers in executor.ts.

**Fix**: Add a note or updated scenario in the delta that clarifies `commitAndPush` is a commit lifecycle operation (not a verification helper), and that `verifyBranch`/`verifyPath` grep-zero guarantee is narrowed to those specific helper names, not to all git operations in the executor.

### F-03 [LOW]: Request text understates buildGitPushInstruction import count

**What**: The request's 補足 section says "buildGitPushInstruction() が 4 ステップの buildMessage から呼ばれている二重経路がある" but there are actually 7 source files importing it: 5 step files (implementer, spec-fixer, code-fixer, build-fixer, code-review) + 2 prompt files (spec-review-system, test-case-gen-system). The tasks (T-06) correctly list all 7 files.

**Impact**: None — the tasks are accurate. The request text is imprecise but non-binding.

### F-04 [LOW]: Design D7 approach could be more specific

**What**: Design D7 says `gitExec` moves to `src/util/git-exec.ts` or stays in adapter and is injected via PipelineDeps. Tasks (T-01) chose the `src/util/` approach, which is fine. But the delta spec for step-execution-architecture says `StepExecutor SHALL accept an optional SpawnFn via constructor injection` — this injects the spawn function, not gitExec itself. The design says one thing (inject gitExec), the spec says another (inject SpawnFn).

**Impact**: Low — SpawnFn injection is strictly more flexible. The implementer can construct gitExec calls using the injected SpawnFn. But the design and spec should be consistent about what's injected.

## Positive Observations

1. **Branch sequencing is sound**: `setupWorkspace()` creates the branch (via `git worktree add -b`) and persists `state.branch` before the pipeline starts (confirmed at `src/core/runtime/local.ts:238-239` and `src/core/command/runner.ts:109`). `commitAndPush` can safely use `state.branch`.

2. **Diff detection approach is correct**: `git add -A && git diff --cached --quiet` is simpler and more reliable than pre/post SHA comparison. Exit code semantics (0 = no changes, 1 = changes exist) are correctly documented.

3. **Separation of concerns is clean**: The design correctly places commitAndPush in the executor (not the adapter), keeping the adapter's `run()` as a pure data-returning operation.

4. **Baseline compatibility**: The delta specs correctly identify which baseline requirements to MODIFY and preserve the ManagedAgentRunner's existing behavior specification.

5. **Security**: git commands use `child_process.spawn` with argument arrays (via `gitExec`/`SpawnFn`), preventing shell injection through slug or branch names.

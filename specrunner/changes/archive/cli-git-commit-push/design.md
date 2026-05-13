# Design: cli-git-commit-push

## Context

Each step's agent currently executes `git add && git commit && git push` via Bash tool calls. Token analysis shows 71% (1628/2308) of all Bash invocations are git commands, and they occur at peak context window (after the agent has accumulated all its working state). The propose step alone consumes 6 API calls x 60K tokens on git operations.

Because each job runs in a dedicated worktree, files written by the agent during `query()` are exactly the files that should be committed. The CLI (StepExecutor) can mechanically perform `git add -A && git commit && git push` after the agent returns, eliminating the need for agents to understand git at all.

This change is scoped to the **local runtime** only. The managed runtime operates in an Anthropic-hosted sandbox where the agent must handle git internally.

## Goals

- Eliminate all agent git Bash calls in local runtime, reducing token consumption by ~30% per pipeline run
- Centralize commit + push logic in StepExecutor for reliability (no prompt-following dependency)
- Maintain managed runtime behavior unchanged

## Non-Goals

- Changing the managed runtime's git workflow
- Optimizing the managed runtime's token usage
- Modifying the pipeline state machine or transition table

## Decisions

### D1: commitAndPush lives in StepExecutor, not in ClaudeCodeRunner

**Why**: The executor already owns state persistence and step lifecycle. Adding commit+push here keeps the "post-agent-run" sequence in one place: commitAndPush → finalizeStep. Putting it in the adapter would split the post-run sequence across two layers.

**Why not adapter**: The adapter's `run()` method returns `AgentRunResult` as a pure data contract. Adding side effects (git push) would break Design D1 (adapter returns data, executor acts on it). Also, `requiresCommit` is a step-level property that the executor already reads during finalization — keeping the guard co-located with the commit logic avoids leaking step semantics into the adapter.

**Placement**: Inside `runAgentStep()`, after `runner.run()` succeeds but before `finalizeStep()`. Only when `ctx.config.runtime === "local"` (or equivalent runtime check).

### D2: Diff detection via `git diff --cached --quiet` after `git add -A`

**Why**: Simpler and more reliable than the current pre/post SHA comparison. The current approach requires a pre-run snapshot and fails if the agent makes a commit even when no useful work was done. The new approach: stage everything, check if there's anything staged, commit if yes.

**Sequence**: `git add -A` → `git diff --cached --quiet` (exit code 1 = changes exist) → `git commit` → `git push`.

### D3: requiresCommit semantics change from "branch must advance" to "staged diff must exist"

**Why**: The current `requiresCommit` guard in `ClaudeCodeRunner` compares pre/post HEAD SHA. This is a proxy for "did the agent produce output." With the executor owning commit, the direct check is "did `git add -A` stage anything?" This is simpler and eliminates the pre-run snapshot.

**Impact**: `requiresCommit: true` on implementer, spec-fixer, code-fixer, build-fixer now means "error if no diff after agent run." Steps without `requiresCommit` (propose, spec-review, code-review, test-case-gen) commit if diff exists, skip silently if not.

### D4: Commit message format `${step.name}: ${slug}`

**Why**: Machine-parseable, grep-friendly, consistent. Example: `implementer: add-git-commit-to-executor`.

### D5: Push retry with 1 retry, 5s wait

**Why**: Transient push failures (network, remote lock) are common enough to warrant a single retry. More retries suggest a persistent problem that should escalate.

**On failure**: Record `PUSH_FAILED` error in state, escalation path.

### D6: git-push-instruction.ts deletion and prompt cleanup

**Why**: Two injection paths exist for git instructions: (1) `buildGitPushInstruction()` in step `buildMessage()`, (2) `buildAdditionalInstructions()` in `ClaudeCodeRunner`. Both must be removed for local runtime. The `git-push-instruction.ts` module becomes dead code.

**For managed runtime**: Git instructions must remain. The managed adapter's `additionalInstructions` (in `src/adapter/managed-agent/`) already handles this independently. System prompts will be updated to say "write files to worktree then end_turn" instead of "commit + push."

### D7: Runtime-conditional execution via SpawnFn injection

**Why**: `commitAndPush` uses `gitExec` (already in `src/adapter/claude-code/git-exec.ts`). The executor needs access to git subprocess execution. Rather than importing adapter internals, we extract `gitExec`/`runSubprocess` to a shared utility or pass a git execution function to the executor.

**Approach**: `StepExecutor` accepts an optional `SpawnFn` (typed as `typeof child_process.spawn`) via constructor injection, defaulting to `node:child_process.spawn`. Move `gitExec` to `src/util/git-exec.ts` and have `commitAndPush` construct its git calls using the injected `SpawnFn`. This is strictly more flexible than injecting a pre-built `gitExec` function, as it allows tests to substitute the spawn mechanism without needing to mock a higher-level abstraction. The executor calls `commitAndPush` only when runtime is local. For managed runtime, this code path is skipped entirely.

**Note**: The delta spec for `step-execution-architecture` formalizes this as `SpawnFn` injection (not `gitExec` injection). These are consistent: `commitAndPush` builds `gitExec`-style calls internally using the injected `SpawnFn`.

## Risks / Trade-offs

- [Risk] Agent writes files that shouldn't be committed (e.g., temp files) → Mitigation: Worktree is clean at start; everything written is intentional. `.gitignore` already handles build artifacts.
- [Risk] Review steps that only read and don't write may produce empty commits → Mitigation: `git diff --cached --quiet` check skips commit when no changes. `requiresCommit` is false for review steps.
- [Risk] Managed runtime prompts must still contain git instructions → Mitigation: Clear separation — managed adapter injects git instructions via its own `additionalInstructions`. System prompts become git-neutral.

## Open Questions

None — the design is constrained by the request requirements.

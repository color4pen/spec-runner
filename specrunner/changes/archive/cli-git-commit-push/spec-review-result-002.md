# Spec Review: cli-git-commit-push (Round 2)

- **reviewer**: spec-review (manual)
- **date**: 2026-05-13
- **verdict**: approved

## Summary

Round 1 identified 4 findings (F-01 HIGH, F-02 MEDIUM, F-03/F-04 LOW). The spec-fixer addressed all of them:

- **F-01 (HIGH) — managed runtime git instruction gap**: Fixed. A new ADDED requirement in `agent-runner-port/spec.md` specifies `ManagedAgentRunner` SHALL inject git commit/push instructions via `additionalInstructions` appended to the user message. Two scenarios cover the injection content and the post-deletion invariant. Task T-08 aligns.
- **F-02 (MEDIUM) — verifyBranch/verifyPath grep-zero ambiguity**: Fixed. A "Clarification" section in `agent-runner-port/spec.md` explicitly distinguishes `commitAndPush` (commit lifecycle) from `verifyBranch`/`verifyPath` (verification helpers), preserving the grep-zero guarantee for the specific helper names only.
- **F-03 (LOW) — import count discrepancy**: Acknowledged as non-binding. Tasks T-06 correctly list all 7 files.
- **F-04 (LOW) — SpawnFn vs gitExec injection inconsistency**: Fixed. Design D7 was updated to clarify SpawnFn injection; delta spec for `step-execution-architecture` formalizes `SpawnFn` constructor injection.

## Verification: Delta Spec Coverage

### agent-runner-port/spec.md

| Area | Status | Notes |
|------|--------|-------|
| MODIFIED: branch verification split (local vs managed) | ✅ | ClaudeCodeRunner drops requiresCommit; ManagedAgentRunner retains pre/post SHA via GitHub API. 3 scenarios cover both sides + result file check |
| ADDED: ManagedAgentRunner git instruction injection | ✅ | Covers writing steps (implementer, spec-fixer, code-fixer, build-fixer). 2 scenarios. Addresses F-01 |
| Clarification: verifyBranch/verifyPath vs commitAndPush | ✅ | Addresses F-02 |

### claude-code-runtime/spec.md

| Area | Status | Notes |
|------|--------|-------|
| MODIFIED: query() step list updated (removed branch verification, removed git push from additionalInstructions) | ✅ | 3 scenarios: no git push in additionalInstructions, interface compliance, no SessionClient |
| MODIFIED: requiresCommit guard removed from ClaudeCodeRunner | ✅ | 3 scenarios: no requiresCommit reference, no SHA comparison, result-file-only post-run |
| MODIFIED: prompts/ runtime-neutral + git-push-instruction.ts deletion | ✅ | 3 grep-based scenarios for commit/push, file existence, buildGitPushInstruction |

### step-execution-architecture/spec.md

| Area | Status | Notes |
|------|--------|-------|
| ADDED: commitAndPush in StepExecutor (local runtime only) | ✅ | Full sequence spec (add → diff → commit → push → retry). 7 scenarios covering success, no-diff+requiresCommit, no-diff+skip, push retry, push fail, managed skip, message format |
| MODIFIED: lifecycle step insertion (step 5 for local runtime) | ✅ | 2 scenarios: local vs managed lifecycle event order |
| SpawnFn constructor injection | ✅ | Specified in both ADDED and MODIFIED sections |

## Verification: Request Requirements ↔ Spec Traceability

| Request Req# | Description | Spec Coverage |
|---|---|---|
| 1 | commitAndPush in StepExecutor after runner.run() | step-execution-architecture ADDED + MODIFIED |
| 2 | Commit message `${step.name}: ${slug}` | step-execution-architecture scenario "Commit message follows step-name-colon-slug format" |
| 3 | Push retry (1 retry, 5s wait, PUSH_FAILED) | step-execution-architecture scenarios "Push failure triggers single retry" + "Push failure after retry raises PUSH_FAILED" |
| 4 | requiresCommit guard migration to executor | claude-code-runtime MODIFIED "requiresCommit guard を持たない" + step-execution-architecture ADDED (no-diff scenarios) |
| 5 | System prompt git instruction removal (8 files) | claude-code-runtime MODIFIED "prompts/ は runtime-neutral" + grep scenario |
| 6 | git-push-instruction.ts deletion | claude-code-runtime scenarios "git-push-instruction.ts が存在しない" + "buildGitPushInstruction の参照が存在しない" |
| 7 | buildAdditionalInstructions git push removal | claude-code-runtime MODIFIED "additionalInstructions に git push 指示が含まれない" |
| 8 | Managed runtime prompt maintenance | agent-runner-port ADDED "ManagedAgentRunner は git commit/push 指示を additionalInstructions で注入する" |
| 9 | Grep verification | claude-code-runtime 3 grep scenarios |

## Verification: Baseline Compatibility

- **StepExecutor lifecycle (step-execution-architecture baseline)**: The MODIFIED requirement preserves the existing 10-step lifecycle and inserts commitAndPush as step 5 for local runtime only. No baseline invariants are violated.
- **StepExecutor dispatch-on-kind-only**: Not affected. commitAndPush applies to all agent steps uniformly (guarded by runtime, not step name).
- **StepExecutor no step-name literals**: Not affected. commitAndPush uses `step.name` dynamically for the commit message and `step.requiresCommit` as a boolean guard — no hardcoded step-name strings.
- **AgentRunner.run() returns AgentRunResult**: Unchanged. commitAndPush operates on the worktree filesystem, not on `AgentRunResult`.
- **ManagedAgentRunner requiresCommit guard**: Explicitly preserved in agent-runner-port delta. No change to managed adapter's SHA comparison logic.
- **verifyBranch/verifyPath grep-zero**: Explicitly clarified as still valid (commitAndPush is not a verification helper).

## Verification: Task ↔ Spec Alignment

| Task | Delta Spec Anchor | Aligned |
|---|---|---|
| T-01 (gitExec to shared util) | step-execution-architecture: SpawnFn injection | ✅ |
| T-02 (PUSH_FAILED error code) | step-execution-architecture: PUSH_FAILED scenario | ✅ |
| T-03 (commitAndPush) | step-execution-architecture: ADDED requirement | ✅ |
| T-04 (remove requiresCommit from adapter) | claude-code-runtime: MODIFIED requirement | ✅ |
| T-05 (buildAdditionalInstructions cleanup) | claude-code-runtime: additionalInstructions scenario | ✅ |
| T-06 (delete git-push-instruction.ts) | claude-code-runtime: deletion scenarios | ✅ |
| T-07 (system prompt cleanup) | claude-code-runtime: prompts/ runtime-neutral | ✅ |
| T-08 (managed runtime injection) | agent-runner-port: ADDED requirement | ✅ |
| T-09 (grep verification) | claude-code-runtime: 3 grep scenarios | ✅ |
| T-10 (tests) | Scenarios across all 3 delta specs | ✅ |

## Security Considerations

- **Shell injection**: gitExec uses `child_process.spawn` with argument arrays (not `exec` with string concatenation). Slug and branch names pass through as discrete arguments, preventing injection. The delta spec preserves this by specifying `SpawnFn` (typed as `spawn` signature), not a shell-string executor.
- **Arbitrary file staging**: `git add -A` stages all untracked files. In the worktree isolation model, this is safe — the worktree is job-exclusive and initialized clean. `.gitignore` covers build artifacts. No new attack surface.
- **Push credential exposure**: git push uses the existing credential mechanism (GitHub token in git config or credential helper). No change to credential handling.

## Remaining Notes (informational, not blocking)

1. **`requiresCommit` JSDoc in types.ts**: The current JSDoc references "SHA advanced" semantics. After this change, the semantics shift to "staged diff must exist." T-02 updates the `noCommitDetectedError` message, but the JSDoc on the field definition may also need updating during implementation. This is a documentation-level concern, not a spec gap.

2. **Propose step and commitAndPush**: ProposeStep has `requiresCommit` unset (falsy), and `setsBranch: true`. The propose agent creates the branch via `git checkout -b` in its additionalInstructions. After this change, the propose agent will still create the branch (the instruction remains), but won't commit — the executor will. This is consistent: propose writes spec files → executor stages + commits + pushes. The `setsBranch` flag sets `state.branch` after the step, which is fine since `commitAndPush` uses `state.branch` (already set by `setupWorkspace` before the pipeline starts). No issue.

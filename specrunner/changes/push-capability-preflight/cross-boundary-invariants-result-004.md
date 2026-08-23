# Cross-Boundary Invariants Review — push-capability-preflight

**Reviewer**: cross-boundary-invariants  
**Iteration**: 4  
**Date**: 2026-08-23

## Scope and evidence

- Ran `git diff main...HEAD --stat` and reviewed the 44-file change surface.
- Read the current `design.md` and `tasks.md`, then traced both Layer 2 callers into the unchanged round coordinator, synthesized-commit ledger, checkpoint publisher, and ordinary branch-wide push behavior.
- Re-read both iteration-3 finding sites. The repair-loop policy now returns `null` and all three adapters stop before sending a second turn, so that finding is resolved. `rev-list` and `diff-tree` failures now throw, so incomplete committed-history evidence is no longer accepted.
- Ran `bun test tests/unit/git/push-capability.test.ts src/core/step/__tests__/commit-scoped-paths.test.ts tests/unit/step/unpushable-path-contract.test.ts tests/unit/adapter/claude-code/agent-runner.test.ts`: 140 passed, 0 failed.

## Finding 1 — HIGH / FIXABLE

**Title**: A failed worktree enumeration is treated as proof that the worktree is safe

**File**: `src/git/push-capability.ts` (line 128)

**Rationale**:

The iteration-3 fix correctly made committed-history enumeration fail closed, but worktree enumeration still has the opposite semantics. This breaks the unchanged `commitAndPush`/`commitScopedPaths` assumption that a successful preflight result covers everything they are about to stage and publish. The comment that a missed worktree change “will be caught by the commit step” is not true: the caller performs this collection immediately before staging, and there is no second protected-path inspection after the commit.

Concrete execution:

1. An Actions run has an uncommitted `.github/workflows/ci.yml` change and no earlier unpushed commit touching that path.
2. `git status --porcelain ...` exits non-zero or its spawn rejects, so lines 128–145 discard the failure and collect no worktree paths.
3. `git rev-list` succeeds and returns either nothing or only safe commits; `collectPublishablePaths` returns a safe/empty array.
4. Layer 1 sees no violation, and Layer 2 interprets that array as a complete safe publish set.
5. The unchanged commit path stages the workflow change, commits it, and `pushOnly` pushes the branch.
6. GitHub rejects the workflow-changing push—the exact late failure this feature is intended to prevent.

The new test explicitly encodes fail-open status behavior, but only combines it with a workflow path already visible through `diff-tree`; it does not exercise the uncommitted-only case above. A status enumeration failure must be surfaced as incomplete evidence and stop Layer 2 before staging (and should cause Layer 1 to defer to that backstop), rather than being converted to a successful partial set.

## Finding 2 — HIGH / FIXABLE

**Title**: Pre-commit round backstop failures whitelist the previous HEAD as a synthesized round commit

**File**: `src/core/pipeline/parallel-review-round.ts` (line 439)

**Rationale**:

`commitScopedPaths` now introduces a new failure point before staging or commit, but the unchanged round coordinator assumes every exception from `commitRoundArtifacts` may have happened after a commit. It therefore captures the current HEAD unconditionally and passes it to `commitRound`, which appends it to `synthesizedCommits`. That ledger is an egress authorization list, not a record of arbitrary observed HEADs.

Concrete execution:

1. A custom-review round has declared artifact changes, and the branch already contains an unpushed commit touching `.github/workflows/ci.yml` (or the round worktree itself contains a protected declared output).
2. The new `commitScopedPaths` Layer 2 check detects the protected path and throws `UnpushablePathBlockedError` before `git add` or `git commit`.
3. `parallel-review-round.ts` catches it, then lines 439–443 capture the unchanged pre-round HEAD as `roundCommitOid`.
4. Lines 505–519 pass that OID to `commitRound`; the existing orchestrator appends it to the synthesized-commit ledger even though the round synthesized no commit.
5. The error is also rewritten as `ROUND_COMMIT_PUSH_FAILED` with a hint claiming “The round commit was created locally,” so the persisted state and operator guidance both assert an event that never occurred.
6. On resume, the egress checker treats that pre-existing HEAD as an authorized synthesized commit. This weakens the ledger boundary and can mask an otherwise unknown commit if the capability constraint is later removed (for example by resuming with a PAT).

Handle `UnpushablePathBlockedError` as a pre-commit guard failure in the coordinator: do not capture or append a round OID, and preserve a path-specific preflight error/hint. More generally, capture an OID on exception only when the callee can prove a commit was actually created.

## Resolved prior findings

- Persistent `unpushable-path` violations now receive one repair turn: `buildPrompt` returns `null` on attempt 2 when no eligible violations remain, and Claude, Codex, and managed adapters all break without sending a query.
- `rev-list` and per-OID `diff-tree` failures now throw instead of returning partial committed-history evidence.
- `commitScopedPaths` inspects the complete returned publish range, including previous unpushed commits.
- `UnpushablePathBlockedError.matchedPaths` remains typed end-to-end; display text is not parsed as an internal protocol.

## Verified invariants

- `tasks-complete` retains two repair opportunities when mixed with `unpushable-path`.
- Empty/undefined capability patterns avoid the new enumeration commands.
- Sequential Layer 2 errors reach the path-specific awaiting-resume halt without staging, commit, or push.
- Managed output validation explicitly skips the local-only contract.
- Capability detection remains per-run and does not retain the token.

## Evidence summary

- **Checked**: 20 cross-boundary invariants
- **Skipped**: 0
- **Unverified**: 0

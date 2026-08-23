# Cross-Boundary Invariants Review — push-capability-preflight

**Reviewer**: cross-boundary-invariants  
**Iteration**: 5  
**Date**: 2026-08-23

## Scope and evidence

- Ran `git diff main...HEAD --stat` and reviewed the 46-file change surface.
- Read the current `design.md`, `tasks.md`, and reviewer definition, then traced Layer 1 and both Layer 2 publish paths into the unchanged adapter repair loops, round coordinator, synthesized-commit ledger, pipeline escalation transition, and checkpoint publisher.
- Re-read both iteration-4 finding sites. `collectPublishablePaths` now throws on status, rev-list, and diff-tree failures, so incomplete enumeration is no longer accepted as safety evidence. The round coordinator now compares HEAD before and after `commitRoundArtifacts`, which fixes the ordinary pre-commit rejection case when both observations succeed.
- Ran `bun test tests/unit/git/push-capability.test.ts src/core/step/__tests__/commit-scoped-paths.test.ts src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts tests/unit/step/unpushable-path-contract.test.ts`: 88 passed, 0 failed.

## Finding 1 — HIGH / FIXABLE

**Title**: An unavailable pre-commit HEAD is still interpreted as proof that a round commit was created

**File**: `src/core/pipeline/parallel-review-round.ts` (line 455)

**Rationale**:

The iteration-4 repair compares the two HEAD observations, but the comparison treats `null` as an ordinary prior value. That is incompatible with the unchanged `captureHeadSha` contract, where `null` means HEAD could not be derived. Consequently, failure of the first observation recreates the same synthesized-commit ledger corruption that the repair was intended to close.

Concrete execution:

1. A custom-review round has declared artifact changes and the branch's current HEAD is an existing, unpushed commit not produced by this round.
2. The first `captureHeadSha(cwd)` call transiently fails and returns `null`, as permitted by the port contract.
3. `commitRoundArtifacts` reaches the new Layer 2 backstop and throws before staging or committing because the publish range includes `.github/workflows/ci.yml`; HEAD therefore does not change.
4. The second `captureHeadSha(cwd)` succeeds and returns the same pre-existing HEAD OID.
5. Line 455 evaluates `headAfterCommit !== null && headAfterCommit !== headBeforeCommit` as true because the prior observation is `null`, and records the pre-existing OID as `roundCommitOid`; `didCommit` makes the same incorrect inference.
6. `commitRound` appends that OID to `synthesizedCommits`, authorizing a commit the coordinator did not synthesize. If the job is later resumed with a PAT (removing the path constraint), the unchanged egress checker can accept that formerly unknown commit because the corrupted ledger now whitelists it.

The current regression test fixes both observations to the same non-null OID, so it does not cover the port's unavailable result. A commit may be inferred only when **both** observations are non-null and different. If the pre-observation is unavailable, the coordinator cannot distinguish a new commit from an existing HEAD and must not append an authorization entry; it should escalate with an evidence-unavailable reason (or use a commit API that returns the created OID directly).

## Resolved prior findings

- Worktree, unpushed-range, and per-commit enumeration failures now fail closed.
- A normal pre-commit backstop rejection with two successful, equal HEAD observations no longer records the previous HEAD.
- Persistent `unpushable-path` violations receive exactly one repair turn while `tasks-complete` retains two.
- `commitScopedPaths` inspects the complete publish range, and `UnpushablePathBlockedError.matchedPaths` remains typed end-to-end.

## Verified invariants

- Empty or undefined capability patterns do not invoke the new enumeration commands.
- Sequential Layer 2 rejection reaches an awaiting-resume halt without staging, commit, or push.
- Round Layer 2 rejection reaches pipeline escalation and preserves protected-path/environment text in the nested error message.
- Managed output validation skips the local-only contract before its branch-dependent checks.
- Capability detection is resolved once per run and does not retain the token.

## Evidence summary

- **Checked**: 21 cross-boundary invariants
- **Skipped**: 0
- **Unverified**: 0

# Cross-Boundary Invariants Review — push-capability-preflight

**Reviewer**: cross-boundary-invariants  
**Iteration**: 3  
**Date**: 2026-08-23

## Scope and evidence

- Ran `git diff main...HEAD --stat`: 39 files, 6,777 insertions, 20 deletions.
- Read the reviewer definition, `design.md`, `tasks.md`, the current Layer 1 policy, all three unchanged adapter repair loops, the publishable-path collector, and both Layer 2 callers.
- Re-read the two iteration-2 finding sites. `commitScopedPaths` now checks the complete worktree-plus-unpushed-commit set, so that prior finding is resolved. Attempt numbering is also corrected to the adapters' one-based convention, but the surrounding adapter contract still makes the replacement fix insufficient as described below.
- Ran `bun test tests/unit/step/unpushable-path-contract.test.ts src/core/step/__tests__/commit-scoped-paths.test.ts tests/unit/git/push-capability.test.ts`: 61 passed, 0 failed. These tests invoke `buildPrompt` directly and therefore do not observe whether an adapter sends a turn after receiving the filtered prompt.

## Finding 1 — HIGH / FIXABLE

**Title**: Filtering the second prompt does not prevent the unchanged adapter from sending a second follow-up

**File**: `src/core/step/step-context-builder.ts` (line 150)

**Rationale**:

The iteration-2 attempt-numbering defect was corrected, but the fix remains insufficient because it treats `buildPrompt` as the seam that decides whether a repair turn occurs. The unchanged adapters decide that earlier: each adapter calls `detect()`, sees a non-empty follow-up violation list, and then unconditionally sends whatever string `buildPrompt` returns. `buildOutputFollowUpPrompt([])` is not empty and its own contract says callers must not invoke it for an empty list (`src/core/step/output-verify.ts`); it produces a generic “Output verification detected incomplete work” prompt.

Concrete execution:

1. An Actions implementer leaves `.github/workflows/ci.yml` in the publishable diff and has no other output violation.
2. Adapter attempt 1 detects the `unpushable-path` violation, calls `buildPrompt(..., 1)`, and sends the required path-specific repair turn.
3. The agent does not remove the path.
4. Adapter attempt 2 calls `detect()` again; the same non-empty follow-up violation survives the adapter's pre-prompt check (`src/adapter/claude-code/agent-runner.ts:1463-1466`; Codex and managed-agent have the same order).
5. `step-context-builder.ts` filters the sole violation, calls `buildOutputFollowUpPrompt([])`, and returns a generic non-empty prompt.
6. The adapter sends a second same-session follow-up turn. Only after that turn does executor validation escalate.

This violates the operator-adjudicated D6/T-08 invariant that `unpushable-path` receives exactly one follow-up. It can also spend a full agent turn and mutate the worktree after the sole authorized repair opportunity. The new tests assert only that attempt-2 text omits the path; they do not run any adapter and count sent repair turns.

**Fix**: Make the repair-loop decision contract-aware before a query is sent—for example, expose only eligible violations for each attempt or allow the policy to signal “do not send a repair turn” when filtering leaves none—while preserving attempt 2 for remaining `tasks-complete` violations. Add an adapter-level test for the actual sequence: persistent unpushable-only violation → one query; persistent mixed violation → attempt 1 contains both and attempt 2 contains only tasks-complete.

## Finding 2 — MEDIUM / FIXABLE

**Title**: Failure to enumerate unpushed commits is silently treated as a complete safe publish set

**File**: `src/git/push-capability.ts` (line 141)

**Rationale**:

`collectPublishablePaths` catches a thrown `rev-list`, ignores a non-zero `rev-list`, and likewise skips failed `diff-tree` calls without any observation. This crosses badly with the unchanged Layer 2 callers: they interpret the returned array as the complete set, then stage/commit and call the ordinary branch-wide push. `tasks.md` T-02 explicitly permits returning the portion that could be collected but requires a `rev-list` failure to be logged to avoid silent fail-open; no logging exists.

Concrete execution:

1. The branch has an earlier unpushed commit touching `.github/workflows/ci.yml`, while the current worktree contains only a safe source change.
2. `git status` succeeds and returns only the safe path, but `git rev-list HEAD --not --remotes=origin` exits non-zero (or its subprocess throws).
3. The collector silently returns the safe status path as though enumeration completed.
4. Both Layer 1 and Layer 2 find no protected match. `commitAndPush` or `commitScopedPaths` proceeds to the unchanged `pushOnly`, which pushes the entire branch.
5. GitHub rejects the hidden workflow-changing commit, and there is no diagnostic showing that preflight coverage was incomplete.

The green tests cover only a `status` failure and encode an empty fail-open result; none covers the canonically singled-out `rev-list` failure or a partial result followed by push.

**Fix**: Surface `rev-list` enumeration failure through the caller's logging/diagnostic seam as required by T-02, and add a test for non-zero and thrown `rev-list` results. Prefer also marking the collection incomplete so a Layer 2 caller cannot mistake partial evidence for an authoritative safe result; if the deliberate fail-open policy must remain, the diagnostic must at least identify that the backstop was bypassed.

## Resolved prior findings

- The one-based attempt convention is now reflected in prompt filtering; the remaining defect is the distinct adapter pre-prompt decision invariant described in Finding 1.
- `commitScopedPaths` now calls `collectPublishablePaths` before staging and its test covers a safe `stagePaths` list combined with an older unpushed workflow-changing commit.
- `UnpushablePathBlockedError.matchedPaths` remains typed end-to-end; display text is not parsed as an internal protocol.

## Verified invariants

- `tasks-complete` remains present in both nominal prompt attempts.
- `commitAndPush` and `commitScopedPaths` inspect the complete returned publishable set before staging.
- Empty/undefined capability patterns avoid the new inspection commands.
- Round artifact commits receive the capability declaration through `ParallelReviewRound` → runtime → `commitScopedPaths`.
- Managed output validation explicitly skips the local-only contract.
- Typed Layer 2 errors reach the path-specific awaiting-resume halt without message parsing.
- Capability detection remains per-run and does not retain the token.

## Evidence summary

- **Checked**: 18 cross-boundary invariants
- **Skipped**: 0
- **Unverified**: 0

# cross-boundary-invariants review — pipeline-sole-committer (iteration 3)

## Scope

Diff stat: 59 files changed (+7923 / −761).  
Focus: implicit assumptions held by **unchanged** code that new behavior breaks silently.  
Iteration 3 additionally verifies whether iteration 2 findings (F-001, F-002) were fixed,
and whether fixes introduced new cross-boundary violations.

## Iteration 2 finding status

| Iter-2 # | Severity | Was fixed? | Notes |
|----------|----------|------------|-------|
| F-001 | low | **Yes** | JSDoc guarded-mode section updated; "Fallback: if no changes detected, uses `git add -A -- .` (backward compat)" line removed; now reads "Empty enumeration skips the add entirely; if staged changes exist anyway, the commit throws fail-closed (never a whole-index commit; no `git add -A -- .`)" |
| F-002 | medium | **Yes** | `postStatus.stagedOnly` added to `getWorktreeChangedPaths`; scoped path now runs `findWriteScopeViolations(step.name, slug, postStatus.stagedOnly, filePaths)` in addition to `findScopedCommitViolations`; staged-only canonical files are now caught |

## Evidence walk

### 1. Iteration 2 fix verification — stale JSDoc (ex-F-001)

`commitAndPush` JSDoc, guarded-mode section (commit-push.ts ~353-385):
```
 * "guarded" mode …
 *   …
 *   - Empty enumeration skips the add entirely; if staged changes exist anyway,
 *     the commit throws fail-closed (never a whole-index commit; no `git add -A -- .`).
```
Stale "backward compat fallback" line is gone. ✓

### 2. Iteration 2 fix verification — staged-canon bypass (ex-F-002)

`getWorktreeChangedPaths` (commit-push.ts) now populates `stagedOnly`:
```typescript
// X≠' ', X≠'?', Y=' '  → file staged-only (new, modified, or deleted in index only)
if (part[0] !== " " && part[0] !== "?" && part[1] === " ") {
  stagedOnly.push(filePath);
}
```
`stagedOnly` is collected regardless of `worktreeOnly`.

Scoped residual check now runs two rules:
```typescript
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);
// Rule 1 – worktree-dirty paths not in declared ∪ managed
const residualViolations = findScopedCommitViolations(
  slug, postStatus.paths, filePaths, allManagedPaths
);
// Rule 2 – staged-only paths that are protected canon or judge artifacts
const stagedCanonViolations = findWriteScopeViolations(
  step.name, slug, postStatus.stagedOnly, filePaths
);
const allViolations = [...new Set([...residualViolations, ...stagedCanonViolations])];
```
Staged canonical docs (X≠' ', Y=' ') now trigger halt via `allViolations`. ✓

### 3. Staged-NEW judge-artifact restoration failure

The ex-F-002 fix correctly detects staged-NEW judge artifacts (X='A', Y=' ').
However, the restoration path that follows has a type mismatch.

`getWorktreeChangedPaths` populates `untracked` only for X='?' entries:
```typescript
if (part[0] === "?" && part[1] === "?") {
  untracked.push(filePath);
}
```
A staged-new file (X='A', Y=' ') is NOT in `untracked`.

`restoreViolatedPaths(violations, untracked)` (commit-push.ts) routes by membership in `untracked`:
```typescript
const cleanTargets   = violations.filter(p => untrackedPaths.includes(p));
const checkoutTargets = violations.filter(p => !untrackedPaths.includes(p));
```
For a staged-new file: it lands in `checkoutTargets` → `git checkout HEAD -- <new-file>`.

`git checkout HEAD -- <new-file>` exits non-zero when `<new-file>` has no entry in HEAD
(it was created by the agent and only exists in the index). The error propagates as:
```typescript
throw commitEffectFailedError(step.name, branch, "restore", "git checkout failed");
```
This is `COMMIT_AND_PUSH_FAILED`, not `WRITE_SCOPE_VIOLATION`.

**Security**: pipeline halts fail-closed. The staged content is never committed.  
**Operational impact**:
- Wrong error code surfaced to the operator — "COMMIT_AND_PUSH_FAILED" with a
  "possible index.lock conflict" hint misleads diagnostics.
- The staged-new file remains in the index. It accumulates across sequential steps
  until a mixed reset fires (which only happens when HEAD advances, i.e., the agent
  self-commits during a later round).
- Pre-existing protected canon files (spec.md, design.md, etc.) always exist in HEAD
  for active jobs, so they restore cleanly. Only adversarially-staged **new** files
  matching `isJudgeArtifact` patterns (`*-result-*.md`, `review-feedback-*.md`) trigger
  this path.

**Finding F-001 (LOW).**

### 4. Round `commitRoundArtifacts` push failure leaves OID unrecorded

`parallel-review-round.ts` step 7b:
```typescript
await deps.runtimeStrategy.commitRoundArtifacts?.(toStage, cwd, branch, ...);
roundCommitOid = deps.runtimeStrategy
    ? ((await deps.runtimeStrategy.captureHeadSha(cwd)) ?? null)
    : null;
```

`commitRoundArtifacts` delegates to `commitScopedPaths`, which:
1. `git add -A -- <stagePaths>` — stages declared paths
2. `git commit -- <stagePaths>` — commits (OID = X)
3. `runInlineEgressCheck` — verifies X
4. `pushOnly` — two push attempts, then `throw pushFailedError`

If both push attempts fail, `pushOnly` throws. `commitRoundArtifacts` propagates the throw.
Control never reaches `roundCommitOid = captureHeadSha(...)`.

Downstream:
- `roundCommitOid` remains `null` → `commitRound` skips `appendSynthesizedCommit`
- `synthesizedCommits` ledger does not contain X

On resume, a second attempt commits Y from the reset worktree. The egress check
runs `git rev-list HEAD --not --remotes=origin`. Because X was committed but never
pushed (double push failure), X is in the local publish range. X is not in the ledger
→ `egressUnknownCommitError` → EGRESS_UNKNOWN_COMMIT halt → pipeline deadlock.

Recovery requires an operator to manually inspect and push the feature branch so X
reaches origin (removing X from the "not remotes" set), then resume.

**Mitigating factors**:
- Requires two consecutive push failures on the same round commit (retried in `pushOnly`
  with a 5s sleep). Very rare in practice.
- Design D4 acknowledges egress catches harness defects and expects operator intervention
  for EGRESS_UNKNOWN_COMMIT.

**Finding F-002 (LOW).**

### 5. `synthesizedCommits` deduplication — integrity walk

`appendSynthesizedCommit(state, oid)` (operations.ts):
```typescript
if (existing.includes(oid)) return state; // deduplicated
```
`commitSuccess` appends `result.commitOid` and (if present) `result.exitCommitOid`.
`commitRound` appends `roundCommitOid` after `commitRoundArtifacts`.
`commitFinalState` verifyEgressLedger uses `state.synthesizedCommits` at call time.

No gap in the ledger chain under normal (no-throw) paths. ✓

### 6. D5 fail-closed split — tracked/untracked branch correctness

`restoreViolatedPaths`: `cleanTargets` (X='?') → `git clean -f -- <paths>`;
`checkoutTargets` (X≠'?', in HEAD) → `git checkout HEAD -- <paths>`.

Split avoids `git clean -f` on tracked files and `git checkout HEAD` on untracked files.
Both operations fail-closed via `commitEffectFailedError("restore")` on non-zero exit. ✓
(Only exception is staged-NEW: covered by F-001 above.)

### 7. Egress check — two-implementation coherence

`verifyEgressLedger` (used by `commitFinalState`, takes `PipelineSpawnFn`):
- `git rev-list HEAD --not --remotes=origin` → checks each OID in ledger Set.

`runInlineEgressCheck` (used by `commitAndPush`, `commitScopedPaths`, `propagate`,
takes `SpawnFn` from git-exec.js):
- Captures `newCommitOid = rev-parse HEAD`, builds local ledger = `synthesizedCommits ∪ newCommitOid`,
  runs same rev-list check.

Both implementations use the same rev-list predicate and ledger check logic. ✓

### 8. `propagate.ts` egress — soft vs hard failure

`propagate.ts` returns `{ ok: false, error }` on egress failure; push is skipped.
The caller (`VerificationStep.run`) treats the outcome as a warning and the job continues.

This is intentional: verification commits record external opinions, not agent work.
The design accepts a soft egress gate here. The commit itself is included in the ledger
(appended by `commitSuccess` → `exitCommitOid`), so it will not trigger false EGRESS_UNKNOWN_COMMIT
on the next push that does reach origin. ✓

## Summary of findings

| # | Severity | Area | Title |
|---|----------|------|-------|
| F-001 | low | restoreViolatedPaths | Staged-NEW judge-artifact files fail restoration with wrong error type (COMMIT_AND_PUSH_FAILED instead of WRITE_SCOPE_VIOLATION); file persists staged in index |
| F-002 | low | commitRoundArtifacts / commitScopedPaths | Push failure after round commit leaves OID unrecorded in synthesizedCommits; on resume causes EGRESS_UNKNOWN_COMMIT deadlock |

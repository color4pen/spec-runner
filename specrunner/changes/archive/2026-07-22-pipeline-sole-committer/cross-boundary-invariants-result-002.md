# cross-boundary-invariants review — pipeline-sole-committer (iteration 2)

## Scope

Diff stat: 59 files changed (+7923 / −761).  
Focus: implicit assumptions held by **unchanged** code that new behavior breaks silently.  
Iteration 2 additionally verifies whether iteration 1 findings (F-001 through F-004) were
fixed, and whether fixes introduced new cross-boundary violations.

## Iteration 1 finding status

| Iter-1 # | Severity | Was fixed? | Notes |
|----------|----------|------------|-------|
| F-001 | medium | **Yes** | scoped `postStatus.ok=false` now throws `commitEffectFailedError` (commit-push.ts:432-435) |
| F-002 | medium | **Yes** | `roundError = roundError ??` pattern preserves ROUND_HEAD_ADVANCED (parallel-review-round.ts:382, 402) |
| F-003 | low | Was a false finding | Design D7 explicitly says "scoped residual restore + halt を保持する"; the retained check is intentional |
| F-004 | low | **Yes** | changedPaths=0 branch now throws fail-closed (commit-push.ts:535-536); bare `git add -A -- .` removed entirely |

## Evidence walk

### 1. Iteration 1 fix verification — scoped fail-closed (ex-F-001)

`commitAndPush` scoped path (commit-push.ts:431-435):
```typescript
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);
if (!postStatus.ok) {
  throw commitEffectFailedError(step.name, branch, "stage", "git status failed");
}
```
`ok:false` now throws. ✓

### 2. Iteration 1 fix verification — roundError first-error-wins (ex-F-002)

parallel-review-round.ts ROUND_INSPECTION_UNAVAILABLE branch (line ~382):
```typescript
roundError = roundError ?? { code: "ROUND_INSPECTION_UNAVAILABLE", ... };
```
parallel-review-round.ts ROUND_NONDECLARED_CHANGE branch (line ~402):
```typescript
roundError = roundError ?? { code: "ROUND_NONDECLARED_CHANGE", ... };
```
Both use `??` (first error wins). ROUND_HEAD_ADVANCED set in step 5b survives subsequent
inspection. ✓

### 3. Iteration 1 fix verification — guarded empty-changedPaths (ex-F-004)

commit-push.ts:512-516: `if (changedPaths.length > 0)` guards the add entirely.  
commit-push.ts:535-537:
```typescript
if (changedPaths.length === 0) {
  throw commitEffectFailedError(step.name, branch, "commit", "staged changes present but enumeration is empty");
}
```
Bare fallback is gone; fail-closed instead. ✓

### 4. Stale JSDoc in `commitAndPush` guarded mode section

`commitAndPush` JSDoc (commit-push.ts:365-370):
```
 * "guarded" mode (broad-write steps: implementer, build-fixer, code-fixer, etc.):
 *   - Runs git status to enumerate all worktree changes after reset.
 *   - findWriteScopeViolations: halt if any protected canon path was modified.
 *   - Stages all enumerated changed paths explicitly (git add -A -- <paths>).
 *   - Fallback: if no changes detected, uses `git add -A -- .` (backward compat).  ← STALE
 *   - Commit uses the same explicit pathspec.
```

Line 369 describes `git add -A -- .` as a backward-compat fallback when changedPaths is empty.
This is false. The actual behavior (ex-F-004 fix): `git add` is **skipped** when changedPaths is
empty; if staged changes still exist with an empty enumeration, a `commitEffectFailedError` is
thrown (fail-closed). There is no `git add -A -- .` call anywhere in the function.

The stale docstring describes precisely the security hole this PR closes (bare index staging).
A future developer reading the guarded mode documentation could infer the fallback still exists
as intentional backward compat and rely on it.

**Finding F-001 (LOW).**

### 5. `worktreeOnly=true` in scoped residual check — staged canonical doc bypass

`commitAndPush` scoped path (commit-push.ts:428-431):
```typescript
// Uses worktreeOnly=true to skip pre-staged files (X≠' ', Y=' '): those were
// staged before the step ran and are not modifications made by this step.
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);
```

`getWorktreeChangedPaths(worktreeOnly=true)` skips any entry where `part[1] === " "`
(worktree column is clean, X≠' ' in index). This covers:

> *Agent stages a canonical/protected file (e.g., `git add spec.md`) during its run.
> At this point: X='M', Y=' ' (index has agent's version; worktree = staged content).
> `worktreeOnly=true` skips it. `findScopedCommitViolations` never sees it. No halt.*

**Original behavior** (main branch, commit-push.ts:424): `getWorktreeChangedPaths` was called
with no `worktreeOnly` argument (default `false`). In the inspection model, `git add -A` was
called first (staging everything), after which staged canonical files appeared as X='M', Y=' '.
With `worktreeOnly=false`, those entries WERE returned in `postStatus.paths` and
`findScopedCommitViolations` WOULD have detected them → halt.

**Invariant broken**: Design D7 states:
> "改変済み正典が worktree に残留し、後続の sequential step が汚染された正典を読む"  
> ("scoped mode の保護正典残余違反は halt する")

A staged canonical file IS tampered content in the worktree (worktree == staged == modified
content). The halt designed to catch this is bypassed for staged-only modifications.

**Blast radius**: git history integrity is maintained — pathspec commit already excludes
pre-staged files from commits (`git commit -- <stagePaths>`). The concern is pipeline correctness:
a downstream sequential step reads the tampered canonical doc from the worktree and its results
are silently accepted. The residual halt D7 retains was specifically to prevent this.

The staged canonical file can also persist across sequential steps: `git commit -- <stagePaths>`
does not touch the index entry for files outside stagePaths; unless a mixed reset fires (requires
agent self-commit), the staged canonical doc accumulates in the index across steps.

**Finding F-002 (MEDIUM).**

### 6. Egress check paths — integrity walk

- `commitAndPush` scoped/guarded: `runInlineEgressCheck` after commit, before push. ✓
- `commitFinalState`: `verifyEgressLedger` after commit, before push (best-effort catch). ✓
- `commitScopedPaths` (round): `runInlineEgressCheck` when `egress` param provided. ✓
- `propagateVerificationResult`: inline egress check after commit, before push. ✓
- `synthesizedCommits` appended in `commitSuccess` (agent commitOid + CLI exitCommitOid). ✓
- `synthesizedCommits` appended in `commitRound` (roundCommitOid after `commitRoundArtifacts`). ✓

No gap in the egress chain.

### 7. HEAD guard atomicity — residual states after reset

After HEAD guard fires and mixed reset succeeds:
- Reviewer's committed content is now unstaged in the worktree.
- `listWorktreeChanges` in step 7b finds these changes.
- `partitionRoundChanges`: content in `declared` → `toStage`; unauthorized content → `offending`.
- `roundError = roundError ??` ensures ROUND_HEAD_ADVANCED survives ROUND_NONDECLARED_CHANGE. ✓
- If `toStage` is non-empty, `commitRoundArtifacts` commits the declared content.
  This is consistent with the synthesis model: the reviewer's declared-scope output is committed
  by the pipeline (not by the reviewer). The round still halts with escalation.
- `inspectionEscalated=true` blocks `applyRoundResults`, keeping members pending for resume. ✓

No cross-boundary gap.

### 8. `pipelineManagedPaths` single-source integrity

`round-git-scope.ts:104-106`:
```typescript
export function pipelineManagedPaths(slug: string): string[] {
  return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug)];
}
```
Includes `biteEvidenceResultPath(slug)` (T-02 / D6). Used by both (a) `commitAndPush` scoped
staging union and (b) `partitionRoundChanges` offending exclusion. Single source. ✓

### 9. local.ts docstring (review-feedback-003 F-001)

`local.ts:679`:
```
- 管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）のみを明示 pathspec で add → commit → push（1 retry）。
```
Updated to reflect current managed-paths-only behavior. ✓  
(The stale "git add -A → commit → push" line from review-feedback-003 F-001 is gone.)

### 10. Bare `git add -A` absence

Static check: `git add -A` without trailing pathspec (`--`) no longer appears in `src/`.
Static test (`write-scope-invariants.test.ts`) enforces this. ✓

## Summary of findings

| # | Severity | Area | Title |
|---|----------|------|-------|
| F-001 | low | commitAndPush JSDoc | Stale "git add -A -- . backward compat" fallback claim in guarded mode docstring |
| F-002 | medium | scoped residual check | `worktreeOnly=true` silently bypasses staged canonical doc violation halt (regression vs. main) |

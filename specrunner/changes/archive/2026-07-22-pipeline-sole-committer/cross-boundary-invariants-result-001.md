# cross-boundary-invariants review — pipeline-sole-committer (iteration 1)

## Scope

Diff stat: 44 files changed (+6479 / −709).  
Focus: implicit assumptions held by **unchanged** code that new behavior breaks silently.  
Target invariants: git commit boundary guarantees, egress ledger integrity, HEAD guard atomicity,
fail-closed semantics for git operations.

## Evidence walk

### 1. Commit boundary: scoped mode

`commitAndPush` scoped path (commit-push.ts:371–439):

- Mixed reset on self-commit: ✓ (line 360–368)
- Explicit pathspec `git add -A -- <stagePaths>`: ✓ (line 387)
- Staged-change diff check before commit: ✓ (lines 415–424)
- Commit with explicit pathspec: ✓ (lines 428–433)
- Inline egress check before push: ✓ (line 436)

**Gap — residual check ok:false continues** (F-001):  
`postStatus = await getWorktreeChangedPaths(…, true)` — if `ok === false`, the `if (postStatus.ok && …)` guard short-circuits and the code falls through to the diff/commit without halting (lines 396–412). The guarded path at lines 444–447 correctly throws `commitEffectFailedError` on `ok:false`; scoped path does not. D5 requirement: "scoped 経路の `getWorktreeChangedPaths` `ok:false` 黙殺スキップを廃し、status 失敗を halt に倒す。"

**Gap — residual restore+halt retained** (F-003):  
Lines 396–411 retain the full residual-violation restore (clean -f + checkout HEAD) and `writeScopeViolationError` throw. Design D7 says this is no longer needed because (a) pathspec commit structurally excludes non-declared changes and (b) checkpoint/finalize is now managed-path-only. The retained halt causes scoped steps to fail on benign worktree residuals instead of deferring to the subsequent round's offending check as the design intends.

### 2. Commit boundary: guarded mode

`commitAndPush` guarded path (commit-push.ts:441–505):

- Status fail-closed: ✓ (lines 443–447 throw)
- Allowlist violation check: ✓ (lines 455–465)
- Explicit pathspec add when changedPaths > 0: ✓ (lines 472–477)

**Gap — bare commit fallback when changedPaths.length === 0** (F-004):  
Lines 491–494:
```typescript
const commitArgs: string[] =
  changedPaths.length > 0
    ? ["commit", "-m", commitMessage, "--", ...changedPaths]
    : ["commit", "-m", commitMessage];
```
When changedPaths is empty, the commit runs without a pathspec. A bare `git commit` would commit ALL staged index content. The docstring (line 334) describes this as a backward-compat fallback for `git add -A -- .`, but that add was removed; only the bare commit survives. Reachability: after mixed reset the index equals HEAD (no staged changes → diff returns exit 0 → early return). Without mixed reset and with an empty changedPaths, any pre-staged file still in the index would show in status (worktreeOnly=false) and appear in changedPaths. So the bare commit path is likely unreachable in practice, but it violates the "no bare commit" principle F-004 and the requirement that all staging use explicit pathspec.

### 3. commitFinalState path

`commitFinalState` (commit-push.ts:536–614):

- Per-path `git add -- <p>` loop (not bare add -A): ✓ (lines 560–565)
- Explicit pathspec commit `-- stagedPaths`: ✓ (lines 580–581)
- Egress ledger construction from synthesizedCommits + new OID: ✓ (lines 591–594)
- `verifyEgressLedger` before push: ✓ (line 594)
- Egress failure emits warning, skips push (best-effort terminal): ✓ (lines 595–601)

No gap identified in this path.

### 4. Parallel round HEAD guard

`ParallelReviewRound.run` (parallel-review-round.ts):

- `baselineCommit = captureHeadSha(cwd)` before fan-out (captured at invalidation step, no HEAD-advancing calls between capture and fan-out): ✓ (line ~134)
- HEAD comparison after fan-out at step 5b: ✓ (lines 270–304)
- Quarantine evidence on advance: ✓ (lines 275–283)
- `git reset --mixed <baselineCommit>` on advance: ✓ (lines 287–294)
- Reset failure → throw (fail-closed): ✓ (lines 289–294)
- `roundError = { code: "ROUND_HEAD_ADVANCED" }`: ✓ (lines 295–299)
- `inspectionEscalated = true`: ✓ (line 270)
- `applyRoundResults` guarded by `!inspectionEscalated`: ✓ (line 443)

**Gap — roundError overwritten when both HEAD guard and git-effects inspection fire** (F-002):  
Step 7b (lines 365–426) runs unconditionally — it is NOT guarded by `inspectionEscalated`. If HEAD guard set `roundError = ROUND_HEAD_ADVANCED` and the subsequent `listWorktreeChanges` inspection finds offending files, the offending branch (lines 393–403) overwrites `roundError` with `ROUND_NONDECLARED_CHANGE`. Symmetrically, `ROUND_INSPECTION_UNAVAILABLE` (lines 376–387) also overwrites it. In both cases, the root-cause code `ROUND_HEAD_ADVANCED` is lost. The security invariant holds (mixed reset already undid the self-commit), but the operator will see a secondary error code instead of the primary violation.

The invariant broken: "HEAD guard violation is the canonical root cause and must be preserved in state.error when it fires, regardless of subsequent inspection results."

### 5. synthesizedCommits ledger integrity

- State field defined in types.ts:504 (`synthesizedCommits?: string[]`): ✓
- `appendSynthesizedCommit` is deduplicating and pure: ✓ (schema/operations.ts:35–39)
- Sequential step OID appended in `commitSuccess` (commit-orchestrator.ts:365–372): ✓
- CLI step exit-HEAD (`exitCommitOid`) appended in `commitSuccess` (lines 371–373): ✓
- Round commit OID appended in `commitRound` (lines 585–589): ✓
- Inline egress check captures current HEAD and unions with historical ledger before checking publish range: ✓ (`runInlineEgressCheck` lines 279–283)
- `propagateVerificationResult` receives `synthesizedCommits` and verifies inline: ✓ (verification.ts:61)
- Legacy state files (synthesizedCommits absent → `?? []`) result in empty ledger; egress check at `commitFinalState` emits warning and skips push if prior unpushed commits exist. This is a tolerable best-effort degradation for in-progress migrated jobs: ✓ (accept)

No structural gap in the ledger mechanism.

### 6. egress rev-list argument safety

`runInlineEgressCheck` (commit-push.ts:271–307):  
`["rev-list", "HEAD", "--not", "--remotes=origin", headBeforeStep?]` — when headBeforeStep is provided it is appended after `--not`, which applies exclusion to both `--remotes=origin` and the SHA. Correct git semantics. ✓

`verifyEgressLedger` (exported public function, commit-push.ts:211–241):  
`["rev-list", "HEAD", "--not", "--remotes=origin"]` — no headBeforeStep. Used for terminal commits. Correct. ✓

### 7. pipelineManagedPaths / bite-evidence inclusion

`pipelineManagedPaths(slug)` (round-git-scope.ts:104–106) returns:  
`[slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath(slug)]` — includes bite-evidence-result.md as required by T-02 / D6. This single source is used by both (a) scoped staging pathspec union and (b) `partitionRoundChanges` offending exclusion. ✓

### 8. commitScopedPaths (round commit)

commit-push.ts:644–685:
- `git add -A -- <stagePaths>`: ✓ (line 656)
- Explicit pathspec commit (no pathspec on commit call itself at line 672): small note — the commit at line 672 does NOT pass `-- <stagePaths>` as a pathspec to `git commit`. Since `git add` was already limited to `stagePaths`, the index only has those paths staged, so a bare `git commit` is equivalent. The behavior is correct, though not pathspec-explicit on the commit invocation itself.

## Summary of findings

| # | Severity | Area | Title |
|---|----------|------|-------|
| F-001 | medium | scoped commit | D5 fail-closed: postStatus.ok=false continues silently |
| F-002 | medium | HEAD guard | roundError ROUND_HEAD_ADVANCED overwritten by subsequent git-effects inspection |
| F-003 | low | scoped commit | D7: scoped residual restore+halt retained despite design removal |
| F-004 | low | guarded commit | Bare `git commit` without pathspec survives in changedPaths=0 fallback |

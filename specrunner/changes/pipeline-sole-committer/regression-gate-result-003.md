# Regression Gate Result — Iteration 003

## Evidence Summary

Checked: 16 / Skipped: 0 / Unverified: 0

14 findings confirmed fixed. 2 findings NOT fixed (reported below).

---

## Finding-by-Finding Verification

### [HIGH] F-001: synthesizedCommits 台帳 wiring (appendSynthesizedCommit)

**Status: FIXED**

`commit-orchestrator.ts` imports `appendSynthesizedCommit` from `state/schema.js` (line 29).
`commitSuccess` calls it at line 366 for `result.commitOid` and at line 372 for `result.exitCommitOid`.
`commitRound` appends `roundCommitOid` at line 589. All three OID sources are wired.

---

### [HIGH] F-002: commitFinalState push 前 egress 検証なし

**Status: FIXED**

`commit-push.ts:commitFinalState` (lines 663–674): after committing the managed-paths snapshot,
`rev-parse HEAD` retrieves the new OID, builds `ledger = synthesizedCommits ∪ newOid`,
and calls `verifyEgressLedger({ cwd, ledger, spawnFn })`. Egress failure skips push and emits
a warning (best-effort terminal path). Push only occurs after the check passes.

---

### [MEDIUM] F-003: HEAD guard git reset --mixed 失敗が無視される

**Status: FIXED**

`parallel-review-round.ts` lines 287–294:
```typescript
const resetResult = await gitExecResult(guardSpawnFn, cwd, ["reset", "--mixed", baselineCommit]);
if (!resetResult.ok || resetResult.exitCode !== 0) {
  throw new SpecRunnerError(ERROR_CODES.COMMIT_AND_PUSH_FAILED, ...);
}
```
Reset failure now throws fail-closed, preventing any subsequent push of the reviewer commit.

---

### [LOW] F-004 / F-008: guarded mode 空変更フォールバック `["add", "-A", "--", "."]`

**Status: FIXED**

`commit-push.ts` lines 530–538: when `changedPaths.length === 0`, the `git add` call is skipped
entirely. Lines 557–559 add a fail-closed guard: if `changedPaths` is empty but staged changes
exist, `commitEffectFailedError("staged changes present but enumeration is empty")` is thrown.
The `["add", "-A", "--", "."]` fallback path is deleted. Confirmed by code inspection.

---

### [LOW] F-005: T-10 完了マーカー/tasks.md vs 実装不一致

**Status: FIXED**

`tasks.md` line 134 now reads:
"scoped residual halt（TC-008/009）は D7 のとおり**保持される契約**であり期待を変更しない
（halt の存在理由は commit 層の leak ではなく「改変された正典を読んだ step の結果を採用しない」こと）。"

`design.md` D7 (lines 198–207) also explicitly states the halt is retained, with rationale.
Marker, design, and implementation are aligned.

---

### [MEDIUM] F-006: CLI step exit-HEAD が synthesizedCommits に未記録

**Status: FIXED**

`executor.ts` lines 580–586 capture `exitHeadSha` after `step.run()` and compute
`exitCommitOid = exitHeadSha` when exit-HEAD ≠ entry-HEAD. Line 614 returns it as
`exitCommitOid` in the result. `commit-orchestrator.ts` lines 370–373 append
`result.exitCommitOid` to the ledger via `appendSynthesizedCommit`.

---

### [MEDIUM] F-007: propagateVerificationResult push が egress backstop を経由しない

**Status: FIXED**

`propagate.ts` lines 76–92: inline D4 egress backstop implemented after commit.
Builds `ledger = synthesizedCommits ∪ newOid`, runs `git rev-list HEAD --not --remotes=origin`,
and returns `{ ok: false, error }` for any unknown OID. Push is gated by this check.

---

### [LOW] F-009: commitFinalState docstring が旧挙動（git add -A）を記述したまま

**Status: FIXED**

`local.ts` line 679 now reads:
"- 管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）のみを明示 pathspec で add → commit → push（1 retry）。"

Old `- git add -A → commit → push origin <branch> (1 retry).` is replaced.

---

### [MEDIUM] F-010: D5 fail-closed — scoped postStatus.ok=false 黙殺

**Status: FIXED**

`commit-push.ts` lines 451–454:
```typescript
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);
if (!postStatus.ok) {
  throw commitEffectFailedError(step.name, branch, "stage", "git status failed");
}
```
`ok:false` now throws fail-closed. Prior `if (postStatus.ok && postStatus.paths.length > 0)`
short-circuit (silent skip on failure) is gone.

---

### [MEDIUM] F-011: roundError ROUND_HEAD_ADVANCED 上書き

**Status: FIXED**

`parallel-review-round.ts` line 382 (`ROUND_INSPECTION_UNAVAILABLE`) and line 403
(`ROUND_NONDECLARED_CHANGE`) both use `roundError = roundError ?? { ... }` (first-wins).
`ROUND_HEAD_ADVANCED` set in step 5b survives subsequent inspection branches.

---

### [LOW] F-012: D7 scoped residual restore+halt — 設計と実装の乖離

**Status: FIXED (design aligned)**

`design.md` D7 (lines 198–207) now explicitly states "scoped residual restore + halt は D7 のとおり保持される契約" with rationale (改変済み正典を読んだ step の結果を採用しない。restore を外すと sequential step が汚染正典を読む).
`commit-push.ts` implementation retains the halt. Design, tasks.md, and code are consistent.

---

### [LOW] F-013: 裸 git commit (pathspec なし) が guarded changedPaths=0 経路に残存

**Status: FIXED**

`commit-push.ts` lines 557–560:
```typescript
if (changedPaths.length === 0) {
  throw commitEffectFailedError(step.name, branch, "commit", "staged changes present but enumeration is empty");
}
const commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage, "--", ...changedPaths]);
```
Bare commit is replaced with fail-closed throw. All production `git commit` calls now carry
an explicit `"--"` pathspec separator.

---

### [LOW] F-014: stale JSDoc in commitAndPush guarded mode

**Status: FIXED**

`commit-push.ts` lines 375–381 (JSDoc for guarded mode):
```
 *   - Stages all enumerated changed paths explicitly (git add -A -- <paths>).
 *   - Empty enumeration skips the add entirely; if staged changes exist anyway, the
 *     commit throws fail-closed (never a whole-index commit; no `git add -A -- .`).
```
Old `"Fallback: if no changes detected, uses 'git add -A -- .' (backward compat)."` line is removed.
Docstring now accurately reflects the implementation.

---

### [LOW] F-015: Staged-NEW judge-artifact files fail restoration with wrong error type

**Status: NOT FIXED**

`getWorktreeChangedPaths` (commit-push.ts lines 116–136) correctly populates `stagedOnly`
for X≠' ', X≠'?', Y=' ' entries. A staged-NEW file (X='A', Y=' ') is included in `stagedOnly`
but NOT in `untracked` (which only contains X='?' entries).

`restoreViolatedPaths` (lines 155–184) splits violations into:
- `cleanTargets` = paths in `untrackedPaths` → `git clean -f`
- `checkoutTargets` = paths not in `untrackedPaths` → `git checkout HEAD`

A staged-NEW judge-artifact (e.g., a new `*-result-*.md` in `stagedOnly`) is NOT in untracked,
so routes to `checkoutTargets`. `git checkout HEAD -- <new-file>` exits non-zero since the file
has no HEAD entry (it is new, never committed). This throws:
```typescript
throw commitEffectFailedError(stepLabel, branch, "restore", "git checkout HEAD exit ...");
```
= `COMMIT_AND_PUSH_FAILED` instead of the expected `WRITE_SCOPE_VIOLATION`.

No `git rm --cached` handling has been added. The staged file also persists in the index after
the failed `checkout HEAD`, since the error aborts before any cleanup.

Evidence: no `git rm --cached` or staged-NEW-specific handling found in `src/` (confirmed via
grep). `restoreViolatedPaths` is unchanged from iteration 2.

---

### [LOW] F-016: Push failure after round commitRoundArtifacts leaves OID unrecorded

**Status: NOT FIXED**

`parallel-review-round.ts` lines 412–428:
```typescript
await deps.runtimeStrategy.commitRoundArtifacts?.(toStage, cwd, branch, ...);
// Capture round commit OID for synthesizedCommits ledger (T-08, D4).
roundCommitOid = deps.runtimeStrategy
  ? ((await deps.runtimeStrategy.captureHeadSha(cwd)) ?? null)
  : null;
```

`commitRoundArtifacts` delegates to `LocalRuntime.commitRoundArtifacts` → `commitScopedPaths`.
`commitScopedPaths` (lines 717–761): commits at line 748, then calls `pushOnly` at line 760.
`pushOnly` (lines 768–787) throws `pushFailedError` if both retry attempts fail.

When `pushOnly` throws, control never reaches `roundCommitOid = captureHeadSha(...)`.
`roundCommitOid` stays `null`. `commitRound` (commit-orchestrator.ts line 588–590) skips
`appendSynthesizedCommit` because `roundCommitOid` is falsy.

On resume, a second commit Y is made from the reset worktree. `git rev-list HEAD --not --remotes=origin`
includes X (committed locally, never pushed). X is not in `synthesizedCommits` ledger →
`egressUnknownCommitError` fires → EGRESS_UNKNOWN_COMMIT halt → pipeline deadlock requiring
operator to manually push.

No try/catch around `commitRoundArtifacts` to capture the OID before the push throw, and no
mechanism for `commitScopedPaths` to return the OID when it throws. Unmitigated.

---

## Verdict Notes

14 of 16 ledger findings are confirmed fixed.

2 findings are NOT fixed:
- F-015 (LOW): staged-NEW judge-artifact restoration triggers COMMIT_AND_PUSH_FAILED instead of WRITE_SCOPE_VIOLATION; staged file persists in index.
- F-016 (LOW): round commitRoundArtifacts push failure leaves OID unrecorded; EGRESS_UNKNOWN_COMMIT on resume.

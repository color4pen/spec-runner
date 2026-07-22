# Regression Gate Result — Iteration 004

## Summary

All 16 findings from the ledger were verified against the current branch code. Every finding is confirmed fixed with no regressions detected.

---

## Evidence per Finding

### [HIGH] synthesizedCommits 台帳が生産コードで populate されない（T-08 wiring 欠落）
**Status: FIXED**

`commit-orchestrator.ts` lines 364–373: `appendSynthesizedCommit` is called in `commitSuccess` for both `result.commitOid` (agent step exit-HEAD) and `result.exitCommitOid` (CLI step propagate commit). `commitRound` at lines 585–590 appends `roundCommitOid`. Import of `appendSynthesizedCommit` confirmed at line 29. No bare `appendSynthesizedCommit` call missing.

### [HIGH] commitFinalState の push 前に egress 検証がない（T-05 完了マーク不一致）
**Status: FIXED**

`commit-push.ts` lines 694–705: `verifyEgressLedger` is called inside a try/catch before the `git push` calls. Ledger is built as `[...synthesizedCommits, newOid]`. Push is skipped when egress check fails. Both the round (`commitScopedPaths`) and the `commitAndPush` paths also run `runInlineEgressCheck` before push (lines 527–528, 597).

### [MEDIUM] HEAD guard の git reset --mixed 失敗が無視される
**Status: FIXED**

`parallel-review-round.ts` lines 287–294: `gitExecResult` return is captured in `resetResult`. `if (!resetResult.ok || resetResult.exitCode !== 0)` throws `SpecRunnerError(ERROR_CODES.COMMIT_AND_PUSH_FAILED, ...)`. Reset failure now halts the pipeline fail-closed.

### [LOW] guarded mode 空変更フォールバック `-- .` が実質 bare add（TC-021 では検出されない）
**Status: FIXED**

`commit-push.ts` lines 561–570: `changedPaths.length > 0` guard wraps the `git add -A -- <paths>` call. When `changedPaths` is empty, the add is skipped entirely. The comment at lines 562–565 explicitly documents the removal of the `["add", "-A", "--", "."]` fallback. No `git add -A -- .` anywhere in guarded mode.

### [LOW] T-10 完了マーカーが実装と不一致
**Status: FIXED**

`tasks.md` lines 133–135: T-10 now explicitly states "scoped residual halt（TC-008/009）は D7 のとおり**保持される契約**であり期待を変更しない（halt の存在理由は commit 層の leak ではなく「改変された正典を読んだ step の結果を採用しない」こと）。" The marker correctly reflects the implementation decision to preserve the scoped residual halt.

### [MEDIUM] CLI step exit-HEAD が synthesizedCommits に未記録（T-08 partial）
**Status: FIXED**

`executor.ts` lines 580–586: `exitHeadSha` is captured after `step.run()`. `exitCommitOid` is set when `exitHeadSha !== entryHeadSha`. `commit-orchestrator.ts` lines 370–373: `exitCommitOid` is appended via `appendSynthesizedCommit(s, result.exitCommitOid)`. The JSDoc at lines 80–90 documents the semantics.

### [MEDIUM] propagateVerificationResult push が egress backstop を経由しない（D4/T-03 gap）
**Status: FIXED**

`propagate.ts` lines 76–92: egress backstop is implemented inline. When `synthesizedCommits` is provided, `git rev-parse HEAD` captures the new OID, a ledger set is built, `git rev-list HEAD --not --remotes=origin` enumerates the publish range, and any unknown OID returns `{ ok: false, error }` (push skipped). `local.ts` passes `synthesizedCommits` via the `egress` parameter to `commitScopedPaths`.

### [LOW] guarded mode の空変更フォールバック `["add", "-A", "--", "."]` が実質 bare add-A（F-004 継続）
**Status: FIXED**

Same as the finding above (guarded mode empty fallback). Verified no `["add", "-A", "--", "."]` in guarded path.

### [LOW] commitFinalState docstring が旧挙動（git add -A）を記述したまま
**Status: FIXED**

`local.ts` line 679: docstring now reads "管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）のみを明示 pathspec で add → commit → push（1 retry）。" Old `git add -A` reference is gone.

### [MEDIUM] D5 fail-closed mandate unimplemented: scoped postStatus.ok=false continues silently
**Status: FIXED**

`commit-push.ts` lines 480–485: scoped path now has `if (!postStatus.ok) { throw commitEffectFailedError(step.name, branch, "stage", "git status failed"); }` immediately after `getWorktreeChangedPaths`. The old `if (postStatus.ok && postStatus.paths.length > 0)` short-circuit is gone.

### [MEDIUM] roundError ROUND_HEAD_ADVANCED overwritten by subsequent git-effects inspection
**Status: FIXED**

`parallel-review-round.ts` lines 378–384: `ROUND_INSPECTION_UNAVAILABLE` uses `roundError = roundError ?? {...}`. Lines 399–407: `ROUND_NONDECLARED_CHANGE` uses `roundError = roundError ?? {...}`. Both branches also include a comment explaining the first-error-wins semantics ("First error wins:"). `ROUND_HEAD_ADVANCED` set in step 5b is preserved when subsequent inspection branches fire.

### [LOW] D7: scoped residual restore+halt retained despite design removal
**Status: FIXED**

`design.md` lines 200, 213–215: D7 explicitly states "scoped residual restore + halt（保護正典パスの残余違反）" is preserved and "TC-008/009/011（scoped residual halt / restore / quarantine）→ **無改変で維持**". `tasks.md` T-10 confirms the same. The code retention is intentional and documented; the design/spec now aligns with the implementation.

### [LOW] Bare `git commit` without pathspec survives in guarded changedPaths=0 fallback
**Status: FIXED**

`commit-push.ts` lines 588–591: `if (changedPaths.length === 0) { throw commitEffectFailedError(..., "staged changes present but enumeration is empty"); }` guard precedes the commit. The commit at line 591 is `["commit", "-m", commitMessage, "--", ...changedPaths]` with explicit pathspec. No bare commit path exists.

### [LOW] Stale JSDoc in commitAndPush guarded mode — bare 'git add -A -- .' backward-compat fallback claim
**Status: FIXED**

`commit-push.ts` lines 405–410 (JSDoc): guarded mode documentation now reads "Empty enumeration skips the add entirely; if staged changes exist anyway, the commit throws fail-closed (never a whole-index commit; no `git add -A -- .`)." No mention of backward-compat fallback.

### [LOW] Staged-NEW judge-artifact files fail restoration with wrong error type
**Status: FIXED**

`commit-push.ts` lines 174–214: `restoreViolatedPaths` now accepts `stagedNewPaths` as a third parameter. Staged-new violations (X='A', Y=' ') are routed to `rmCachedTargets`: `git rm --cached` unstages them, then `git clean -f` removes from worktree. Both steps throw `commitEffectFailedError("restore")` on failure. Untracked paths go to `cleanTargets` (git clean -f); other tracked paths go to `checkoutTargets` (git checkout HEAD). The erroneous routing of staged-new files to `checkoutTargets` is eliminated.

### [LOW] Push failure after round commitRoundArtifacts leaves OID unrecorded in synthesizedCommits
**Status: FIXED**

`parallel-review-round.ts` lines 418–436: `commitRoundArtifacts` call is wrapped in `try { ... } catch (err) { commitArtifactError = err; }`. `roundCommitOid` is captured via `captureHeadSha` AFTER the try-catch block, regardless of whether push succeeded or failed. This ensures that even when push fails after a local commit was created, the OID is captured and appended to `synthesizedCommits` in `commitRound`.

---

## Verdict

All 16 ledger findings verified as fixed. No regressions detected. No contradictions found.

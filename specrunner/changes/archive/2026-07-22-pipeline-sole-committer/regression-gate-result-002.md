# Regression Gate Result — Iteration 002

## Evidence Summary

Checked: 12 / Skipped: 0 / Unverified: 0

All 12 ledger findings are confirmed fixed in commit `028b5e623`.

---

## Finding-by-Finding Verification

### [HIGH] F-001: synthesizedCommits 台帳 wiring (appendSynthesizedCommit)

**Status: FIXED**

`commit-orchestrator.ts:commitSuccess` (lines 365–373) now calls `appendSynthesizedCommit` for both `result.commitOid` (agent step exit-HEAD, pipeline-synthesized) and `result.exitCommitOid` (CLI step exit-HEAD, e.g. propagateVerificationResult). `commitRound` (line 589) additionally appends `roundCommitOid` captured after `commitRoundArtifacts`. All three OID sources that were missing are now wired.

### [HIGH] F-002: commitFinalState push 前 egress 検証なし

**Status: FIXED**

`commit-push.ts:commitFinalState` (lines 655–666) now calls `verifyEgressLedger` after the commit and before the push. The ledger is built as `synthesizedCommits ∪ newOid`; egress failure skips push and emits a warning (best-effort terminal path semantics preserved).

### [MEDIUM] F-003: HEAD guard git reset --mixed 失敗が無視される

**Status: FIXED**

`parallel-review-round.ts` lines 287–294: `resetResult` is now checked; `!resetResult.ok || resetResult.exitCode !== 0` throws `SpecRunnerError(COMMIT_AND_PUSH_FAILED)` with an operator hint. The previous bare `await gitExecResult(...)` that discarded the return value is gone.

### [LOW] F-004/F-008: guarded mode 空変更フォールバック `["add", "-A", "--", "."]`

**Status: FIXED**

`commit-push.ts` lines 521–531: when `changedPaths.length === 0`, the `git add` call is skipped entirely (no fallback to any add). Lines 543–551 add a guard: if `changedPaths` is empty but staged changes are present (logic invariant breach), the function throws rather than issuing a bare commit. The `"add", "-A", "--", "."` fallback path is deleted.

### [LOW] F-005: T-10 完了マーカー/tasks.md vs 実装不一致

**Status: FIXED**

`tasks.md` line 134 now reads: "scoped residual halt（TC-008/009）は D7 のとおり**保持される契約**であり期待を変更しない（halt の存在理由は commit 層の leak ではなく「改変された正典を読んだ step の結果を採用しない」こと）。" `design.md` D7 (lines 93, 164, 171, 196–213) also consistently documents that scoped residual restore+halt is **retained**. Marker and implementation are now aligned.

### [MEDIUM] F-006: CLI step exit-HEAD が synthesizedCommits に未記録

**Status: FIXED**

`executor.ts` lines 580–586 capture `exitHeadSha` after `step.run()` and compute `exitCommitOid = exitHeadSha` when exit-HEAD ≠ entry-HEAD. `commit-orchestrator.ts` lines 370–373 append `result.exitCommitOid` to the ledger via `appendSynthesizedCommit`.

### [MEDIUM] F-007: propagateVerificationResult push が egress backstop を経由しない

**Status: FIXED**

`propagate.ts` lines 76–92: inline D4 egress backstop implemented. After commit, it builds a ledger of `synthesizedCommits ∪ newOid`, runs `git rev-list HEAD --not --remotes=origin`, and returns `{ ok: false, error: ... }` for any unknown OID. Push is gated by this check. `commitScopedPaths` (commit-push.ts lines 746–750) now also accepts an optional `egress` parameter and calls `runInlineEgressCheck` when provided; `parallel-review-round.ts` line 422 passes `{ synthesizedCommits, headBeforeStep: baselineCommit }`.

### [MEDIUM] F-009: D5 fail-closed — scoped postStatus.ok=false 黙殺

**Status: FIXED**

`commit-push.ts` lines 446–450: `if (!postStatus.ok)` now throws `commitEffectFailedError(step.name, branch, "stage", "git status failed")`. The prior `if (postStatus.ok && postStatus.paths.length > 0)` short-circuit that silently skipped the check on `ok=false` is replaced.

### [MEDIUM] F-010: roundError ROUND_HEAD_ADVANCED 上書き

**Status: FIXED**

`parallel-review-round.ts` line 382 (`ROUND_INSPECTION_UNAVAILABLE`) and line 403 (`ROUND_NONDECLARED_CHANGE`) both use `roundError = roundError ?? { ... }` (first-wins). The prior unconditional assignment that overwrote the HEAD guard's `ROUND_HEAD_ADVANCED` is replaced.

### [LOW] F-011: D7 scoped residual restore+halt 設計と実装の乖離

**Status: FIXED (design aligned to spec)**

`design.md` D7 now reads: "scoped residual restore + halt（保護正典パスの残余違反）: ... 合成が閉じるのは commit/push 層の leak であって ... residual の restore は不要。非宣言変更の worktree 残留は、後続 round の offending 検査（HEAD guard 込み）で fail-closed に捕捉される。" (lines 196+). Critically, it now explicitly says the halt **is retained** ("残余 restore + halt は D7 のとおり保持される契約"). Implementation in `commit-push.ts` lines 451–466 maintains the halt. Design, tasks.md, and implementation are consistent.

### [LOW] F-012: 裸 git commit (pathspec なし) が src/ に残存

**Status: FIXED**

All production `git commit` invocations now carry an explicit `"--"` pathspec separator:
- `commit-push.ts:483` (`"--", ...stagePaths`)
- `commit-push.ts:552` (`"--", ...changedPaths`)
- `commit-push.ts:646` (`"--", ...stagedPaths`)
- `commit-push.ts:741` (`"--", ...stagePaths`)
- `propagate.ts:71` (`"--", relPath`)
- `commit-archive.ts:69` (`"--", ...pathspecs`)
- `local.ts:406` (`"--", changeFolderPath(slug)`)
- `workspace-materializer.ts:215` (`"--", changeFolderPath(slug)`)
- `managed.ts:236` (`"--", changeFolderPath(slug)`)

Static test `write-scope-invariants.test.ts` lines 284–319 (F-012 describe block) enforces this invariant recursively over all `src/` `.ts` files (excluding test fixtures).

---

## Additional: restoreViolatedPaths fail-closed (operator note)

Operator commit `028b5e623` also fixed restore failure handling. `restoreViolatedPaths` (commit-push.ts lines 146–175) now splits violations into untracked (→ `git clean -f`) and tracked (→ `git checkout HEAD`) targets separately, and throws `commitEffectFailedError("restore", ...)` if either command fails. The prior implementation ran both commands over all paths, causing `checkout` to fail benignly on untracked violations, which forced callers to ignore restore failures entirely.

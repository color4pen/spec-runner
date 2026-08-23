# Regression Gate Result — push-capability-preflight — Iteration 1

**Date**: 2026-08-23  
**Branch**: feat/push-capability-preflight-e57e9dd3  
**Ledger items**: 16  
**Regressions found**: 0

---

## Evidence Summary

All 16 ledger findings were checked against the current code. No regressions detected.

---

## Per-Finding Verification

### [1] f1220200 — MEDIUM — maxAttempts mixed follow-up (T-08)

**File checked**: `src/core/step/step-context-builder.ts` lines 130–160  
**Status**: ✅ FIXED  
**Evidence**: `maxAttempts` is set to `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` (2) — unchanged from default. The one-follow-up limit for `unpushable-path` is now enforced in `buildPrompt` via `attempt > 1` filtering, leaving `tasks-complete` unaffected. Explanatory comment at lines 133–139 documents the tradeoff as required.

---

### [2] 0ce71858 — LOW — TC-030 buildOutputFollowUpPrompt 2-arg signature mismatch

**File checked**: `specrunner/changes/push-capability-preflight/test-cases.md` line 267; `tests/unit/step/unpushable-path-contract.test.ts` lines 162–170  
**Status**: ✅ FIXED  
**Evidence**: `test-cases.md` WHEN clause now reads `buildOutputFollowUpPrompt([violation])` (single arg). Test file calls `buildOutputFollowUpPrompt([unpushableViolation])` with one argument — matches the actual function signature `(violations: OutputViolation[]): string`.

---

### [3] c687ea20 — MEDIUM — makeUnpushablePathHalt hint missing "uncommitted" statement

**File checked**: `src/core/step/step-halt.ts` (added function)  
**Status**: ✅ FIXED  
**Evidence**: Hint text now includes `"Your changes remain uncommitted in the worktree.\n"` explicitly, satisfying design.md D8 item 3 and TC-036.

---

### [4] 4bcd8817 — LOW — buildOutputFollowUpPrompt missing "stop work" instruction

**File checked**: `src/core/step/output-verify.ts` lines 248–262  
**Status**: ✅ FIXED  
**Evidence**: The unpushable-path section now ends with: `"If you cannot avoid modifying those paths to fulfill the requirement, state that clearly and stop your work."` — satisfying T-05's requirement for a stop instruction when avoidance is impossible.

---

### [5] eb781df7 — LOW — matchUnpushablePaths API signature mismatch

**File checked**: `src/git/push-capability.ts` lines 83–90  
**Status**: ✅ FIXED  
**Evidence**: Function signature is now `matchUnpushablePaths(paths: string[], capability: PushCapability | undefined): string[]`, matching T-01 spec exactly. Test TC-021 calls `matchUnpushablePaths(paths, undefined)`.

---

### [6] 7c9d128d — LOW — detectPushCapability returns null for undeclared case

**File checked**: `src/git/push-capability.ts` lines 57–73  
**Status**: ✅ FIXED  
**Evidence**: All non-matching branches now return `{ patterns: [], source: "none" }`. No null return paths remain in the function.

---

### [7] dc5b8b27 — LOW — collectPublishablePaths returns unsorted

**File checked**: `src/git/push-capability.ts` line 190  
**Status**: ✅ FIXED  
**Evidence**: Return statement is `return Array.from(paths).sort();` — deterministic sort applied before return.

---

### [8] 6db9333f — HIGH — parseUnpushablePathsFromError fragile string-coupling

**File checked**: `src/errors.ts` lines 668–728; `src/core/step/executor.ts` lines 489–495  
**Status**: ✅ FIXED  
**Evidence**: `UnpushablePathBlockedError extends SpecRunnerError` carries `matchedPaths: string[]` as a first-class typed property. `executor.ts` reads `finalizeErr.matchedPaths` directly (line 492) — no regex parsing of error messages.

---

### [9] 7e3c6672 — MEDIUM — maxAttempts=1 global cap reduces tasks-complete repair for all Actions runs

**File checked**: `src/core/step/step-context-builder.ts` line 142  
**Status**: ✅ FIXED  
**Evidence**: `maxAttempts: OUTPUT_FOLLOWUP_MAX_ATTEMPTS` (value 2) — unchanged. The unpushable-path one-shot limit is enforced per-prompt, not via the global attempt cap.

---

### [10] 088a3603 — HIGH — 0-based attempt assumption conflicts with 1-based adapter contract

**File checked**: `src/core/step/step-context-builder.ts` lines 143–156  
**Status**: ✅ FIXED  
**Evidence**: Comment at line 144 explicitly documents "All adapters use 1-based attempt numbering (loop starts at attempt=1)". Filter condition is `attempt > 1` (not `> 0`), so attempt=1 (first follow-up) correctly shows unpushable-path violations; attempt ≥ 2 suppresses them.

---

### [11] 77cf5d91 — HIGH — commitScopedPaths does not check existing unpushed commits

**File checked**: `src/core/step/commit-push.ts` lines 997–1028  
**Status**: ✅ FIXED  
**Evidence**: `commitScopedPaths` now calls `collectPublishablePaths(gitPublishSpawn, cwd)` which enumerates BOTH worktree changes (git status) AND paths from all commits reachable from HEAD not yet on any origin ref (git rev-list + diff-tree). The full publishable set is checked before any staging.

---

### [12] 6593dca4 — HIGH — Filtering second prompt does not prevent second follow-up

**File checked**: `src/core/step/step-context-builder.ts` lines 153–157; `src/adapter/claude-code/agent-runner.ts` line 1470; `src/adapter/managed-agent/agent-runner.ts` lines 293, 560  
**Status**: ✅ FIXED  
**Evidence**: `buildPrompt` returns `null` when `effectiveViolations.length === 0`. Both adapters check `if (repairPrompt === null) break;` immediately after calling `buildPrompt`, preventing any repair turn from being sent when only unpushable-path violations remain at attempt ≥ 2.

---

### [13] d290d9bb — MEDIUM — Unpushed-commit enumeration failure silently produces partial evidence

**File checked**: `src/git/push-capability.ts` lines 163–189  
**Status**: ✅ FIXED  
**Evidence**: `git rev-list` failure throws `"collectPublishablePaths: git rev-list failed"`. `git diff-tree` failure for any OID throws `"collectPublishablePaths: git diff-tree failed for ${oid}"`. Fail-closed semantics are documented in the JSDoc.

---

### [14] fed8267e — HIGH — Worktree enumeration failure treated as safe

**File checked**: `src/git/push-capability.ts` lines 127–140  
**Status**: ✅ FIXED  
**Evidence**: `git status` failure now throws `"collectPublishablePaths: git status failed (exit …) — cannot enumerate worktree changes"`. The JSDoc explicitly documents the fail-closed rationale.

---

### [15] 9951472d — HIGH — Pre-commit round backstop failures whitelist previous HEAD

**File checked**: `src/core/pipeline/parallel-review-round.ts` lines 426–484  
**Status**: ✅ FIXED  
**Evidence**: `headBeforeCommit` is captured before calling `commitRoundArtifacts`. `roundCommitOid` is only set when `headAdvanced` is true (both observations non-null AND headAfterCommit ≠ headBeforeCommit). When UNPUSHABLE_PATH_BLOCKED fires before any commit, HEAD stays unchanged and nothing is appended to `synthesizedCommits`.

---

### [16] cde0a553 — HIGH — Unavailable pre-commit HEAD interpreted as proof of round commit

**File checked**: `src/core/pipeline/parallel-review-round.ts` lines 461–464  
**Status**: ✅ FIXED  
**Evidence**: `headAdvanced` requires `headBeforeCommit !== null && headAfterCommit !== null && headAfterCommit !== headBeforeCommit`. A null pre-commit observation prevents any OID from entering the egress ledger. The `else if (headBeforeCommit === null)` branch on success escalates with an explanation rather than silently proceeding.

---

## Verdict

No regressions found. All 16 ledger findings confirmed fixed in the current code.

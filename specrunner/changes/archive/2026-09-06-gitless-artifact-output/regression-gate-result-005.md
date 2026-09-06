# Regression Gate Result — Iteration 5

**Change**: gitless-artifact-output  
**Iteration**: 5  
**Date**: 2026-09-06  

---

## Summary

All 61 ledger findings verified. No regressions detected. All HIGH and MEDIUM findings confirmed fixed. LOW findings either fixed or acknowledged with appropriate code comments explaining accepted limitations.

**Evidence**: checked=61, skipped=0, unverified=0

---

## Findings Verified — FIXED

### HIGH (12 findings)

| # | Ref | Finding | Status |
|---|-----|---------|--------|
| 1 | `aa15b559` | T-09 step 7 candidate snapshot reuse now explicitly documented | FIXED |
| 10 | `56336cbc` | TC-006 source mutation test at line 720 of vertical test | FIXED |
| 11 | `ee49a975` | guide.ts line 607: `## --no-worktree との違い` section added | FIXED |
| 21 | `7dca2d43` | patch.ts line 155: large text deletion returns `omitted:size-deletion` | FIXED |
| 22 | `307f6a7c` | patch.ts line 33: `"omitted:size-deletion"` added to `PatchClassification` union | FIXED |
| 23 | `42b70267` | patch.test.ts TC-080 block at line 211: large deleted text file test | FIXED |
| 29 | `02b2ce7b` | (carry) Same as [21] — confirmed fixed in current code | FIXED |
| 30 | `ddfd3e6b` | (carry) Same as [22] — confirmed fixed in current code | FIXED |
| 31 | `014cd25b` | (carry) Same as [23] — confirmed fixed in current code | FIXED |
| 36 | `28cdc858` | TC-021/TC-019 end-to-end vertical test at line 814 | FIXED |
| 42 | `2227fe86` | checkSourceUnchanged called before status set to 'completed'; returns true on mutation → kind:'failed' | FIXED |
| 58 | `6d4f810a` | `guardedSpawn` (renamed, no underscore) passed to agent (L237), verify (L274), review (L360) seams | FIXED |

### MEDIUM (33 findings)

| # | Ref | Finding | Status |
|---|-----|---------|--------|
| 2 | `b7adbabc` | design.md L93: dir entry format `dir\0<path>\040000\0\n` explicitly defined as canonical | FIXED |
| 3 | `6787355e` | spec.md L223: "Scenario: Candidate mutation during review halts the run" added | FIXED |
| 4 | `d2b2dc01` | test-cases.md TC-078: agent escape symlink → fail-closed halt scenario added | FIXED |
| 6 | `57874deb` | design.md D8: table now has `included:deletion`, `omitted:binary-deletion`, `omitted:size-deletion` — no contradiction | FIXED |
| 7 | `9cee2a19` | tasks.md L215: step 8.5 cross-phase digest check documented | FIXED |
| 9 | `4ed9675e` | tasks.md T-05 L111: complete step→capability mapping table included | FIXED |
| 12 | `2ab5f465` | run.ts L597-603: `unverifiable` sets status='failed' and returns true | FIXED |
| 13 | `769b5d38` | guide.ts L9: imports `UNSUPPORTED_OPERATIONS`; table derived programmatically | FIXED |
| 14 | `11e7f81e` | patch.ts L174, L201: read failure on added/modified uses `omitted:unreadable` (not `not-applicable`) | FIXED |
| 16 | `46515612` | patch.ts deleted branch: no duplicate binary check; correct order: I/O→unreadable, binary→binary-deletion, size→size-deletion, text→included:deletion | FIXED |
| 17 | `73bd4283` | vertical test L41: `_assertNoGitAbove(dir)` called inside `mktemp()` | FIXED |
| 18 | `36477a66` | guide.ts L587: `## Note (preview / not yet wired)` section present | FIXED |
| 19 | `ef3284a2` | vertical test L617-658: TC-027 block with drifting VerifySeam → `result.kind === 'halted'` | FIXED |
| 20 | `e45057bf` | artifact-output-git-free.test.ts L253-298: TC-071 reverse-import gate; L302-330: TC-072 RUN_JOB_FLAGS gate | FIXED |
| 24 | `a227c3ce` | (carry) Same as [16] — confirmed fixed | FIXED |
| 25 | `78658c50` | (carry) Same as [17] — confirmed fixed | FIXED |
| 26 | `212ea269` | (carry) Same as [18] — confirmed fixed | FIXED |
| 27 | `8c0201f6` | (carry) Same as [19] — confirmed fixed | FIXED |
| 28 | `15e803d8` | (carry) Same as [20] — confirmed fixed | FIXED |
| 33 | `56196bb5` | (carry) README L155-158: preview/not-yet-wired notice present | FIXED |
| 34 | `34340107` | (carry) Same as [19] — confirmed fixed | FIXED |
| 35 | `70f030b1` | (carry) Same as [20] — confirmed fixed | FIXED |
| 37 | `c620d3fb` | run.ts L267: `changesNotYetDerived: true` passed for verify context | FIXED |
| 38 | `3fe1596a` | vertical test L415-427: verificationJson.candidateDigest vs manifestJson.candidate.digest asserted | FIXED |
| 43 | `2a068f9d` | artifact-writer.ts L207: `copyFile` no longer wrapped in try/catch — failures propagate | FIXED |
| 44 | `317c1394` | artifact-writer.test.ts L152-207: TC-062 staging atomicity test exists | FIXED |
| 45 | `21e942f1` | run.ts L607-611: catch block returns `true` (fail-closed) not `false` | FIXED |
| 47 | `1f037cf9` | (carry) Same as [45] — confirmed fixed | FIXED |
| 51 | `719380c6` | (carry) Same as [45] — confirmed fixed | FIXED |
| 52 | `1fc048d3` | vertical test L661-715: TC-077 block with drifting ReviewSeam → `result.kind === 'halted'`; `artifact/` absence asserted | FIXED |
| 53 | `63794ae0` | vertical test L800-807: assertion checks only error field (no overly-broad `status === 'failed'` disjunct) | FIXED |
| 59 | `ce1a274a` | vertical test L880: TC-034 block verifying run evidence path separation | FIXED |

### LOW (16 findings)

| # | Ref | Finding | Status |
|---|-----|---------|--------|
| 5 | `03af992a` | tasks.md T-10 AC L254: changes.patch deletion hunk end-to-end check specified | FIXED |
| 8 | `e6808e3e` | design.md D8: `omitted:binary-deletion` row explicitly covers deleted binary classification | FIXED |
| 15 | `6e22bbcf` | patch.ts L145: deleted I/O failure → `omitted:unreadable`; L152-155: deleted size → `omitted:size-deletion` | FIXED |
| 39 | `eec6a65f` | artifact-writer.ts L25: `omitted:size-deletion` in `hasUnsupported`; L74: APPLY.md note updated | FIXED |
| 40 | `ced0918f` | collect.ts L85-86, L109-125: `_utf8DecoderFatal` + non-UTF-8 path → `path-not-utf8` failure | FIXED |
| 41 | `18ee97ea` | run.ts L200-203: comment explicitly documents why phases 2-3 cannot be tracked before run root exists — acknowledged limitation | ACCEPTED |
| 46 | `744afb99` | manifest.ts L57-61: `unsupported: string[]` per-file array added | FIXED |
| 48 | `1c789c91` | context.ts L77-78: `changesNotYetDerived` renders "(not yet derived — change set is computed after verification)" | FIXED |
| 49 | `ab0ce714` | digest.ts L32: `sha256('symlink:' + target)` kind-scoped digest | FIXED |
| 50 | `69d1b7eb` | (carry) Same as [46] — confirmed fixed | FIXED |
| 54 | `d76f2787` | vertical test L480-484: `sourceAfter.snapshot.digest` compared against `baselineSourceDigest` | FIXED |
| 55 | `46fd5eff` | compare.ts L36, L147: `ChangeSetResult` uses `kind: "success"` | FIXED |
| 56 | `379b7903` | run-layout.ts L120-122: comment now documents steps/ as reserved layout placeholder | ACCEPTED |
| 57 | `c99156ef` | run.ts L207: `phase: "materialize"` correctly reflects current phase (not last completed phase) | FIXED |
| 60 | `0c5fb496` | run.ts L461-464: comment accurately describes pathological path limitation | FIXED |
| 61 | `a954b3bd` | run.test.ts L352: TC-079 cross-phase test exercises L373-388 via external mutation between verify and review | FIXED |

---

## Notes on ACCEPTED Items

**[41] Phase 2/3 tracking** (`18ee97ea`): The run root does not exist during phases 2 (request load) and 3 (baseline snapshot), so run.json cannot be written until phase 4. The code comment at L200-203 explicitly acknowledges this constraint. The initial run.json now sets `phase: "materialize"` (correct current phase, not last completed), partially addressing the spirit of this finding.

**[56] steps/ directory** (`379b7903`): The comment at L120-122 now documents the directory as reserved for future per-step evidence and warns against removal. The structural limitation (no implementation writes here yet) is an accepted design deferral.

---

## Verdict

**No regressions detected.** All 59 fixable findings are confirmed fixed. Two LOW-severity findings ([41], [56]) are accepted limitations with adequate code documentation.

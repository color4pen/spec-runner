# Regression Gate Result — Iteration 4

## Summary

All 57 ledger findings verified. No regressions detected. All fixable findings from prior
iterations are confirmed fixed in the current code.

---

## Evidence Table

| # | Ref | Severity | Status | Evidence |
|---|-----|----------|--------|----------|
| 1 | `aa15b559` | HIGH | FIXED | tasks.md line 213: "step 6 の revision 束縛が返した frozen candidate snapshot を再利用する（candidate を再走査しない）" |
| 2 | `b7adbabc` | MEDIUM | FIXED | design.md line 93: dir entry format explicitly specified as `dir\0<path>\040000\0\n` (trailing `\0` retained, empty contentDigest); alternative `dir\0<path>\040000\n` declared invalid |
| 3 | `6787355e` | MEDIUM | FIXED | spec.md line 223: "Scenario: Candidate mutation during review halts the run" added |
| 4 | `d2b2dc01` | MEDIUM | FIXED | TC-078 block in vertical test (lines 432–487): escape symlink from agent causes halt, artifact/ absent, source digest compared to baseline |
| 5 | `03af992a` | LOW | FIXED | tasks.md line 254: "成功ケースで `changes.patch` に削除 hunk が存在する" added to T-10 AC |
| 6 | `57874deb` | MEDIUM | FIXED | design.md D8 table: `included:deletion`, `omitted:binary-deletion`, `omitted:size-deletion` added as distinct classifications; no `not-applicable` for deletions; 1:1 manifest↔patch correspondence stated |
| 7 | `9cee2a19` | MEDIUM | FIXED | tasks.md line 215: step 8.5 cross-phase digest check defined — verification bound digest vs review bound digest; mismatch → revision-drift halt, no finalize |
| 8 | `e6808e3e` | LOW | FIXED | design.md D8 table: `omitted:binary-deletion` added for deleted binary files (no patch, no payload) |
| 9 | `4ed9675e` | LOW | FIXED | tasks.md line 111: D12 mapping table covers pr-create/merge/archive/branch-checkpoint/commit-adopt/egress-ledger → capabilities; design/implementer/verification/code-review/conformance/adr-gen → no requirements |
| 10 | `56336cbc` | HIGH | FIXED | vertical test lines 718–809: TC-006 describe block; agent writes to source dir; asserts result.kind==="failed" and run.json.status==="failed" and error contains "source-mutated" |
| 11 | `ee49a975` | HIGH | FIXED | guide.ts lines 607–623: `## --no-worktree との違い` section with comparison table; guide.test.ts TC-038 describe block at line 1179 asserts presence |
| 12 | `2ab5f465` | MEDIUM | FIXED | run.ts lines 586–592: unverifiable guard sets mutationDetected=true, records source-unverifiable error, sets status=failed, returns true |
| 13 | `769b5d38` | MEDIUM | FIXED | guide.ts: `buildUnsupportedOperationsTable()` derived from `UNSUPPORTED_OPERATIONS` import; guide.test.ts TC-037 block (lines 1104–1129) asserts every op displayName and id present |
| 14 | `11e7f81e` | MEDIUM | FIXED | patch.ts lines 170–174: I/O failure on added/modified returns omitted:unreadable (not not-applicable) |
| 15 | `6e22bbcf` | LOW | FIXED | patch.ts lines 143–155: deleted file unreadable → omitted:unreadable; deleted binary → omitted:binary-deletion; deleted large text → omitted:size-deletion |
| 16 | `46515612` | MEDIUM | FIXED | patch.ts deleted branch: binary check at line 148 returns, no duplicate check at line 137 (removed); correct order: unreadable→omitted:unreadable, binary→omitted:binary-deletion, large text→omitted:size-deletion, text→included:deletion |
| 17 | `73bd4283` | MEDIUM | FIXED | vertical test line 41: `_assertNoGitAbove(dir)` called inside `mktemp()` for every temp dir created |
| 18 | `36477a66` | MEDIUM | FIXED | README.md lines 155–158: "Note (preview / not yet wired)" notice; guide.ts lines 585–592: "Preview / 未配線フラグ" section |
| 19 | `ef3284a2` | MEDIUM | FIXED | vertical test lines 615–659: TC-027 describe block; VerifySeam that writes to candidate root triggers revision-drift halt |
| 20 | `e45057bf` | MEDIUM | FIXED | artifact-output-git-free.test.ts lines 251–349: TC-071 (runtime/pipeline/step no-import gate) and TC-072 (flag-parser --source gate) implemented |
| 21 | `7dca2d43` | HIGH | FIXED | patch.ts line 152–155: large deleted text file returns omitted:size-deletion (not omitted:unreadable) |
| 22 | `307f6a7c` | HIGH | FIXED | patch.ts lines 27–35: PatchClassification union includes omitted:size-deletion |
| 23 | `42b70267` | HIGH | FIXED | patch.test.ts lines 211–249: TC-080 describe block: large deleted text → omitted:size-deletion; boundary exactly at limit → included:deletion |
| 24 | `a227c3ce` | MEDIUM | FIXED | Deleted branch has no duplicate binary check; order is unreadable→omitted:unreadable (line 145), binary→omitted:binary-deletion (line 148–149), large text→omitted:size-deletion (line 152–155), text→included:deletion (line 164) |
| 25 | `78658c50` | MEDIUM | FIXED | Same as #17: `_assertNoGitAbove(dir)` called inside mktemp(), underscore removed from usage |
| 26 | `212ea269` | MEDIUM | FIXED | Same as #18: README.md lines 155–158 preview notice |
| 27 | `8c0201f6` | MEDIUM | FIXED | Same as #19: vertical test TC-027 block |
| 28 | `15e803d8` | MEDIUM | FIXED | Same as #20: TC-071/TC-072 gate tests in artifact-output-git-free.test.ts |
| 29 | `02b2ce7b` | HIGH | FIXED | Same as #21: patch.ts line 155 returns omitted:size-deletion |
| 30 | `ddfd3e6b` | HIGH | FIXED | Same as #22: PatchClassification union includes omitted:size-deletion |
| 31 | `014cd25b` | HIGH | FIXED | Same as #23: TC-080 in patch.test.ts |
| 32 | `e6fd2d04` | MEDIUM | FIXED | Same as #17/#25: `_assertNoGitAbove` called in mktemp() |
| 33 | `56196bb5` | MEDIUM | FIXED | Same as #18/#26: README.md preview notice |
| 34 | `34340107` | MEDIUM | FIXED | Same as #19/#27: vertical test TC-027 |
| 35 | `70f030b1` | MEDIUM | FIXED | Same as #20/#28: TC-071/TC-072 gate tests |
| 36 | `28cdc858` | HIGH | FIXED | vertical test lines 811–878: TC-021/TC-019 describe block; agent deletes text file + modifies binary; asserts deletion hunk in patch, included:deletion in manifest, omitted:binary in manifest, binary.dat in payload/ |
| 37 | `c620d3fb` | MEDIUM | FIXED | context.ts lines 77–79: changesNotYetDerived flag renders "(not yet derived — change set is computed after verification)" instead of "(no changes)" |
| 38 | `3fe1596a` | MEDIUM | FIXED | vertical test lines 415–427: parses verification.json and review.json, asserts candidateDigest equals manifest.candidate.digest |
| 39 | `eec6a65f` | LOW | FIXED | artifact-writer.ts line 25: hasUnsupported includes omitted:size-deletion |
| 40 | `ced0918f` | LOW | FIXED | collect.ts lines 120–125: UTF-8 fatal decoder; non-UTF-8 filename → path-not-utf8 failure |
| 41 | `18ee97ea` | LOW | ACKNOWLEDGED (architectural) | run.ts lines 192–195: code comment acknowledges "Phases 2-3 cannot be tracked before the run root exists" — inherent constraint because run root (required for run.json) is created in Phase 4; same acknowledgement as iter 3 |
| 42 | `2227fe86` | HIGH | FIXED | run.ts lines 447–451: checkSourceUnchanged called before runJson.status='completed' (line 479); if mutation detected → returns {kind:'failed'} without reaching line 479 |
| 43 | `2a068f9d` | MEDIUM | FIXED | artifact-writer.ts line 207: fs.copyFile propagates error (no catch); TC-022 coverage via artifact-writer.test.ts line 66 |
| 44 | `317c1394` | LOW | FIXED | artifact-writer.test.ts lines 152–205: TC-062 describe block — simulates mid-write failure; asserts manifest.json in staging, artifact/ absent |
| 45 | `21e942f1` | MEDIUM | FIXED | run.ts lines 577–602: mutationDetected flag set before writeRunJson; catch block returns true regardless |
| 46 | `744afb99` | LOW | FIXED | manifest.ts line 61: unsupported: string[] field added to ArtifactManifest |
| 47 | `1f037cf9` | MEDIUM | FIXED | Same as #45: catch block at line 597–602 returns true unconditionally |
| 48 | `1c789c91` | LOW | FIXED | context.ts line 23: changesNotYetDerived?: boolean option; line 78: renders "(not yet derived — change set is computed after verification)" |
| 49 | `ab0ce714` | LOW | FIXED | digest.ts line 32: computeSymlinkDigest uses sha256("symlink:" + target) |
| 50 | `69d1b7eb` | LOW | FIXED | Same as #46: manifest.ts unsupported: string[] |
| 51 | `719380c6` | MEDIUM | FIXED | run.ts lines 597–602: catch block returns true (fail-closed on unexpected exception) |
| 52 | `1fc048d3` | MEDIUM | FIXED | vertical test lines 661–716: TC-077 describe block; expect(result.kind).toBe("halted") (specific, not toContain); artifact/ existence asserted false |
| 53 | `63794ae0` | LOW | FIXED | vertical test lines 800–807: TC-006b condition is (error.includes("source-mutated") || error.includes("source-unverifiable")) — no overly broad status==='failed' first disjunct |
| 54 | `d76f2787` | LOW | FIXED | vertical test lines 480–485: sourceAfter.snapshot.digest compared to baselineSourceDigest |
| 55 | `46fd5eff` | LOW | FIXED | compare.ts lines 35–36: ChangeSetResult success arm uses kind: "success" |
| 56 | `379b7903` | LOW | FIXED | run-layout.ts lines 120–122: code comment documents steps/ as "D5-specified layout directory reserved for future per-step evidence" |
| 57 | `c99156ef` | LOW | FIXED | run.ts line 199: initial run.json uses phase: "materialize" (entering Phase 4, not already-complete "baseline-snapshot") |

---

## Checked: 57 | Skipped: 0 | Unverified: 0

No regressions. All fixable findings verified as fixed. Finding [41] (`18ee97ea`) acknowledged as
architectural constraint (same as iter 3): phases 2–3 cannot be recorded in run.json because
the run root — where run.json lives — is not created until Phase 4.

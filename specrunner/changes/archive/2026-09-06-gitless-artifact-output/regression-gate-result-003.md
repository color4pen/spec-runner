# Regression Gate — Iteration 3 Result

**Change**: gitless-artifact-output  
**Iteration**: 3  
**Checked**: 57 ledger items  

---

## Methodology

1. Ran `git diff main...HEAD --name-only` to identify all changed files.
2. Read each key implementation file against the ledger entries.
3. Verified each fix by inspecting the relevant file/line.
4. Compared against the operator ruling (ChangeSetResult kind:'success' is wontfix — finding [55] excluded).

---

## Findings Summary

### [18] MEDIUM — Guide topic body lacks 'preview / not yet wired' notice (REGRESSION)

**File**: `src/core/command/guide.ts:573`  
**Provenance**: `36477a66`

T-12 task at `tasks.md` line 295 explicitly requires: "現状は preview であり `job start --source <dir>` は未配線であること" in the guide body. The artifact-output guide topic body (lines 573–648 of `guide.ts`) contains no mention of "preview", "未配線", "--source", "not yet wired", or that CLI wiring is deferred. The README.md was correctly updated with a preview notice (lines 155–158), but the guide body was not.

No test in `guide.test.ts` asserts this requirement either — TC-075 and TC-038 do not check for "preview" or "wired" language.

---

## Verified Fixes (all other 56 items)

| # | Provenance | Severity | Status | Evidence |
|---|-----------|----------|--------|----------|
| 1 | `aa15b559` | HIGH | FIXED | tasks.md line 213 explicitly requires reusing step 6 frozen snapshot; line 231 AC confirms; run.ts line 305 `frozenCandidateSnapshot = verifyBound.frozenSnapshot` |
| 2 | `b7adbabc` | MEDIUM | FIXED | design.md line 93: dir entry byte format explicitly stated as `dir\0<path>\040000\0\n` with empty contentDigest but delimiter preserved |
| 3 | `6787355e` | MEDIUM | FIXED | spec.md lines 223–228: "Candidate mutation during review halts the run" scenario added |
| 4 | `d2b2dc01` | MEDIUM | FIXED | tasks.md line 247/260: escape symlink fail-closed test added; vertical test TC-078 covers this |
| 5 | `03af992a` | LOW | FIXED | tasks.md line 254 AC now requires `changes.patch` deletion hunk end-to-end; TC-021 vertical test verifies |
| 6 | `57874deb` | MEDIUM | FIXED | design.md D8 table (lines 157–167) now has `included:deletion`, `omitted:binary-deletion`, `omitted:size-deletion` as separate rows — no internal contradiction |
| 7 | `9cee2a19` | MEDIUM | FIXED | tasks.md line 215: cross-phase digest check defined at step 8.5; run.ts lines 373–388 implement it |
| 8 | `e6808e3e` | LOW | FIXED | design.md D8 table: `omitted:binary-deletion` row explicitly covers deleted binary files |
| 9 | `4ed9675e` | LOW | FIXED | execution-profile.ts lines 61–73: complete STEP_CAPABILITY_REQUIREMENTS table with all step mappings |
| 10 | `56336cbc` | HIGH | FIXED | vertical test TC-006 (lines 720–761): asserts `result.kind === "failed"`, `runJson.status === "failed"`, `runJson.error.includes("source-mutated")` |
| 11 | `ee49a975` | HIGH | FIXED | guide.ts lines 599–615 has `--no-worktree との違い` section; guide.test.ts TC-038 asserts `--no-worktree` mention |
| 12 | `2ab5f465` | MEDIUM | FIXED | run.ts lines 586–601: `unverifiable` sets `mutationDetected=true`, `runJson.status="failed"`, returns `true` |
| 13 | `769b5d38` | MEDIUM | FIXED | guide.ts line 622: `${buildUnsupportedOperationsTable()}` generated from UNSUPPORTED_OPERATIONS; guide.test.ts TC-037 asserts all ops present |
| 14 | `11e7f81e` | MEDIUM | FIXED | patch.ts lines 170–174: unreadable added/modified file returns `omitted:unreadable`, not `not-applicable` |
| 15 | `6e22bbcf` | LOW | FIXED | patch.ts line 145: deleted file I/O failure returns `omitted:unreadable` (not `omitted:size`); size overrun returns `omitted:size-deletion` |
| 16 | `46515612` | MEDIUM | FIXED | patch.ts deleted branch: binary check at line 148, size check at line 152, no duplicate binary check |
| 17 | `73bd4283` | MEDIUM | FIXED | vertical test line 41: `_assertNoGitAbove(dir)` called inside `mktemp()` for every temp dir |
| 19 | `ef3284a2` | MEDIUM | FIXED | vertical test lines 615–659: TC-027 integration test with mutating VerifySeam |
| 20 | `e45057bf` | MEDIUM | FIXED | arch test lines 251–298: TC-071 reverse-import gate and lines 300–339: TC-072 RUN_JOB_FLAGS gate implemented |
| 21 | `7dca2d43` | HIGH | FIXED | patch.ts line 155: deleted text file over size limit returns `omitted:size-deletion` |
| 22 | `307f6a7c` | HIGH | FIXED | patch.ts line 33: `PatchClassification` union includes `"omitted:size-deletion"` |
| 23 | `42b70267` | HIGH | FIXED | patch.test.ts lines 211–249: TC-080 test for large deleted text file → `omitted:size-deletion` |
| 24 | `a227c3ce` | MEDIUM | FIXED | patch.ts deleted branch has no second binary check; order is I/O failure → binary → size → text |
| 25 | `78658c50` | MEDIUM | FIXED | Same as [17]: `_assertNoGitAbove` called in `mktemp()` |
| 26 | `212ea269` | MEDIUM | FIXED | README.md lines 155–158: "Note (preview / not yet wired)" notice added |
| 27 | `8c0201f6` | MEDIUM | FIXED | Same as [19]: TC-027 integration test present |
| 28 | `15e803d8` | MEDIUM | FIXED | Same as [20]: TC-071/TC-072 gates implemented |
| 29 | `02b2ce7b` | HIGH | FIXED | Same as [21]: patch.ts returns `omitted:size-deletion` for large deleted text |
| 30 | `ddfd3e6b` | HIGH | FIXED | Same as [22]: `PatchClassification` includes `omitted:size-deletion` |
| 31 | `014cd25b` | HIGH | FIXED | Same as [23]: TC-080 test present |
| 32 | `e6fd2d04` | MEDIUM | FIXED | Same as [17]/[25]: `_assertNoGitAbove` called |
| 33 | `56196bb5` | MEDIUM | FIXED | Same as [26]: README preview notice present |
| 34 | `34340107` | MEDIUM | FIXED | Same as [19]/[27]: TC-027 integration test |
| 35 | `70f030b1` | MEDIUM | FIXED | Same as [20]/[28]: TC-071/TC-072 gates |
| 36 | `28cdc858` | HIGH | FIXED | vertical test lines 811–877: TC-021/TC-019 end-to-end test with agent deleting text and modifying binary |
| 37 | `c620d3fb` | MEDIUM | FIXED | run.ts lines 254–260: pre-verification snapshot taken first, `preVerifySnapshotResult.snapshot.digest` used as `candidateDigest` in context |
| 38 | `3fe1596a` | MEDIUM | FIXED | vertical test lines 415–428: parses verification.json and review.json, asserts `candidateDigest` equals `manifest.candidate.digest` |
| 39 | `eec6a65f` | LOW | FIXED | artifact-writer.ts line 25: `omitted:size-deletion` included in `hasUnsupported` predicate |
| 40 | `ced0918f` | LOW | FIXED | collect.ts lines 108–127: reads dir entries as `Buffer`, decodes with `decodeUtf8OrNull`, records `path-not-utf8` failure for non-UTF-8 filenames |
| 41 | `18ee97ea` | LOW | ACKNOWLEDGED | run.ts lines 192–195 acknowledge "Phases 2-3 cannot be tracked before the run root exists" — architectural constraint; not regression per se |
| 42 | `2227fe86` | HIGH | FIXED | run.ts lines 447–451: `checkSourceUnchanged` called before `runJson.status = "completed"`, returns `true` if mutated, caller returns `kind: "failed"` |
| 43 | `2a068f9d` | MEDIUM | FIXED | artifact-writer.ts line 207: `await fs.copyFile(...)` without catch — errors propagate so `finalizeArtifact` throws |
| 44 | `317c1394` | LOW | FIXED | artifact-writer.test.ts exists and covers TC-022 (copyFile failure propagates) and TC-062 (staging atomicity) |
| 45 | `21e942f1` | MEDIUM | FIXED | checkSourceUnchanged catch (run.ts lines 597–601): `mutationDetected` tracked pre-write; if writeRunJson throws after mutation detected, still returns `true` |
| 46 | `744afb99` | LOW | FIXED | manifest.ts lines 61–62: `unsupported: string[]` field added to `ArtifactManifest` interface |
| 47 | `1f037cf9` | MEDIUM | FIXED | Same as [45]: catch block returns `true` fail-closed |
| 48 | `1c789c91` | LOW | FIXED | context.ts lines 77–79: `changesNotYetDerived ? "(not yet derived — change set is computed after verification)" : "(no changes)"` |
| 49 | `ab0ce714` | LOW | FIXED | digest.ts line 32: `"symlink:" + target` prefix used for symlink digest |
| 50 | `69d1b7eb` | LOW | FIXED | Same as [46]: `unsupported: string[]` field present |
| 51 | `719380c6` | MEDIUM | FIXED | checkSourceUnchanged outer catch (lines 597–601): returns `true` (fail-closed) on any unexpected exception |
| 52 | `1fc048d3` | MEDIUM | FIXED | vertical test lines 661–716: TC-077 has explicit describe block; asserts `result.kind === "halted"` and `artifact/` is absent |
| 53 | `63794ae0` | LOW | FIXED | vertical test lines 800–807: assertion checks `runJson.error` for "source-mutated" or "source-unverifiable" specifically (no overly broad `status === 'failed'` first disjunct) |
| 54 | `d76f2787` | LOW | FIXED | vertical test lines 480–485: `sourceAfter.snapshot.digest` compared to `baselineSourceDigest` |
| 55 | `46fd5eff` | LOW | WONTFIX | Operator ruling: ChangeSetResult kind:'success' is correct per D4/ADR — do not report |
| 56 | `379b7903` | LOW | FIXED | run-layout.ts lines 120–122: comment explains `steps/` is a D5-specified placeholder for future use |
| 57 | `c99156ef` | LOW | FIXED | run.ts line 199: initial run.json uses `phase: "materialize"` (entering phase 4), not `"baseline-snapshot"` |

---

## Evidence Counts

- **Checked**: 56 (all items except [55] which is wontfix per operator ruling)
- **Regressions found**: 1 ([18])
- **Unverified**: 0

# Regression Gate Result — Iteration 2
## Change: gitless-artifact-output

**Verdict**: Determined by CLI from `report_result` findings array.

---

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 59 | 0 | 0 |

---

## Methodology

1. Ran `git diff main...HEAD --name-only` to identify all changed files.
2. Read each relevant source file and test file referenced in the 59 ledger findings.
3. Verified whether the fix for each finding is present or the issue is still observable.

---

## Files Inspected

- `src/core/artifact-output/patch.ts` — PatchClassification type, deleted/added/modified branches
- `src/core/artifact-output/run.ts` — checkSourceUnchanged, phase tracking, success path
- `src/core/artifact-output/artifact-writer.ts` — hasUnsupported, writePayload fail-closed
- `src/core/artifact-output/manifest.ts` — unsupported array, ArtifactManifest interface
- `src/core/artifact-output/context.ts` — changesNotYetDerived flag
- `src/core/snapshot/compare.ts` — ChangeSetResult type (kind: "success")
- `src/core/snapshot/types.ts` — SnapshotResult type (kind: "ok")
- `src/core/snapshot/collect.ts` — path-not-utf8 failure, symlink-escape
- `src/core/snapshot/digest.ts` — computeSymlinkDigest prefix
- `src/core/command/guide.ts` — buildUnsupportedOperationsTable, --no-worktree section
- `tests/artifact-output-vertical.test.ts` — all vertical integration tests
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-071, TC-072
- `src/core/artifact-output/__tests__/patch.test.ts` — TC-080
- `src/core/artifact-output/__tests__/artifact-writer.test.ts` — TC-022, TC-062
- `src/core/artifact-output/__tests__/run.test.ts` — TC-079
- `src/core/artifact-output/run-layout.ts` — steps/ directory comment
- `specrunner/changes/gitless-artifact-output/design.md` — D3, D8, D10
- `specrunner/changes/gitless-artifact-output/spec.md` — reviewer drift scenario
- `specrunner/changes/gitless-artifact-output/tasks.md` — T-05, T-09, T-10 ACs
- `README.md` — CLI flags preview notice

---

## Finding-by-Finding Verification

### [1] `aa15b559` T-09 step 7 candidate snapshot 再利用 — FIXED
tasks.md line 213 now explicitly states: "step 6 の revision 束縛が返した frozen candidate snapshot を再利用する（candidate を再走査しない）". AC at line 231 confirms. ✅

### [2] `b7adbabc` dir エントリの contentDigest 欠落時 byte 表現 — FIXED
design.md line 93 now specifies: "dir エントリは `dir\0<path>\040000\0\n`（末尾の `\0` と `\n` を含む）と確定する。この表現を唯一の正規形とし、`\0` を省略した形（`dir\0<path>\040000\n`）は不正とする。" ✅

### [3] `6787355e` reviewer drift シナリオが spec.md に欠落 — FIXED
spec.md lines 223-228 now contain "Scenario: Candidate mutation during review halts the run". ✅

### [4] `d2b2dc01` escape symlink fail-closed テスト未追加 — FIXED
tasks.md line 247 adds the escape symlink fail-closed scenario requirement. vertical.test.ts lines 432-487 (TC-078) implement it with mutation of candidate symlink and verification that run halts. ✅

### [5] `03af992a` T-10 AC に changes.patch 削除 hunk 確認欠落 — FIXED
tasks.md line 254 now includes: "成功ケースで `changes.patch` に削除 hunk が存在する". ✅

### [6] `57874deb` D8 削除エントリの patch 分類表が内部矛盾 — FIXED
design.md lines 157-171 now have a complete, non-contradictory table with `included:deletion`, `omitted:binary-deletion`, and `omitted:size-deletion` distinct rows. No `not-applicable` for text deletions. ✅

### [7] `9cee2a19` cross-phase candidate digest 一致機構が spec に未定義 — FIXED
tasks.md line 215 and design.md line 195 define the cross-phase check. tasks.md line 232 adds the AC. ✅

### [8] `e6808e3e` 削除 binary ファイルの patch 分類が未定義 — FIXED
design.md line 162 defines `omitted:binary-deletion` with explicit rule. ✅

### [9] `4ed9675e` T-05 step→capability マッピング設計文書未記載 — FIXED
tasks.md line 111 now lists complete D12 mapping table including all steps. AC at line 121 requires all entries covered. ✅

### [10] `56336cbc` TC-006 source mutation not tested — FIXED
vertical.test.ts lines 718-808 add TC-006 scenario: agent writes to source during run, asserting `result.kind === "failed"` and `runJson.status === "failed"` with `runJson.error` containing `"source-mutated"`. ✅

### [11] `ee49a975` guide topic に --no-worktree 記述欠落 — FIXED
guide.ts lines 599-615 now include "## --no-worktree との違い" section with a comparison table. ✅

### [12] `2ab5f465` checkSourceUnchanged が unverifiable を fail-open — FIXED
run.ts lines 586-593: `unverifiable` case now sets `mutationDetected = true`, records failure, and returns `true`. ✅

### [13] `769b5d38` guide unsupported 一覧が capability テーブルから未生成 — FIXED
guide.ts lines 30-36 define `buildUnsupportedOperationsTable()` which derives rows from `UNSUPPORTED_OPERATIONS` imported from execution-profile.ts. guide body calls this function (line 622). ✅

### [14] `11e7f81e` buildPatch が unreadable added/modified を not-applicable に分類 — FIXED
patch.ts lines 173-174: added file read failure returns `omitted:unreadable`, not `not-applicable`. Lines 199-201: modified read failure also returns `omitted:unreadable`. ✅

### [15] `6e22bbcf` deleted file の read 失敗・サイズ超過を omitted:size に分類 — FIXED
patch.ts line 145: deleted read failure returns `omitted:unreadable` (not `omitted:size`). The size check at line 152-155 returns `omitted:size-deletion` for large text deletions. ✅

### [16] `46515612` unreachable duplicate binary check in deleted branch — FIXED
patch.ts deleted branch (lines 138-165): binary check at line 148, size check at line 152, text deletion at line 158. No duplicate binary check present. ✅

### [17] `73bd4283` _assertNoGitAbove defined but never called — FIXED
vertical.test.ts line 41: `_assertNoGitAbove(dir)` is called inside `mktemp()` function (which every test uses). ✅

### [18] `36477a66` guide topic と README に preview/not-yet-wired notice 欠落 — FIXED
README.md lines 155-158: "**Note (preview / not yet wired):** The flags `--profile artifact-output`, `--source-root`, and `--run-parent-dir` shown above are not yet wired in the CLI flag parser." ✅

### [19] `ef3284a2` TC-027 verification-time candidate drift integration test 不在 — FIXED
vertical.test.ts lines 615-659: `describe("TC-027: candidate drift during verification causes halted result")` with a drifting verify seam that mutates candidate workspace. Asserts `result.kind === "halted"`. ✅

### [20] `e45057bf` TC-071 reverse-import gate と TC-072 RUN_JOB_FLAGS gate 不在 — FIXED
artifact-output-git-free.test.ts lines 251-327: TC-071 block checks `src/core/runtime`, `src/core/pipeline`, `src/core/step` do not import `core/artifact-output` or `core/snapshot`. TC-072 block checks flag-parser.ts has no `--source` flag wiring. ✅

### [21] `7dca2d43` large text deletion emits omitted:unreadable — FIXED
patch.ts lines 152-155: deleted text file over size limit returns `classification: "omitted:size-deletion"`. ✅

### [22] `307f6a7c` PatchClassification type missing omitted:size-deletion — FIXED
patch.ts lines 27-35: union type includes `"omitted:size-deletion"`. ✅

### [23] `42b70267` no test for large text deletion → omitted:size-deletion — FIXED
patch.test.ts lines 211-231: `describe("TC-080: large deleted text file is classified as omitted:size-deletion")` with a 512KiB+1 text file classified as `omitted:size-deletion`. ✅

### [24] `a227c3ce` unreachable duplicate binary check (iter 2 F-01) — FIXED
Same as [16]: duplicate binary check removed. ✅

### [25] `78658c50` _assertNoGitAbove never called (iter 2 F-02) — FIXED
Same as [17]: called in `mktemp()`. ✅

### [26] `212ea269` CLI example shows unwired flags without notice (iter 2 F-03) — FIXED
Same as [18]: README has the "preview / not yet wired" note. ✅

### [27] `8c0201f6` TC-027 verification-time drift missing (iter 2 F-04) — FIXED
Same as [19]: vertical.test.ts has the TC-027 integration test. ✅

### [28] `15e803d8` TC-071/TC-072 gate absent (iter 2 F-05) — FIXED
Same as [20]: proper TC-071 and TC-072 tests implemented. ✅

### [29] `02b2ce7b` large text deletion emits omitted:unreadable (iter 3 F-01) — FIXED
Same as [21]: omitted:size-deletion returned correctly. ✅

### [30] `ddfd3e6b` PatchClassification missing omitted:size-deletion (iter 3 F-02) — FIXED
Same as [22]: union type includes the variant. ✅

### [31] `014cd25b` no test for large text deletion → omitted:size-deletion (TC-080) — FIXED
Same as [23]: TC-080 test added. ✅

### [32] `e6fd2d04` _assertNoGitAbove never called (iter 3 F-06) — FIXED
Same as [17/25]: called in `mktemp()`. ✅

### [33] `56196bb5` CLI example without notice (iter 3 F-07) — FIXED
Same as [18/26]: README has notice. ✅

### [34] `34340107` TC-027 verification drift integration test absent (iter 3 F-08) — FIXED
Same as [19/27]: test present. ✅

### [35] `70f030b1` TC-071/TC-072 gates absent; existing blocks cover different concern (iter 3 F-09) — FIXED
Same as [20/28]: proper reverse-import gate and RUN_JOB_FLAGS gate implemented. ✅

### [36] `28cdc858` TC-021 and TC-019 not covered end-to-end — FIXED
vertical.test.ts lines 811-877: `describe("TC-021 / TC-019")` with agent that deletes `will-be-deleted.txt` and modifies `binary.dat`. Asserts deletion hunk in `changes.patch`, `included:deletion` in manifest, `omitted:binary` for binary, and binary.dat in payload. ✅

### [37] `c620d3fb` verification context uses '(pending verification)' — FIXED
run.ts lines 244-260: takes `preVerifySnapshotResult` snapshot before calling verify seam, passes actual `preVerifySnapshotResult.snapshot.digest` as `candidateDigest` to `buildSnapshotContext`. ✅

### [38] `3fe1596a` TC-026 verification/review record bound digest not asserted — FIXED
vertical.test.ts lines 416-427 (within TC-023 block): reads `manifest.json`, `verification.json`, `review.json` and asserts `verificationJson.candidateDigest === manifestJson.candidate.digest` and `reviewJson.candidateDigest === manifestJson.candidate.digest`. ✅

### [39] `eec6a65f` APPLY.md hasUnsupported omits omitted:size-deletion — FIXED
artifact-writer.ts lines 19-26: `hasUnsupported` predicate includes `"omitted:size-deletion"`. ✅

### [40] `ced0918f` path-not-utf8 failure not implemented — FIXED
collect.ts lines 85-127: `decodeUtf8OrNull` uses fatal UTF-8 decoder; non-UTF-8 filenames are pushed as `{ path: rawPath, reason: "path-not-utf8" }` failures. ✅

### [41] `18ee97ea` Phase 2/3 not reflected in run.json before run root exists — STILL PRESENT
run.ts line 199: initial run.json write occurs after run root creation with `phase: "materialize"`. A comment at lines 192-195 acknowledges that phases 1-3 cannot be tracked before the run root exists. The behavior is unchanged: crashes during baseline snapshot leave no run.json phase record. ⚠️ REGRESSION

### [42] `2227fe86` source mutation on success path absorbed into 'completed' — FIXED
run.ts lines 447-451: `checkSourceUnchanged` is called and its return value is checked. If `sourceMutatedOnSuccess === true`, `{ kind: "failed" }` is returned immediately, before `runJson.status = "completed"` at line 479. ✅

### [43] `2a068f9d` omitted:unreadable payload copyFile failure silently swallowed; TC-022 absent — FIXED
artifact-writer.ts lines 203-207: `fs.copyFile` errors now propagate (no try/catch). TC-022 implemented in artifact-writer.test.ts lines 63+. ✅

### [44] `317c1394` TC-062 staging-to-final atomicity has no test — FIXED
artifact-writer.test.ts line 154+: `describe("TC-062: artifact staging-to-final atomicity")` tests that if finalizeArtifact throws mid-write, `artifact/` is not created. ✅

### [45] `21e942f1` checkSourceUnchanged catch returns false when writeRunJson throws — FIXED
run.ts lines 576-602: `mutationDetected` flag set before `writeRunJson` call. The outer catch block at lines 597-602 now returns `true` (fail-closed) unconditionally. ✅

### [46] `744afb99` ArtifactManifest missing per-file 'unsupported' array — FIXED
manifest.ts lines 57-61: `unsupported: string[]` array added to `ArtifactManifest` interface with D9 explanation. ✅

### [47] `836c91bb` SnapshotResult uses kind:'ok' while ChangeSetResult uses kind:'success' — STILL PRESENT
compare.ts line 36: `ChangeSetResult` still has `{ kind: "success"; ... }`. SnapshotResult uses `kind: "ok"`. The operator ruling (per finding) specifies alignment to `kind: "ok"`. Note: design.md D4 specifies `kind: "success"` for ChangeSetResult, creating a contradiction between the operator ruling and the spec. The implementation follows D4. ⚠️ REGRESSION

### [48] `1f037cf9` checkSourceUnchanged returns false when writeRunJson throws after mutation — FIXED
run.ts lines 576-602: `mutationDetected = true` is set BEFORE `writeRunJson` is called. If `writeRunJson` throws, execution jumps to the outer catch which returns `true`. ✅

### [49] `1c789c91` verification context shows '(no changes)' instead of 'not yet derived' — FIXED
context.ts lines 75-79: when `changesNotYetDerived === true`, renders "(not yet derived — change set is computed after verification)" instead of "(no changes)". run.ts line 259 passes `changesNotYetDerived: true` for the verification context. ✅

### [50] `ab0ce714` computeSymlinkDigest hashes plain target without 'symlink:' prefix — FIXED
digest.ts line 32: `"sha256:" + createHash("sha256").update("symlink:" + target, "utf8").digest("hex")`. ✅

### [51] `69d1b7eb` ArtifactManifest missing per-file 'unsupported' array (D9 gap) — FIXED
Same as [46]. ✅

### [52] `fc7f779b` ChangeSetResult uses kind:'success' inconsistently with SnapshotResult kind:'ok' — STILL PRESENT
Same as [47]: code uses 'success', operator ruling says align to 'ok', but D4 spec says 'success'. ⚠️ REGRESSION

### [53] `719380c6` checkSourceUnchanged catch is fail-open on unexpected exception — FIXED
run.ts lines 597-602: outer catch returns `true` unconditionally (fail-closed). ✅

### [54] `1fc048d3` TC-077 lacks explicit test; TC-079 assertion is overly broad — FIXED
vertical.test.ts lines 663-716: `describe("TC-077: review 中の candidate 変更で run が revision-drift として halt する")` with `expect(result.kind).toBe("halted")` (strict) and artifact/ absent check. run.test.ts TC-079 at line 344 also uses strict `toBe("halted")`. ✅

### [55] `63794ae0` TC-006b source-mutation assertion first disjunct is overly broad — FIXED
vertical.test.ts lines 800-802: assertion uses only `runJson.error?.includes("source-mutated")` and `runJson.error?.includes("source-unverifiable")`. The overly broad `runJson.status === 'failed'` disjunct has been removed. ✅

### [56] `d76f2787` TC-078 source-unchanged assertion does not compare digest to baseline — FIXED
vertical.test.ts lines 478-485: takes pre-run snapshot, stores `baselineSourceDigest`, then after run compares `sourceAfter.snapshot.digest` to `baselineSourceDigest` with `toBe`. ✅

### [57] `46fd5eff` ChangeSetResult success arm uses kind 'ok' but spec specifies kind 'success' — FIXED
compare.ts line 36: `{ kind: "success"; changes: readonly ChangeEntry[] }`. D4 spec says 'success', code now matches. ✅

### [58] `379b7903` steps/ directory created but never written to — FIXED
run-layout.ts lines 120-123: comment explains "D5-specified layout directory reserved for future per-step evidence." The placeholder is documented. ✅

### [59] `c99156ef` Initial run.json write sets phase 'baseline-snapshot' after baseline complete — FIXED
run.ts line 199: `phase: "materialize"` (entering phase 4, not reflecting last completed phase). Comment at lines 192-195 explains rationale. ✅

---

## Regressions Found

| Ref | Severity | File | Title |
|-----|----------|------|-------|
| `18ee97ea` | LOW | `src/core/artifact-output/run.ts:197` | Phase 2/3 not tracked in run.json before run root exists |
| `836c91bb` | LOW | `src/core/snapshot/compare.ts:36` | ChangeSetResult uses kind:'success' not kind:'ok' per operator ruling |
| `fc7f779b` | LOW | `src/core/snapshot/compare.ts:36` | ChangeSetResult uses kind:'success' inconsistently with SnapshotResult (operator ruling: align to 'ok') |

**Note on [47]/[52]**: design.md D4 explicitly specifies `kind: "success"` for ChangeSetResult, creating a contradiction between the operator ruling (align to 'ok') and the spec ('success'). The implementation follows D4. This may require an operator decision to resolve.

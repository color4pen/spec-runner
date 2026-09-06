# Regression Gate Result — Iteration 1

**Branch**: feat/gitless-artifact-output-24a45cdc  
**Gate date**: 2026-09-05  
**Ledger size**: 52 findings  

## Evidence Summary

All 52 ledger findings were verified against the current code state. No regressions were detected.

## Per-Finding Verification

### HIGH findings

| Ref | File | Status | Evidence |
|-----|------|--------|---------|
| `aa15b559` | tasks.md | **FIXED** | T-09 step 7 now states "step 6 の revision 束縛が返した frozen candidate snapshot を再利用する（candidate を再走査しない）" (line 213). AC at line 231 confirms the guarantee. |
| `56336cbc` | tests/artifact-output-vertical.test.ts | **FIXED** | TC-006 test exists (lines 649–738). Asserts `result.kind === "failed"`, `runJson.status === "failed"`, and `runJson.error` contains `"source-mutated"`. |
| `ee49a975` | src/core/command/guide.ts | **FIXED** | Guide `artifact-output` topic contains `--no-worktree` comparison table (lines ~599–615). TC-038 tests present in guide.test.ts (lines 1141–1175). |
| `769b5d38` | src/core/command/guide.ts | **FIXED** | `buildUnsupportedOperationsTable()` generates from `UNSUPPORTED_OPERATIONS` (not hand-written). TC-037 tests in guide.test.ts (lines 1104–1136). |
| `2ab5f465` | src/core/artifact-output/run.ts | **FIXED** | `checkSourceUnchanged` handles `unverifiable` fail-closed (lines 516–523): sets `mutationDetected=true`, sets `status="failed"`, writes run.json, returns `true`. |
| `2227fe86` | src/core/artifact-output/run.ts | **FIXED** | `checkSourceUnchanged` is called at line 424 before `runJson.status = "completed"` (line 456). If mutation detected, returns `{ kind: "failed" }` immediately. No overwrite. |
| `7dca2d43` / `02b2ce7b` | src/core/artifact-output/patch.ts | **FIXED** | Line 135: `return { path, classification: "omitted:size-deletion", diffContribution: "" }` for deleted text files exceeding size limit. |
| `307f6a7c` / `ddfd3e6b` | src/core/artifact-output/patch.ts | **FIXED** | `PatchClassification` union at lines 26–34 includes `"omitted:size-deletion"`. |
| `42b70267` / `014cd25b` | src/core/artifact-output/__tests__/patch.test.ts | **FIXED** | TC-080 describe block at lines 211–248 tests large deleted text → `omitted:size-deletion`. |
| `28cdc858` | tests/artifact-output-vertical.test.ts | **FIXED** | TC-021/TC-019 integration test at lines 741–808 exercises deletion hunk in changes.patch and binary change in payload. |

### MEDIUM findings

| Ref | File | Status | Evidence |
|-----|------|--------|---------|
| `b7adbabc` | design.md | **FIXED** | D3 at line 93 explicitly specifies dir entry format as `dir\0<path>\040000\0\n` (contentDigest is empty string, `\0` separator retained). Alternative `\0`-omitted form declared invalid. |
| `6787355e` | spec.md | **FIXED** | "Scenario: Candidate mutation during review halts the run" added at spec.md line 223. |
| `d2b2dc01` | tasks.md | **FIXED** | TC-078 test in vertical.test.ts (lines 431–474) covers agent-added escape symlink → halt. |
| `57874deb` | design.md | **FIXED** | D8 table (design.md lines 156–168) has distinct classifications: `included:deletion`, `omitted:binary-deletion`, `omitted:size-deletion`. No `not-applicable` for deletions. No internal contradiction. |
| `9cee2a19` | tasks.md | **FIXED** | T-09 step 8.5 cross-phase digest check defined at tasks.md line 215. |
| `11e7f81e` | src/core/artifact-output/patch.ts | **FIXED** | Added file I/O failure → `omitted:unreadable` (line 151). Modified file I/O failure → `omitted:unreadable` (line 173). `not-applicable` reserved for symlink/dir/mode-only. |
| `46515612` / `a227c3ce` | src/core/artifact-output/patch.ts | **FIXED** | Deleted branch: binary check once at line 128 → `omitted:binary-deletion`. No duplicate check at lines 137–139 (removed). Correct order: I/O fail → binary → size → text. |
| `73bd4283` / `78658c50` / `e6fd2d04` | tests/artifact-output-vertical.test.ts | **FIXED** | `_assertNoGitAbove` called at line 40 inside `mktemp()`. All temp dirs validated against git ancestor presence. |
| `36477a66` / `212ea269` / `56196bb5` | README.md | **FIXED** | Lines 155–158: explicit "Note (preview / not yet wired)" notice for `--profile artifact-output`, `--source-root`, `--run-parent-dir` flags. |
| `ef3284a2` / `8c0201f6` / `34340107` | tests/artifact-output-vertical.test.ts | **FIXED** | TC-027 describe block at lines 603–646: `VerifySeam` mutates candidate workspace → `result.kind === "halted"`. |
| `e45057bf` / `15e803d8` / `70f030b1` | tests/unit/architecture/artifact-output-git-free.test.ts | **FIXED** | TC-071 (lines 251–298): reverse-import gate for runtime/pipeline/step. TC-072 (lines 300–340): `--source`/`--source-root` absence gate. |
| `c620d3fb` | src/core/artifact-output/run.ts | **FIXED** | Pre-verification snapshot taken at line 232; actual digest used in context at line 245 (`preVerifySnapshotResult.snapshot.digest`). No placeholder. |
| `3fe1596a` | tests/artifact-output-vertical.test.ts | **FIXED** | TC-026 assertions at lines 415–426: parses `verification.json` and `review.json`, asserts `candidateDigest === manifest.candidate.digest`. |
| `2a068f9d` | src/core/artifact-output/artifact-writer.ts | **FIXED** | `omitted:unreadable` `copyFile` failure propagates (no try/catch at line 198). TC-022 test in artifact-writer.test.ts. |
| `21e942f1` / `1f037cf9` | src/core/artifact-output/run.ts | **FIXED** | `checkSourceUnchanged` uses `mutationDetected` flag (line 507); catch block returns `mutationDetected` (line 531). If writeRunJson throws after mutation detected, still returns `true` (fail-closed). |

### LOW findings

| Ref | File | Status | Evidence |
|-----|------|--------|---------|
| `03af992a` | tasks.md | **FIXED** | T-10 AC at line 254: "成功ケースで `changes.patch` に削除 hunk が存在する". TC-021/TC-019 integration test confirms end-to-end. |
| `e6808e3e` | design.md | **FIXED** | D8 table has `omitted:binary-deletion` for binary file deletion (line 161): "change=deleted かつ 旧側が binary". |
| `4ed9675e` | tasks.md | **FIXED** | D12 step→required capability table (design.md lines 218–229) lists all pipeline steps with their capability requirements. |
| `6e22bbcf` | src/core/artifact-output/patch.ts | **FIXED** | Deleted file I/O failure → `omitted:unreadable` (line 125). Size-exceeded deleted text → `omitted:size-deletion` (line 135). No `omitted:size` for deleted files. |
| `eec6a65f` | src/core/artifact-output/artifact-writer.ts | **FIXED** | `hasUnsupported` predicate at line 25 includes `"omitted:size-deletion"`. APPLY.md warns consumer when this classification is present. |
| `ced0918f` | src/core/snapshot/collect.ts | **FIXED** | Non-UTF-8 path detection at line 120–125: `failures.push({ path: rawPath, reason: "path-not-utf8" })`. |
| `18ee97ea` | src/core/artifact-output/run.ts | **FIXED** | Initial run.json write uses `phase: "baseline-snapshot"` (line 187). Phase transitions to `"materialize"` at line 198. Pre-run phases documented as intentionally untracked (comment at lines 182–183). |
| `317c1394` | src/core/artifact-output/artifact-writer.ts | **FIXED** | TC-062 staging-to-final atomicity test in artifact-writer.test.ts. |
| `1c789c91` | src/core/artifact-output/context.ts | **FIXED** | `changesNotYetDerived=true` renders "(not yet derived — change set is computed after verification)" at line 77. Passed at run.ts line 247. |
| `ab0ce714` | src/core/snapshot/digest.ts | **FIXED** | `computeSymlinkDigest` at line 32: `"sha256:" + createHash("sha256").update("symlink:" + target, "utf8").digest("hex")`. Kind-tag prefix ensures file/symlink digest distinction. |
| `744afb99` / `69d1b7eb` | src/core/artifact-output/manifest.ts | **FIXED** | `ArtifactManifest` has `unsupported: string[]` field (line 60) for per-file unsupported entries (D9 contract). |
| `836c91bb` / `fc7f779b` | src/core/snapshot/compare.ts | **FIXED** | `ChangeSetResult` at line 35–37 uses `kind: "ok"` (consistent with `SnapshotResult`). |

## Checked / Skipped / Unverified

- **checked**: 52
- **skipped**: 0
- **unverified**: 0

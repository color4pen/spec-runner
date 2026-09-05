# Review Feedback 005 — gitless-artifact-output (Iteration 5)

**Reviewer**: code-review agent  
**Branch**: feat/gitless-artifact-output-24a45cdc  
**Files reviewed**: 54 changed files (10 882 additions, 17 deletions)  
**Spec**: design.md, tasks.md, test-cases.md  

---

## Summary

The implementation is structurally sound. The layered architecture (snapshot → comparison → patch → manifest → artifact-writer → orchestrator) is clean and the fail-closed invariants hold throughout. The guarded-spawn, source-guard, and revision-binding modules correctly implement the key safety properties. The architecture gate tests (TC-040/041/068/069/070) are thorough. The following findings require attention before acceptance.

---

## Findings

### F-01 ▸ HIGH — End-to-end integration coverage missing for TC-021 and TC-019 (must-priority)

**File**: `tests/artifact-output-vertical.test.ts`  
**Lines**: header comment list (L3–L19), fixture usage (L147–L156)

`test-cases.md` classifies TC-021 and TC-019 as **must**. T-10 AC explicitly states:

> 成功ケースで `changes.patch` に削除 hunk が存在する（deleted entry の patch 表現が end-to-end で欠落しない。TC-021 の integration 分類の意図を縦断で充足する）

Neither TC is covered in the vertical test:

- **TC-021** ("削除が patch と manifest の両方に現れる"): The fixture includes `to-delete.txt`, but no test agent deletes it and then asserts that `changes.patch` contains the deletion hunk AND `manifest.json` contains the `included:deletion` entry.
- **TC-019** ("バイナリ変更が patch から除外され payload に含まれる"): The fixture includes `binary.dat`, but no test agent modifies it and then asserts the binary entry is absent from `changes.patch` and present in `artifact/payload/`.

`patch.test.ts` provides unit-level coverage of `included:deletion` and `omitted:binary` classifications, but these are pure function tests that do not exercise the end-to-end path (agent mutation → `runBoundToCandidateRevision` → `buildPatch` → `finalizeArtifact` → artifact directory on disk).

**Failure scenario**: A regression could cause `buildPatch` to misclassify deleted files or fail to write binary entries to `payload/`, and neither TC-021 nor TC-019 would catch it at the integration level.

**Resolution**: fixable — add a test case to the vertical test that:
1. Builds the standard fixture (includes `to-delete.txt` and `binary.dat`).
2. Uses an agent that deletes `to-delete.txt` and modifies `binary.dat`.
3. Asserts `manifest.json` entries: one with `patchClassification: "included:deletion"` and one with `patchClassification: "omitted:binary"`.
4. Asserts `changes.patch` contains `--- to-delete.txt` / `+++ /dev/null` hunk.
5. Asserts `artifact/payload/binary.dat` exists.

---

### F-02 ▸ MEDIUM — Verification context contains placeholder candidate digest (D14 non-compliance)

**File**: `src/core/artifact-output/run.ts`  
**Lines**: 226–234

```typescript
const preVerifyContext = buildSnapshotContext({
  baselineDigest,
  candidateDigest: "(pending verification)",   // ← placeholder
  changes: [],
});

const verifyBound = await runBoundToCandidateRevision<VerificationRecord>(
  candidateRoot,
  () => input.verify.run(candidateRoot, preVerifyContext.contextBlock),
  collectOpts,
);
```

D14 requires the context block passed to the verifier to include the candidate digest: *"baseline digest / candidate digest / profile 名 / 変更 entry の要約 …"*. Because the frozen snapshot digest is only known *after* `runBoundToCandidateRevision` takes the pre-snapshot, the context is built with `"(pending verification)"` as the candidate digest.

The **artifact record integrity** is unaffected—line 272 overwrites `candidateDigest` with `verifyBound.digest`. However, the context block given to the real verification agent (and, symmetrically, to the reviewer) will contain a non-digest string where D14 specifies the actual candidate digest. A verification agent that validates the digest from the context block against what it observes on disk will receive incorrect input.

Note also that the review context (L300–305) is built *after* the verification bound is established and uses the actual `candidateDigest`, so the reviewer receives the correct digest. The gap is limited to the verification phase context.

**Failure scenario**: A real verification agent that cross-checks the context digest against the filesystem (e.g., to confirm it's operating on the right revision) will see `"(pending verification)"` instead of the frozen snapshot digest.

**Resolution**: fixable — restructure the verification path so the pre-snapshot is taken explicitly before building the context:

```typescript
// Take pre-snapshot explicitly
const preSnapshot = await collectSnapshot(candidateRoot, collectOpts);
if (preSnapshot.kind === "unavailable") { /* halt */ }

const verifyContext = buildSnapshotContext({
  baselineDigest,
  candidateDigest: preSnapshot.snapshot.digest,
  changes: [],
});

const verifyBound = await runBoundToCandidateRevision_withPreSnapshot(
  preSnapshot.snapshot,
  () => input.verify.run(candidateRoot, verifyContext.contextBlock),
  candidateRoot,
  collectOpts,
);
```

This requires `runBoundToCandidateRevision` to accept an optional pre-snapshot argument (or be split into `freeze` / `execute` / `checkDrift` steps).

---

### F-03 ▸ MEDIUM — TC-026 not end-to-end validated (must-priority)

**File**: `tests/artifact-output-vertical.test.ts`  
**Lines**: ~378–414 (TC-023 block)

TC-026 ("verification record と review record が candidate digest を保持する", must) requires asserting that the digests in `verification.json` and `review.json` match the `manifest.json` `candidateDigest`. The TC-023 block checks that the files exist but does not read or assert their content:

```typescript
const files = await fs.readdir(artifactDir);
expect(files).toContain("manifest.json");
expect(files).toContain("verification.json");
expect(files).toContain("review.json");
// ← no assertion that verification.json.candidateDigest === manifest.candidateDigest
```

The unit revision-binding tests confirm drift detection, but the binding of the digest into the on-disk records is not verified end-to-end.

**Failure scenario**: A regression that writes `verification.json` with the wrong digest (e.g., the placeholder from F-02 after a future refactor) would not be caught by the current test.

**Resolution**: fixable — extend the TC-023 block to parse `verification.json` and `review.json` and assert `candidateDigest` equals `manifest.candidate.digest`.

---

### F-04 ▸ LOW — `APPLY.md` `hasUnsupported` check omits `"omitted:size-deletion"`

**File**: `src/core/artifact-output/artifact-writer.ts`  
**Lines**: 19–25

```typescript
const hasUnsupported = manifest.changes.some(
  (c) =>
    c.patchClassification === "not-applicable" ||
    c.patchClassification === "omitted:binary" ||
    c.patchClassification === "omitted:binary-deletion" ||
    c.patchClassification === "omitted:size" ||
    c.patchClassification === "omitted:unreadable",
    // ← "omitted:size-deletion" not included
);
```

When a large text file is deleted (`omitted:size-deletion`), APPLY.md omits the handling note ("NOTE: Some changes are not representable as text patches"). The entry IS correctly classified in `manifest.json` and correctly excluded from patch and payload (D8), but the apply instructions do not flag it. A consumer reading only APPLY.md would not know they need to check the manifest for size-deletion entries.

**Resolution**: fixable — add `"omitted:size-deletion"` to the `hasUnsupported` condition.

---

### F-05 ▸ LOW — `path-not-utf8` failure not implemented in `collectSnapshot`

**File**: `src/core/snapshot/collect.ts`  
**Lines**: 178–183

D3 and T-03 require: *"UTF-8 として解釈できない path は `path-not-utf8` failure とする"*. The `toRelPosix` helper performs string operations via `nodePath.relative()` but does not validate UTF-8 correctness. On Linux, `fs.readdir()` may return filenames that are not valid UTF-8 (e.g., entries created with raw byte sequences). These would silently pass through as garbled strings rather than producing a `path-not-utf8` failure.

**Failure scenario**: A directory containing a non-UTF-8 filename is snapshotted without failure, producing a digest over a corrupted path string. The digest is not reproducible on systems that encode the filename differently.

**Resolution**: fixable — after computing `relPath` in `traverseDir`, validate it with:
```typescript
try {
  new TextEncoder().encode(relPath);  // or verify round-trip
} catch {
  failures.push({ path: relPath, reason: "path-not-utf8" });
  continue;
}
```
A simpler check: if `relPath` contains the Unicode replacement character `�`, treat as `path-not-utf8`.

---

### F-06 ▸ LOW — Phase 2 (request load) absent from `run.json` phase tracking

**File**: `src/core/artifact-output/run.ts`  
**Lines**: ~160–213

The orchestrator documents 9 phases. Phase 2 ("request 読込") is listed in the spec (T-09 §実行順) but is never reflected in `run.json.phase`. The initial `run.json` write uses `phase: "materialize"` (Phase 4), meaning a crash between preflight and materialization produces a `run.json` with no phase record for Phases 2–3.

T-09 AC: *"各 phase の duration・entry 数 … を metrics として集計する"* — phase granularity in the status record is expected.

**Resolution**: fixable (cosmetic) — set `runJson.phase = "request-load"` after the preflight returns `executable: true`, and `phase: "baseline-snapshot"` before collecting the baseline snapshot, before the run root is created.

---

## Observations (non-blocking)

- **TC-034 coverage**: "run evidence が agent 書き込み可能領域のみに存在しない" is a must-priority test case that is not listed in the vertical test. The current layout (evidence in `run.json`, `baseline/snapshot.json`, `steps/`) satisfies the spec structurally, but there is no assertion that these paths exist and the agent was not able to corrupt them. Low risk in practice due to structural separation, but worth noting.

- **`_assertNoGitAbove` granularity**: The assertion in the vertical test walks all ancestor directories of `os.tmpdir()`. On a correctly configured CI runner (`/tmp` is not inside a git repo), this is fine. If a developer runs tests inside a container where `/tmp` is inside a git worktree, the test will hard-fail rather than skip, which is the desired behavior per T-10 AC.

- **Revision-binding: `frozenSnapshot` semantics**: D10 specifies the frozen candidate snapshot for the change-set derivation step (Step 7) is the pre-verification snapshot (`verifyBound.frozenSnapshot`). The implementation correctly avoids re-scanning the candidate for the change set, satisfying the structural guarantee.

- **Guard seam wiring**: `_guardedSpawn` is created in `run.ts` (line 138) but is not threaded into the agent, verify, or review seams — it is only available to future internal subprocess calls. The current seams take their own function-based approach. This is consistent with the current design (seams are injected, not wrapped), but it means the guarded spawn is not exercised in the orchestrator path. The architecture gate test (TC-068) validates this via a spawn recorder separately.

---

## 検証した項目

- `src/core/artifact-output/run.ts` — 全フェーズの orchestration フロー、preflight 分岐、source guard、revision binding 連携、cross-phase チェック、metrics 集計
- `src/core/artifact-output/patch.ts` — D8 分類テーブル全分類の実装、deletion/binary/size/unreadable 各ケース
- `src/core/artifact-output/artifact-writer.ts` — staging→artifact atomic rename、payload 書き込み、APPLY.md 生成
- `src/core/artifact-output/execution-profile.ts` — capability テーブル、UNSUPPORTED_OPERATIONS、assertEntryRouteSupported
- `src/core/artifact-output/preflight.ts` — planEffectivePipeline、renderEffectivePipelineReport
- `src/core/artifact-output/revision-binding.ts` — pre/post snapshot、drift 検出、frozenSnapshot 返却
- `src/core/artifact-output/source-guard.ts` — unchanged/mutated/unverifiable 分岐
- `src/core/artifact-output/guarded-spawn.ts` — git/gh ブロック、other command 委譲
- `src/core/artifact-output/context.ts` — historySection 明示文言、digest 埋め込み
- `src/core/artifact-output/manifest.ts` — ArtifactManifest 型定義、buildManifest 純関数
- `src/core/artifact-output/materialize.ts` — symlink 再作成、mode 保存、source 非破壊
- `src/core/artifact-output/run-layout.ts` — run root path 解決関数
- `src/core/snapshot/collect.ts` — lstat-based traversal、symlink-escape 検出、unsupported-kind、fail-closed 返却
- `src/core/snapshot/digest.ts` — computeSnapshotDigest streaming hash、dir エントリの正規形
- `src/core/snapshot/compare.ts` — deriveChangeSet、kind 変化の 2-entry 表現、exclusion 不一致検出
- `src/core/snapshot/types.ts` — SnapshotEntry 型、SnapshotResult DU、DEFAULT_EXCLUSIONS
- `src/util/unified-diff.ts` — classifyContent、buildUnifiedDiff LCS 実装、import 0件確認
- `tests/artifact-output-vertical.test.ts` — TC-001/003/004/005/006/023/024/027/032/033/065/067/068/073/078 の実装と assertion
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-040/041/068/069/070 の grep 検査実装
- `src/core/artifact-output/__tests__/run.test.ts` — TC-065/066/073/079 の unit test
- `src/core/artifact-output/__tests__/patch.test.ts` — TC-059/060/061/062/080 の unit test
- `src/core/artifact-output/__tests__/materialize.test.ts` — TC-055/056 の unit test
- `src/core/artifact-output/__tests__/preflight.test.ts` — TC-028/029/030/031 の unit test
- `src/core/artifact-output/__tests__/guarded-spawn.test.ts` — TC-002/057/058 の unit test
- `src/core/snapshot/__tests__/collect.test.ts` — TC-011/012/013/049/050 の unit test
- `src/core/snapshot/__tests__/compare.test.ts` — TC-015/016/017/018/051 の unit test
- `src/core/snapshot/__tests__/digest.test.ts` — TC-007/008/009/010/046/047/048 の unit test
- `src/util/__tests__/unified-diff.test.ts` — TC-042/043/044/045 の unit test
- `specrunner/changes/gitless-artifact-output/design.md` — D1〜D16 全決定事項
- `specrunner/changes/gitless-artifact-output/tasks.md` — T-01〜T-12 全タスク
- `specrunner/changes/gitless-artifact-output/test-cases.md` — TC-001〜TC-080（47 テストを直接確認）

## 検証できなかった項目

- `src/core/command/guide.ts` の `artifact-output` topic 追加内容（T-12）— 実装ファイルを直接 Read せず。guide test が topic 件数 10 件と UNSUPPORTED_OPERATIONS 全項目の本文出現を assert しているため、test pass を正本とする
- `README.md` の artifact-output 節（T-12）— 内容を直接 Read せず。TC-039 の unit test が preview 状態と guide 導線の存在を assert しているため、test pass を正本とする
- `docs/artifact-output-profile.md` の実測値・続行判断・次段階 Issue 案（T-12）— 文書の内容を直接確認せず。ファイル存在は diff stat で確認

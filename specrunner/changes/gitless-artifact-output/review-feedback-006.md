# Review Feedback 006 — gitless-artifact-output (iteration 6)

## Summary

Iteration 6 introduces the complete artifact-output profile implementation: snapshot
collection, diff derivation, materialize, preflight, revision-binding, artifact writer,
orchestrating `runArtifactOutput`, and the supporting CLI guide and architecture gate
tests. The core design and the majority of must-priority test cases are sound. Two
correctness issues were found: one that causes source-mutation events to be silently
absorbed into a "completed" result, and one where `omitted:unreadable` payload writes
fail open instead of fail-closed (TC-022 unimplemented). A third issue—TC-062 (artifact
atomicity) has no direct test coverage—rounds out the findings.

---

## Findings

### F-01 — Source mutation on success path does not cause `runArtifactOutput` to return `failed`

**Severity**: high  
**Resolution**: fixable  
**File**: `src/core/artifact-output/run.ts`  
**Lines**: 420–463

**Defect**

`checkSourceUnchanged` is called on the success path (line 421) *before* `runJson.status`
is set to `"completed"` (line 449). Inside `checkSourceUnchanged` the guard is:

```typescript
if (runJson.status === "completed") runJson.status = "failed";
```

Because `runJson.status` is still `"running"` at call time, the guard never fires. The
function writes `run.json` with `status: "running"` and the error annotation, but then the
caller proceeds to:

```typescript
runJson.status = "completed";   // line 449 — overwrites the error state
runJson.phase = "done";
await writeRunJson(runRoot, runJson);

return { kind: "completed", ... };   // line 454
```

**Result**: when the source directory is mutated during a run, `runArtifactOutput` returns
`{ kind: "completed" }` and `run.json` ends up with `status: "completed"`. The mutation is
recorded only in `runJson.error` as the string `"| source-mutated: <digest>"`.

**TC-006 mask**: the TC-006 test passes because it checks
`runJson.error?.includes("source-mutated")`, not `result.kind !== "completed"` or
`runJson.status === "failed"`. The test is thus weaker than the spec requires:

> spec.md D6: "不一致なら fail-closed で記録する" — the error field records it, but the
> status and return value do not reflect a failure.

**Fix direction**: move the source-unchanged check to *after* `runJson.status =
"completed"` is set (so the guard fires), or change the logic to check `guardResult.kind
!== "unchanged"` directly and return `{ kind: "failed" }` with the mutation reason.

---

### F-02 — `omitted:unreadable` payload copies fail open; TC-022 uncovered

**Severity**: medium  
**Resolution**: fixable  
**File**: `src/core/artifact-output/artifact-writer.ts`  
**Lines**: 193–198

**Defect**

`writePayload` silently swallows any I/O failure when copying candidate bytes for
`omitted:unreadable` entries:

```typescript
try {
  await fs.copyFile(srcPath, dstPath);
} catch {
  // Best-effort: if file doesn't exist in candidate, skip
}
```

The spec requires fail-closed behaviour for entries that can be represented neither in the
patch nor in the payload:

> spec.md § Changes not representable as a text patch: "When an entry can be represented
> neither in the patch nor in the payload, the run MUST fail closed and MUST NOT finalize
> an artifact."

`omitted:unreadable` (non-deletion) is precisely this case: the file content cannot be
included in the text patch (I/O failure during patch build) and — with the current
best-effort copy — it may also be absent from the payload. `finalizeArtifact` then
succeeds, producing an artifact that is missing the content for the affected entry.

**TC-022 missing**: The test case `TC-022: 表現不能な entry がある場合に finalize が失敗する`
(must, integration) has no corresponding test in any of the test files
(`artifact-output-vertical.test.ts`, `run.test.ts`, `patch.test.ts`). The artifact-writer
has no dedicated `__tests__/artifact-writer.test.ts` file.

**Fix direction**:
1. Change `writePayload` to propagate `copyFile` failures (throw) for non-deletion
   entries classified as `omitted:unreadable`.
2. Add a test that injects a readable file into the candidate whose content is removed
   *after* patch classification (simulating the `omitted:unreadable` case at finalize
   time) and verifies that `finalizeArtifact` throws and that `artifact/` is not created.

---

### F-03 — TC-062 (artifact staging-to-final rename atomicity) has no test

**Severity**: low  
**Resolution**: fixable  
**File**: `src/core/artifact-output/artifact-writer.ts`  
**Lines**: 100–155

**Defect**

TC-062 (must, unit) states:

> GIVEN `finalizeArtifact` が `manifest.json` を書いた直後にエラーを投げるよう fake した状況  
> WHEN `finalizeArtifact` を呼ぶ  
> THEN `artifact/` ディレクトリが存在しない

There is no test file for `artifact-writer.ts` (`__tests__/artifact-writer.test.ts` does
not exist). The atomicity property (writes to `artifact.staging/`, then renames to
`artifact/`; if any write fails, `artifact/` is never created) is correct in the
implementation but is untested. The other integration tests (TC-024 in the vertical test)
cover a scenario where the entire finalize fails, but do not exercise a mid-write failure
scenario as specified by TC-062.

**Fix direction**: Add `src/core/artifact-output/__tests__/artifact-writer.test.ts` with at
least the TC-062 scenario: inject a fake `writeFile`/`rename` that throws after
`manifest.json` is written and assert that `artifactDir` does not exist afterward.

---

## Evidence

| TC | Priority | Category | Status | Note |
|----|----------|----------|--------|------|
| TC-001 | must | integration | covered | vertical test, spawn recorder |
| TC-002 | must | unit | covered | guarded-spawn.test.ts |
| TC-003 | should | integration | covered | vertical test |
| TC-004 | must | integration | covered | vertical test |
| TC-005 | must | integration | covered | vertical test |
| TC-006 | must | integration | **partial** | error text checked, return kind / status not asserted (F-01) |
| TC-007 | must | unit | covered | snapshot/digest.test.ts |
| TC-008 | must | unit | covered | snapshot/digest.test.ts |
| TC-009 | should | unit | covered | snapshot/digest.test.ts |
| TC-010 | should | unit | covered | snapshot/digest.test.ts |
| TC-011 | must | unit | covered | snapshot/collect.test.ts |
| TC-012 | must | unit | covered | snapshot/collect.test.ts |
| TC-013 | must | unit | covered | snapshot/collect.test.ts |
| TC-014 | must | unit | covered | snapshot/compare.test.ts |
| TC-015 | must | unit | covered | snapshot/compare.test.ts |
| TC-016 | must | unit | covered | snapshot/compare.test.ts |
| TC-017 | should | unit | covered | snapshot/compare.test.ts |
| TC-018 | should | unit | covered | snapshot/compare.test.ts |
| TC-019 | must | integration | covered | patch.test.ts + vertical |
| TC-020 | should | integration | covered | manifest + context |
| TC-021 | must | integration | covered | patch.test.ts |
| TC-022 | must | integration | **missing** | no test; writePayload fails open (F-02) |
| TC-023 | must | integration | covered | vertical test |
| TC-024 | must | integration | covered | vertical test |
| TC-025 | must | integration | covered | vertical test APPLY.md check |
| TC-026 | must | integration | covered | vertical test manifest/verify/review digest equality |
| TC-027 | must | integration | covered | vertical test drift seam |
| TC-028 | must | unit | covered | preflight.test.ts |
| TC-029 | must | unit | covered | preflight.test.ts + run.test.ts |
| TC-030 | must | unit | covered | preflight.test.ts assertEntryRouteSupported |
| TC-031 | must | unit | covered | preflight.test.ts |
| TC-032 | must | integration | covered | vertical test run.json resume field |
| TC-033 | must | integration | covered | vertical test halted status |
| TC-034 | must | integration | covered | baseline at runRoot/baseline/, not candidateDir |
| TC-035 | must | unit | covered | context-binding.test.ts |
| TC-036 | must | unit | covered | context-binding.test.ts |
| TC-037 | must | unit | covered | guide.test.ts unsupported ops |
| TC-038 | must | unit | covered | guide.test.ts --no-worktree distinction |
| TC-039 | must | unit | covered | guide.test.ts README section |
| TC-040 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-041 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-042 | must | unit | covered | unified-diff.test.ts classifyContent |
| TC-043 | should | unit | covered | unified-diff.test.ts edge cases |
| TC-044 | must | gate | covered | unified-diff.test.ts import assertion |
| TC-045 | should | unit | covered | unified-diff.test.ts + parseUnifiedDiffChangedLines |
| TC-046 | should | unit | covered | digest.test.ts |
| TC-047 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-048 | must | unit | covered | digest.test.ts |
| TC-049 | must | unit | covered | collect.test.ts |
| TC-050 | should | unit | covered | collect.test.ts |
| TC-051 | must | unit | covered | compare.test.ts |
| TC-052 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-053 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-054 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-055 | must | unit | covered | materialize.test.ts |
| TC-056 | must | unit | covered | materialize.test.ts symlink |
| TC-057 | should | unit | covered | guarded-spawn.test.ts |
| TC-058 | could | unit | covered | guarded-spawn.test.ts |
| TC-059 | should | unit | covered | patch.test.ts |
| TC-060 | should | unit | covered | patch.test.ts |
| TC-061 | must | unit | covered | artifact-writer.ts APPLY.md inline + vertical test |
| TC-062 | must | unit | **missing** | no artifact-writer.test.ts; no mid-write failure scenario (F-03) |
| TC-063 | must | unit | covered | context-binding.test.ts |
| TC-064 | must | unit | covered | context-binding.test.ts |
| TC-065 | must | unit | covered | run.test.ts + vertical test |
| TC-066 | must | unit | covered | run.test.ts never-throws |
| TC-067 | should | integration | covered | vertical test 1000-file |
| TC-068 | must | integration | covered | vertical test spawn recorder |
| TC-069 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-070 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-071 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-072 | must | gate | covered | artifact-output-git-free.test.ts |
| TC-073 | must | integration | covered | run.test.ts + vertical test |
| TC-074 | must | unit | covered | guide.test.ts |
| TC-075 | must | unit | covered | guide.test.ts |
| TC-076 | should | manual | not reviewed | manual check not in scope |
| TC-077 | must | integration | covered | run.test.ts TC-079 review-mutation |
| TC-078 | must | integration | covered | vertical test escape symlink |
| TC-079 | must | integration | covered | run.test.ts cross-phase mismatch |
| TC-080 | must | unit | covered | patch.test.ts omitted:size-deletion |

**Checked**: 79 automated TCs examined  
**Fully covered**: 75  
**Partially covered / defective**: 2 (TC-006, TC-062)  
**Missing test**: 2 (TC-022, TC-062)  
**Skipped**: 1 (TC-076 manual)

---

## 検証した項目

- `src/core/artifact-output/run.ts` — 全フェーズのオーケストレーション、success/failure/halt パス、`checkSourceUnchanged` の呼び出し順序と status ガードを精査
- `src/core/artifact-output/artifact-writer.ts` — `finalizeArtifact`、`writePayload`、`buildApplyMd` の実装を確認
- `src/core/artifact-output/revision-binding.ts` — pre/post snapshot による drift 検出ロジックを確認
- `src/core/artifact-output/preflight.ts` / `execution-profile.ts` — capabilityテーブル、unsupported 操作列挙を確認
- `src/core/artifact-output/context.ts` — history セクションの非空文字表現を確認
- `src/core/artifact-output/patch.ts` — 全分類 (`included` / `omitted:binary` / `omitted:size` / `omitted:size-deletion` / `omitted:unreadable` / `not-applicable`) のロジックを確認
- `src/core/artifact-output/source-guard.ts` — fail-closed な unverifiable 処理を確認
- `src/core/artifact-output/materialize.ts` / `guarded-spawn.ts` / `run-layout.ts` — 各補助モジュールを確認
- `src/core/snapshot/collect.ts` / `compare.ts` / `digest.ts` / `types.ts` — snapshot 収集・比較・digest 計算の実装を確認
- `src/util/unified-diff.ts` — zero-import leaf ユーティリティを確認
- `tests/artifact-output-vertical.test.ts` — TC-001, TC-003〜006, TC-023〜024, TC-027, TC-032〜033, TC-065, TC-067〜068, TC-073, TC-078 の実装と網羅性を確認
- `src/core/artifact-output/__tests__/run.test.ts` — TC-065, TC-066, TC-073, TC-079 を確認
- `src/core/artifact-output/__tests__/context-binding.test.ts` — TC-035, TC-036, TC-063, TC-064 を確認
- `src/core/artifact-output/__tests__/preflight.test.ts` — TC-028〜031, TC-053〜054 を確認
- `src/core/artifact-output/__tests__/patch.test.ts` — TC-059〜060, TC-080 を確認
- `src/core/artifact-output/__tests__/materialize.test.ts` — TC-055〜056 を確認
- `src/core/artifact-output/__tests__/guarded-spawn.test.ts` — TC-002, TC-057〜058 を確認
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-040〜041, TC-047, TC-052〜054, TC-066, TC-069〜072 の gate テストを確認
- `src/core/snapshot/__tests__/` — TC-007〜018, TC-046〜051 を確認
- `src/util/__tests__/unified-diff.test.ts` — TC-042〜045 を確認
- `src/core/command/__tests__/guide.test.ts` — TC-037〜039, TC-074〜075 を確認
- `specrunner/changes/gitless-artifact-output/test-cases.md` — 全 80 TC の定義を照合

---

## 検証できなかった項目

- **TC-076 (manual)** — `docs/artifact-output-profile.md` の必須セクション有無は manual チェック対象のため本レビューでは対象外
- **F-01 の再現性** — source 変更時の run.ts 成功パスにおける status 上書きは静的コード読解で確認済みだが、run 環境での実際の返り値を直接実行して確認はしていない（テストが存在しないため）
- **F-02 の再現性** — `writePayload` の best-effort 動作は実際のディスクエラーシミュレーションではなくコードリーディングで確認（TC-022 テストなし）
- **F-03 の再現性** — artifact.staging の mid-write 失敗シナリオはコード上の atomicity 設計を確認したが、テストが存在しないため実行での確認はなし

# Review Feedback — gitless-artifact-output — iter 4

## Scope

- Branch: `feat/gitless-artifact-output-24a45cdc`
- Reviewed: implementation files, unit/integration tests, design.md (operator-patched), test-cases.md
- Resume context: iter 3 had 9 findings (F-01 through F-09). F-03 was resolved by operator-apply commit 9741d862 (design.md D8 table). Remaining 8 findings (F-01/F-02/F-04–F-09) were assigned to code-fixer for this iteration.

---

## Summary of findings

| # | Severity | File | Title | Resolution |
|---|----------|------|-------|------------|
| F-01 | high | `src/core/artifact-output/patch.ts` | Large text deletion still emits `omitted:unreadable`, not `omitted:size-deletion` (carry-over iter 3 F-01) | fixable |
| F-02 | high | `src/core/artifact-output/patch.ts` | `PatchClassification` type still missing `"omitted:size-deletion"` (carry-over iter 3 F-02) | fixable |
| F-03 | high | `src/core/artifact-output/__tests__/patch.test.ts` | No test for large text deletion → `omitted:size-deletion` (TC-080, carry-over iter 3 F-04) | fixable |
| F-04 | medium | `src/core/artifact-output/patch.ts` | Unreachable duplicate binary check in deleted branch (carry-over iter 3 F-05) | fixable |
| F-05 | medium | `tests/artifact-output-vertical.test.ts` | `_assertNoGitAbove` defined but never called — T-10 AC broken (carry-over iter 3 F-06) | fixable |
| F-06 | medium | `README.md` | CLI example shows unwired `--profile`/`--source-root`/`--run-parent-dir` without "preview / not yet wired" notice (carry-over iter 3 F-07) | fixable |
| F-07 | medium | `tests/artifact-output-vertical.test.ts` | TC-027 (verification-time candidate drift → revision-drift halt) absent as integration test (carry-over iter 3 F-08) | fixable |
| F-08 | medium | `tests/unit/architecture/artifact-output-git-free.test.ts` | TC-071 reverse-import gate and TC-072 RUN_JOB_FLAGS gate absent; existing blocks cover a different concern (carry-over iter 3 F-09) | fixable |

---

## Detailed findings

### F-01 — Large text deletion still emits `omitted:unreadable` (high, fixable)

**File**: `src/core/artifact-output/patch.ts:130–134`

**Description**: The operator-apply commit (9741d862) added `omitted:size-deletion` to design.md D8 to mean exactly "deleted text file whose baseline bytes exceed the size limit." The code-fixer was explicitly required to change the large-deletion branch from `omitted:unreadable` to `omitted:size-deletion`. The current code at lines 130–134 is unchanged:

```typescript
if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
  // ... comment referencing D8 ...
  return { path, classification: "omitted:unreadable", diffContribution: "" };
}
```

The inline comment even acknowledges D8 and says "Use omitted:unreadable to signal the deletion is unrepresentable rather than omitted:size (wrong change kind per D8)" — but this reasoning was explicitly superseded by the operator decision which added `omitted:size-deletion` precisely for this case. Emitting `"omitted:unreadable"` for a large text deletion is now a contractual violation: D8 says `omitted:unreadable` is reserved for I/O failures.

**Fix**: Change line 134 to `{ path, classification: "omitted:size-deletion", diffContribution: "" }`. Update the inline comment to reference D8 symmetry.

---

### F-02 — `PatchClassification` type missing `"omitted:size-deletion"` (high, fixable)

**File**: `src/core/artifact-output/patch.ts:25–32`

**Description**: The `PatchClassification` union type (lines 25–32) still does not include `"omitted:size-deletion"`:

```typescript
export type PatchClassification =
  | "included"
  | "included:deletion"
  | "omitted:binary"
  | "omitted:binary-deletion"
  | "omitted:size"
  | "omitted:unreadable"
  | "not-applicable";
```

After F-01 is fixed, the code will emit `"omitted:size-deletion"` but the TypeScript type does not allow it, producing a type error. This was explicitly identified in iter 3 and remains unaddressed.

**Fix**: Add `| "omitted:size-deletion"` to the union. Keep `"omitted:unreadable"` for I/O-failure cases (per D8).

---

### F-03 — No test for large text deletion → `omitted:size-deletion` (TC-080) (high, fixable)

**File**: `src/core/artifact-output/__tests__/patch.test.ts`

**Description**: `test-cases.md` TC-080 (priority: must) requires a unit test for size-limit-exceeded text deletion classified as `omitted:size-deletion`. The test file has no such case. TC-062 covers the `change=modified` large-file case only; no case covers `change=deleted` with a large text baseline.

**Fix**: Add a test case, e.g.:

```typescript
it("large text deletion is classified as omitted:size-deletion", async () => {
  const changes: readonly ChangeEntry[] = [
    { path: "big-deleted.txt", change: "deleted", previousKind: "file" },
  ];
  const largeContent = new Uint8Array(PATCH_MAX_FILE_SIZE_BYTES + 1).fill(0x41);
  const fileMap = new Map<string, Uint8Array | null>();
  fileMap.set("/base/big-deleted.txt", largeContent);
  fileMap.set("/cand/big-deleted.txt", null);
  const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
  const entry = result.entries.find((e) => e.path === "big-deleted.txt");
  expect(entry?.classification).toBe("omitted:size-deletion");
  expect(result.patchText).not.toContain("big-deleted.txt");
});
```

---

### F-04 — Unreachable duplicate binary check in `patch.ts` (medium, fixable)

**File**: `src/core/artifact-output/patch.ts:137–139`

**Description**: In the `changeKind === "deleted"` branch, `classifyContent(bytes) === "binary"` is checked at line 126 (returns `"omitted:binary-deletion"`) and again identically at lines 137–139. Any binary content already returned at line 128, making lines 137–139 dead code. This was identified in iter 2 (F-01) and iter 3 (F-05) and remains unaddressed.

**Fix**: Remove lines 137–139.

---

### F-05 — `_assertNoGitAbove` defined but never called (medium, fixable)

**File**: `tests/artifact-output-vertical.test.ts:50–71`

**Description**: `_assertNoGitAbove(dir)` is defined (underscore prefix) but is never invoked in any test. T-10 acceptance criterion requires verifying that fixture directories are not inside a git repository. The underscore convention suppresses lint warnings but does not satisfy the test requirement. This was identified in iter 2 (F-02) and iter 3 (F-06) and remains unaddressed.

**Fix**: Call `assertNoGitAbove(sourceDir)` (rename: remove the underscore) in the setup of at least the TC-001 happy-path test.

---

### F-06 — README CLI example shows unwired flags without notice (medium, fixable)

**File**: `README.md:147–153`

**Description**: The README shows `--profile artifact-output`, `--source-root`, and `--run-parent-dir` in a code block example. None of these flags are wired in `src/cli/flag-parser.ts`. Design D2 explicitly defers CLI wiring to a follow-on issue. The Constraints section added below does not mention that these flags are not yet wired in the CLI parser. This was identified in iter 2 (F-03) and iter 3 (F-07) and remains unaddressed.

**Fix**: Add a note immediately before or after the code block, e.g.:

> **Note**: `--profile`, `--source-root`, and `--run-parent-dir` define the intended CLI interface; CLI wiring is deferred to the next-stage issue. The `artifact-output` profile is currently invoked programmatically via `runArtifactOutput()`.

---

### F-07 — TC-027 integration test absent (medium, fixable)

**File**: `tests/artifact-output-vertical.test.ts`

**Description**: `test-cases.md` TC-027 (priority: must) requires an integration test exercising `runArtifactOutput` with a `VerifySeam` that modifies the candidate workspace during verification, expecting `result.kind === "halted"` with `revision-drift` outcome. No such test block exists in the vertical test file. A unit-level drift check exists in `context-binding.test.ts` but does not satisfy TC-027's integration-test classification. This was identified in iter 2 (F-04) and iter 3 (F-08) and remains unaddressed.

**Fix**: Add a `describe("TC-027: ...")` block to the vertical test file.

---

### F-08 — TC-071 and TC-072 gates cover wrong concern (medium, fixable)

**File**: `tests/unit/architecture/artifact-output-git-free.test.ts:251–290`

**Description**: `test-cases.md` specifies:

- **TC-071** (must): "既存の runtime / pipeline / step ディレクトリが新規モジュールを import しない" — i.e., `src/core/runtime`, `src/core/pipeline`, `src/core/step` must not import `core/artifact-output` or `core/snapshot`.
- **TC-072** (must): "RUN_JOB_FLAGS が本 change の前後で不変である" — i.e., the CLI command registry did not gain a `--source` flag.

The current TC-071 describe block (lines 253–274) tests that `guarded-spawn.ts` itself does not call `git` — a different concern (covered by TC-040/TC-068). The TC-072 describe block (lines 278–290) tests that the guarded-spawn test file exists — also a different concern. Neither required gate is present. This was identified in iter 2 (F-05) and iter 3 (F-09) and remains unaddressed.

**Fix**: Append or replace with the required gate tests (reverse-import grep over `src/core/runtime`, `src/core/pipeline`, `src/core/step`; and RUN_JOB_FLAGS check over the CLI command registry).

---

## Status of iter 3 findings

| Iter 3 # | Status | Notes |
|----------|--------|-------|
| F-01 | **Open** | Unchanged: large text deletion still emits `omitted:unreadable` |
| F-02 | **Open** | Unchanged: `PatchClassification` type missing `omitted:size-deletion` |
| F-03 | **Resolved** | Fixed by operator-apply commit 9741d862 (design.md D8 table) |
| F-04 | **Open** | Unchanged: no TC-080 unit test |
| F-05 | **Open** | Unchanged: duplicate binary check at lines 137–139 |
| F-06 | **Open** | Unchanged: `_assertNoGitAbove` never called |
| F-07 | **Open** | Unchanged: README has no "preview / not yet wired" notice |
| F-08 | **Open** | Unchanged: no TC-027 drift integration test |
| F-09 | **Open** | Unchanged: TC-071/TC-072 blocks cover wrong concern |

---

## Evidence

- **Checked**: 8 files (patch.ts, patch.test.ts, artifact-output-vertical.test.ts, artifact-output-git-free.test.ts, README.md, design.md D8 table, test-cases.md TC-071/TC-072/TC-027/TC-080)
- **Skipped**: 0
- **Unverified**: 0

The code-fixer in this iteration did not apply any changes. All 8 remaining findings from iter 3 (after operator resolved F-03) are still open. The architecture, core algorithm, and operator-patched design remain sound. All findings are addressable in the next code-fixer pass.

---

## 検証した項目

- `src/core/artifact-output/patch.ts` — `PatchClassification` 型定義（lines 25–32）、`changeKind === "deleted"` ブランチの size 上限分岐（lines 130–134）、重複 binary チェック（lines 137–139）
- `src/core/artifact-output/__tests__/patch.test.ts` — TC-062 全ケース（change=modified のみ）、TC-080 相当テストの欠如確認
- `specrunner/changes/gitless-artifact-output/design.md` — D8 テーブル（lines 156–166）、`omitted:size-deletion` / `omitted:unreadable` 行の存在確認（operator-apply 済）
- `specrunner/changes/gitless-artifact-output/test-cases.md` — TC-027（priority: must）、TC-071（priority: must）、TC-072（priority: must）、TC-080（priority: must）の要件確認
- `tests/artifact-output-vertical.test.ts` — `_assertNoGitAbove` 定義（line 50）、TC-027 describe ブロックの欠如確認
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-071 describe（lines 253–274）、TC-072 describe（lines 278–290）の内容と test-cases.md 要件の乖離確認
- `README.md` — lines 147–153 の CLI 例と lines 168–171 の Constraints セクション（"preview" 注記欠如確認）

---

## 検証できなかった項目

- **テスト実行結果の直接確認**: ローカルでの `bun test` / `bun run typecheck` 実行は行っていない。iter 1 の verification 結果（全グリーン）を権威ある結果として採用し、iter 4 での再実行は行っていない。
- **`src/core/artifact-output/artifact-writer.ts` の payload 分類との整合性**: `omitted:size-deletion` が追加された場合に artifact-writer.ts が payload 収録対象から除外するかどうかの確認は、本イテレーションでは変更がないため照合していない（次イテレーションの code-fixer が `omitted:size-deletion` を実装する際に合わせて確認が必要）。
- **`docs/artifact-output-profile.md` の分類列挙**: TC-076（manual）分類のため、APPLY.md および docs/ の分類一覧との同期状況は手動確認対象外とした。

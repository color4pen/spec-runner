# Review Feedback — gitless-artifact-output — iter 3

## Scope

- Branch: `feat/gitless-artifact-output-24a45cdc`
- Reviewed: implementation files, unit/integration tests, design.md, test-cases.md
- Operator decision (iter 2 escalation): add `omitted:size-deletion` to D8; update `patch.ts`, type definition, tests, and design table accordingly; add `omitted:unreadable` to D8 table

---

## Summary of findings

| # | Severity | File | Title | Resolution |
|---|----------|------|-------|------------|
| F-01 | high | `src/core/artifact-output/patch.ts` | Operator decision not applied — large text deletion still emits `omitted:unreadable`, not `omitted:size-deletion` | fixable |
| F-02 | high | `src/core/artifact-output/patch.ts` | `PatchClassification` type missing `"omitted:size-deletion"` | fixable |
| F-03 | high | `specrunner/changes/gitless-artifact-output/design.md` | D8 table missing `omitted:size-deletion` and `omitted:unreadable` rows | fixable |
| F-04 | high | `src/core/artifact-output/__tests__/patch.test.ts` | No test covering large text deletion → `omitted:size-deletion` | fixable |
| F-05 | medium | `src/core/artifact-output/patch.ts` | Unreachable duplicate binary check in deleted-file branch (carried from iter 2 F-01) | fixable |
| F-06 | medium | `tests/artifact-output-vertical.test.ts` | `_assertNoGitAbove` defined but never called — T-10 AC broken (carried from iter 2 F-02) | fixable |
| F-07 | medium | `README.md` | CLI example shows unwired `--source-root` / `--run-parent-dir` flags without "preview / not yet wired" notice (carried from iter 2 F-03) | fixable |
| F-08 | medium | `tests/artifact-output-vertical.test.ts` | TC-027 (verification-time candidate drift → run halts) not implemented as integration test (carried from iter 2 F-04) | fixable |
| F-09 | medium | `tests/unit/architecture/artifact-output-git-free.test.ts` | TC-071 reverse-import check and TC-072 RUN_JOB_FLAGS gate absent; existing tests with those IDs cover a different concern (carried from iter 2 F-05) | fixable |

---

## Detailed findings

### F-01 — Operator decision not applied: large text deletion still `omitted:unreadable` (high, fixable)

**File**: `src/core/artifact-output/patch.ts:130-135`

**Description**: The iter 2 escalation decision explicitly required changing the large text deletion branch to emit `omitted:size-deletion` instead of `omitted:unreadable`. The current code is unchanged:

```typescript
if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
  // ... comment referencing D8 inconsistency ...
  return { path, classification: "omitted:unreadable", diffContribution: "" };
}
```

This still returns `"omitted:unreadable"` for large text deletions. The operator's decision was unambiguous:

> `omitted:size-deletion`（change=deleted かつ kind=file かつ 旧側が UTF-8 text かつ size 上限超過。patch に含めない。payload なし）を追加する。

**Fix**: Change line 134 to return `{ path, classification: "omitted:size-deletion", diffContribution: "" }`.

---

### F-02 — `PatchClassification` type missing `"omitted:size-deletion"` (high, fixable)

**File**: `src/core/artifact-output/patch.ts:25-32`

**Description**: The `PatchClassification` union type does not include `"omitted:size-deletion"`:

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

After F-01 is fixed, the code will emit `"omitted:size-deletion"` but it is not a valid member of the union, producing a TypeScript type error. The type must be updated before F-01's fix can typecheck.

**Fix**: Add `"omitted:size-deletion"` to the union. Also note that if `omitted:unreadable` is retained for I/O-failure cases (per D8 table update), it should remain in the type — both values are needed.

---

### F-03 — D8 table missing `omitted:size-deletion` and `omitted:unreadable` rows (high, fixable)

**File**: `specrunner/changes/gitless-artifact-output/design.md` (§D8 table, lines 156–164)

**Description**: The operator's decision required updating the D8 table to add:
1. `omitted:size-deletion` — `change=deleted` かつ `kind=file` かつ 旧側が UTF-8 text かつ size 上限超過。`changes.patch` に含めない。payload なし。
2. `omitted:unreadable` — readFile 失敗時（added/modified/deleted 共通）。fail-closed のため patch に含めず、payload 収録も保証しない。

Neither row is present in the current D8 table. The code emits `"omitted:unreadable"` for I/O failures, but this classification value has no definition in the spec. As the operator stated: "コードが emit しうる全分類値が D8 表に定義されている状態にする。"

The D8 rationale section should also be updated with one sentence noting the symmetric size classification (`omitted:size` for added/modified, `omitted:size-deletion` for deleted) mirrors the binary pair.

**Fix**: Add both rows to the D8 table. Also sync `test-cases.md` (add a TC for `omitted:size-deletion`) and `APPLY.md` (classification listing).

---

### F-04 — No test for large text deletion → `omitted:size-deletion` (high, fixable)

**File**: `src/core/artifact-output/__tests__/patch.test.ts`

**Description**: The operator's decision required: "上記の分類ごとにテストを追加・更新する（large text deletion → size-deletion、binary deletion → binary-deletion、通常 text deletion → included:deletion）."

The existing tests cover:
- binary deletion → `omitted:binary-deletion` ✅ (TC-060, line 117)
- text deletion → `included:deletion` ✅ (TC-061, line 135)

But there is no test for **large text deletion → `omitted:size-deletion`**. The current TC-062 tests size limits only for added/modified files (change=modified), not for deleted files.

**Fix**: Add a test case in TC-061 or a new TC-062 sub-group for:

```typescript
it("large text deletion is classified as omitted:size-deletion", async () => {
  const changes: readonly ChangeEntry[] = [
    { path: "big-deleted.txt", change: "deleted", previousKind: "file" },
  ];
  const largeContent = new Uint8Array(PATCH_MAX_FILE_SIZE_BYTES + 1).fill(0x41); // text, no NUL
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

### F-05 — Unreachable duplicate binary check in `patch.ts` (medium, fixable)

**File**: `src/core/artifact-output/patch.ts:137-139`

**Description**: Carried from iter 2 F-01. In the `changeKind === "deleted"` branch, `classifyContent(bytes) === "binary"` is checked at line 126 (returns `"omitted:binary-deletion"`) and again identically at line 137. The second check is unreachable dead code because any binary content already returned at line 128.

After the size check returns `omitted:size-deletion` for large text (F-01 fix), the sequence will be:
1. I/O failure → `omitted:unreadable`
2. Binary → `omitted:binary-deletion`
3. Large text → `omitted:size-deletion`
4. Text → `included:deletion`

Remove lines 137-139.

---

### F-06 — `_assertNoGitAbove` defined but never called (medium, fixable)

**File**: `tests/artifact-output-vertical.test.ts:50-71`

**Description**: Carried from iter 2 F-02. The function `_assertNoGitAbove(dir)` is defined (with underscore prefix indicating intentional non-use) but is never invoked in any test. T-10 AC explicitly requires verifying that fixture directories are not inside a git repository. The underscore convention suppresses lint warnings but does not fulfil the test requirement.

**Fix**: Call `_assertNoGitAbove(sourceDir)` inside the test setup of at least the primary happy-path test (TC-001), and rename the function to `assertNoGitAbove` (remove the underscore).

---

### F-07 — README CLI example shows unwired flags without "preview" notice (medium, fixable)

**File**: `README.md:147-153`

**Description**: Carried from iter 2 F-03. The README shows:

```bash
specrunner job start my-request.md \
  --profile artifact-output \
  --pipeline design-only \
  --source-root /path/to/source \
  --run-parent-dir /path/to/output
```

Neither `--profile artifact-output`, `--source-root`, nor `--run-parent-dir` are wired in the CLI flag-parser (`src/cli/flag-parser.ts`). Design D2 explicitly defers CLI surface to a follow-on issue ("CLI 配線（surface は設計するが実装は次段階 Issue）"). Showing unwired flags as usable commands without qualification is misleading to operators.

**Fix**: Add a notice immediately before or after the code block, e.g.:

> **Note**: `--profile`, `--source-root`, and `--run-parent-dir` are specified here as the intended interface; CLI wiring is deferred to the next-stage issue. The artifact-output profile is currently invoked programmatically via `runArtifactOutput()`.

---

### F-08 — TC-027 verification-time candidate drift test missing (medium, fixable)

**File**: `tests/artifact-output-vertical.test.ts`

**Description**: Carried from iter 2 F-04. `test-cases.md` TC-027 (priority: must) requires:

> **GIVEN** verification seam がスナップショット後に candidate workspace を変更する fake を注入  
> **WHEN** `runArtifactOutput` を呼ぶ  
> **THEN** run が `revision-drift` outcome で halt する

The vertical test has no such scenario. A drift test is available in `__tests__/context-binding.test.ts` at the unit level, but test-cases.md TC-027 is classified as an integration test and requires end-to-end exercising via `runArtifactOutput`.

**Fix**: Add a `describe("TC-027: ...")` block to the vertical test using a `VerifySeam` that modifies a file in `candidateRoot` during execution, then asserts `result.kind === "halted"`.

---

### F-09 — TC-071 reverse-import and TC-072 RUN_JOB_FLAGS gates absent (medium, fixable)

**File**: `tests/unit/architecture/artifact-output-git-free.test.ts`

**Description**: Carried from iter 2 F-05. `test-cases.md` specifies:

- **TC-071** (must): "既存の runtime / pipeline / step ディレクトリが新規モジュールを import しない"
- **TC-072** (must): "RUN_JOB_FLAGS が本 change の前後で不変である"

The test file has `describe("TC-071: ...")` and `describe("TC-072: ...")` blocks, but these cover guarded-spawn behaviour (that guarded-spawn.ts itself doesn't call git) — a different concern from what TC-071 and TC-072 in test-cases.md require. The required gate tests are absent.

**Fix**: Add (or append to existing TC-071/TC-072 describe blocks):

```typescript
// TC-071: existing runtime/pipeline/step do not import artifact-output/snapshot
describe("TC-071 (reverse-import): existing runtime/pipeline/step do not import artifact-output", () => {
  const dirsToCheck = ["src/core/runtime", "src/core/pipeline", "src/core/step"];
  for (const dir of dirsToCheck) {
    it(`${dir} does not import core/artifact-output`, () => {
      const files = glob(path.join(ROOT, dir, "**/*.ts"));
      for (const f of files) {
        const src = fs.readFileSync(f, "utf-8");
        expect(src).not.toContain("core/artifact-output");
        expect(src).not.toContain("core/snapshot");
      }
    });
  }
});

// TC-072: RUN_JOB_FLAGS unchanged — no --source flag added
describe("TC-072 (RUN_JOB_FLAGS): command registry did not gain --source flag", () => {
  it("RUN_JOB_FLAGS does not contain 'source'", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/cli/command-registry.ts"), "utf-8");
    expect(src).not.toMatch(/["']source["']/);
  });
});
```

---

## Evidence

- **Checked**: 14 files (patch.ts, patch.test.ts, design.md D8, test-cases.md, vertical test, artifact-output-git-free.test.ts, guide.ts, README.md, PatchClassification type, execution-profile.ts, context-binding.test.ts)
- **Skipped**: 0
- **Unverified**: 0

Operator's decision (iter 2 escalation) was not applied in the code-fixer step. None of the four required changes (type definition, runtime classification, D8 spec table, new test) were implemented. All iter 2 medium findings (F-01 through F-05) also remain open. The core algorithm and architecture remain sound; all findings are classification/documentation/test gaps addressable in the next code-fixer pass.

---

## 検証した項目

**コア実装**
- `src/core/artifact-output/patch.ts` — `PatchClassification` 型定義（lines 25-32）、削除ブランチの分類ロジック（lines 116-145）、重複 binary チェック（lines 137-139）、`PATCH_MAX_FILE_SIZE_BYTES` 定数
- `src/core/artifact-output/__tests__/patch.test.ts` — TC-059〜TC-062 の全テストケース、large text deletion → `omitted:size-deletion` テストの欠如確認
- `specrunner/changes/gitless-artifact-output/design.md` — §D8 テーブル（lines 156-164）、`omitted:size-deletion` / `omitted:unreadable` 行の欠如確認
- `specrunner/changes/gitless-artifact-output/test-cases.md` — TC-027（verification-time drift）、TC-059（omitted:size）、TC-071/TC-072 の分類と優先度
- `tests/artifact-output-vertical.test.ts` — `_assertNoGitAbove` 定義（lines 50-71）と未呼び出しの確認、TC-027 の欠如確認
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-071（guarded-spawn 自体の git 非呼び出し）、TC-072（guarded-spawn テストの git ブロック確認）の内容と、test-cases.md が要求する内容との乖離確認
- `src/core/command/guide.ts` — artifact-output トピック（lines 573-648）の内容確認
- `README.md` — `--source-root` / `--run-parent-dir` フラグの記述（lines 147-153）と preview 表記の欠如確認
- `src/core/artifact-output/execution-profile.ts` — `EXECUTION_PROFILE_IDS`、`PROFILE_CAPABILITIES` テーブル（参照確認）
- `src/core/artifact-output/__tests__/context-binding.test.ts` — ユニットレベル drift 検出テストの存在確認（TC-027 統合テストの代替不可を判定するため）

**オペレーター決定との照合**
- iter 2 escalation decision（`omitted:size-deletion` 追加、D8 対称構造、`omitted:unreadable` D8 定義、テスト追加）の各項目を code-fixer の出力と照合した

---

## 検証できなかった項目

- **テスト実行結果の直接確認**: ローカルでの `bun test` / `bun run typecheck` 実行は行っていない。iter 1 の verification 結果（全グリーン）を権威ある結果として採用し、iter 3 での再実行は行っていない。
- **`src/core/artifact-output/artifact-writer.ts` の payload 分類との整合性**: `omitted:size-deletion` が追加された場合に artifact-writer.ts が payload 収録対象から除外するかどうかの確認は、本イテレーションでは変更がないため照合していない（次イテレーションの code-fixer が `omitted:size-deletion` を実装する際に合わせて確認が必要）。
- **`docs/artifact-output-profile.md` の分類列挙**: TC-076（manual）分類のため、APPLY.md および docs/ の分類一覧との同期状況は手動確認対象外とした。

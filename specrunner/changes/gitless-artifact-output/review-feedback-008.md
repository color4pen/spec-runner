# Code Review — Iteration 8

**Branch**: feat/gitless-artifact-output-24a45cdc  
**Reviewer**: code-review (automated)  
**Basis**: Operator ruling on review-feedback-007 escalation; four mandated changes + two resolved design decisions with follow-on code work.

---

## Summary

Iteration 8 addresses the escalation ruling from iteration 7. All four operator-mandated changes are confirmed absent from the current implementation and must be applied. No new findings have been added beyond the escalation ruling. All previously-approved findings remain resolved.

---

## Mandated Changes (from operator ruling)

### [MEDIUM — Fixable] D1-follow-on: context.ts — verification-time change set wording

**File**: `src/core/artifact-output/context.ts`  
**Lines**: 12–18 (SnapshotContextInput), 68–70 (changedPaths rendering)

**Current behaviour**: When `run.ts` calls `buildSnapshotContext` before change-set derivation (verification phase, line 241–244 of run.ts), it passes `changes: []`. The context block then renders `(no changes)` in the "Changed files" section, which is ambiguous — a verifier cannot tell whether there were no changes or whether the list simply hasn't been computed yet.

**Required change**:

1. Add an explicit discriminant field to `SnapshotContextInput`:

   ```ts
   changeSetState?: "not-yet-derived" | "derived";
   ```

   Default to `"derived"` when omitted (backward-compatible).

2. In `buildSnapshotContext`, when `changeSetState === "not-yet-derived"`, replace the `(no changes)` fallback with the explicit message:

   ```
   (Change set not yet derived at verification time — derived after verification)
   ```

3. In `run.ts`, update the verification-time call (currently `buildSnapshotContext({ baselineDigest, candidateDigest: ..., changes: [] })`) to pass `changeSetState: "not-yet-derived"`.

4. Keep the review-time call as-is (it already passes the derived `changes` array; omit or pass `changeSetState: "derived"`).

5. Add a unit test in `src/core/artifact-output/__tests__/context-binding.test.ts` asserting:
   - When `changeSetState: "not-yet-derived"`, the context block contains the explicit "not yet derived" wording and does **not** contain `(no changes)`.
   - When `changeSetState: "derived"` with an empty array, the block may say `(no changes)`.

---

### [LOW — Fixable] D2-follow-on: digest.ts — computeSymlinkDigest missing 'symlink:' kind-tag prefix

**File**: `src/core/snapshot/digest.ts`  
**Line**: 27–29

**Current behaviour**:

```ts
export function computeSymlinkDigest(target: string): string {
  return "sha256:" + createHash("sha256").update(target, "utf8").digest("hex");
}
```

The hash is a plain SHA-256 of the target string with no kind prefix. Per D3 in the spec, the digest must be reproducible from the canonical text, which specifies a `symlink:` kind-tag prefix to prevent digest collisions with files whose byte content happens to equal a symlink target.

**Required change**:

```ts
export function computeSymlinkDigest(target: string): string {
  return "sha256:" + createHash("sha256").update("symlink:" + target, "utf8").digest("hex");
}
```

No schema-version bump is required (this profile has no persisted snapshots yet; it is an unwired preview).

Update the existing test assertions that call `computeSymlinkDigest` — since no test hard-codes the hex output, updating the source is sufficient. Add one new assertion in `src/core/snapshot/__tests__/digest.test.ts`:

```ts
it("computeSymlinkDigest differs from plain sha256 of the same target string", () => {
  const target = "../target";
  const symDigest = computeSymlinkDigest(target);
  const plainDigest = "sha256:" + createHash("sha256").update(target, "utf8").digest("hex");
  expect(symDigest).not.toBe(plainDigest);
});
```

---

### [MEDIUM — Fixable] checkSourceUnchanged fail-open when writeRunJson throws

**File**: `src/core/artifact-output/run.ts`  
**Lines**: 490–518 (`checkSourceUnchanged`)

**Current behaviour**: If `writeRunJson` throws inside any of the `mutated` or `unverifiable` branches, the exception propagates to the outer `catch` block, which returns `false` (unchanged). This is fail-open: a mutation could be detected but the caller receives `false` and proceeds as if the source were unchanged.

```ts
} catch {
  // best-effort: if the guard itself throws, we cannot update run.json
  return false;   // ← BUG: masks a detected mutation if writeRunJson throws
}
```

**Required change** — implement Option B:

1. Compute the mutation verdict (`mutated: boolean`) first, using a `try/catch` around `assertSourceUnchanged` only.
2. If mutation or unverifiable, update `runJson` in-memory (status + error fields) **before** attempting the write.
3. Attempt `writeRunJson` in a separate best-effort `try/catch`; do **not** let it influence the boolean result.
4. Always return the correct boolean (`mutated`), regardless of whether the write succeeded.
5. A thrown `assertSourceUnchanged` exception also counts as mutated (fail-closed).

Reference implementation shape:

```ts
async function checkSourceUnchanged(
  sourceRoot: string,
  baselineDigest: string,
  collectOpts: { exclusions: readonly string[] },
  runJson: RunJson,
  runRoot: string,
): Promise<boolean> {
  let mutated = false;
  try {
    const guardResult = await assertSourceUnchanged(sourceRoot, baselineDigest, collectOpts);
    if (guardResult.kind === "mutated") {
      mutated = true;
      runJson.error = (runJson.error ?? "") + " | source-mutated: " + guardResult.currentDigest;
      runJson.status = "failed";
    } else if (guardResult.kind === "unverifiable") {
      mutated = true;
      runJson.error = (runJson.error ?? "") + " | source-unverifiable: " + guardResult.reason;
      runJson.status = "failed";
    }
  } catch (err) {
    // assertSourceUnchanged itself threw — treat as mutated (fail-closed)
    mutated = true;
    runJson.error = (runJson.error ?? "") + " | source-guard-exception: " + String(err);
    runJson.status = "failed";
  }

  // Best-effort write — do NOT let this affect the returned boolean
  try {
    await writeRunJson(runRoot, runJson);
  } catch { /* best-effort */ }

  return mutated;
}
```

Add a unit test in `src/core/artifact-output/__tests__/run.test.ts`:
- Set up a source directory and mutate it to trigger detection.
- Use a custom `writeRunJson` seam (or mock `fs.writeFile` to throw) that throws when called for the final `run.json` write.
- Assert that `result.kind === "failed"`.

---

### [LOW — Fixable] ArtifactManifest missing file-level `unsupported` array

**File**: `src/core/artifact-output/manifest.ts`  
**Lines**: 40–67 (ArtifactManifest interface), 115–143 (buildManifest return)

**Current behaviour**: The manifest includes `unsupportedOperations` (the profile-level list of unsupported pipeline operations) but has no per-file `unsupported` array for file-level snapshot failures (D9 'unsupported 配列').

**Required change**:

1. Add to the `ArtifactManifest` interface:

   ```ts
   import type { SnapshotFailure } from "../snapshot/types.js";
   // ...
   unsupported: readonly SnapshotFailure[];
   ```

2. Add a corresponding input field to `BuildManifestInput`:

   ```ts
   unsupported?: readonly SnapshotFailure[];
   ```

3. Emit from `buildManifest`:

   ```ts
   unsupported: input.unsupported ?? [],
   ```

4. Update the `buildManifest` call in `run.ts` (phase 9) to pass `unsupported: []` for now (the vertical integration does not yet surface per-file failures, so an empty array is correct for the initial implementation).

5. Update manifest tests/schema assertions to include `unsupported` in the expected shape.

Keep `unsupportedOperations` unchanged.

---

### [LOW — Fixable] Naming inconsistency: ChangeSetResult kind 'success' vs SnapshotResult kind 'ok'

**File**: `src/core/snapshot/compare.ts`  
**Line**: 36 (ChangeSetResult type definition), 147 (return statement)

**Current behaviour**:

```ts
export type ChangeSetResult =
  | { kind: "success"; changes: readonly ChangeEntry[] }
  | { kind: "unavailable"; reason: string };
```

`SnapshotResult` (in `types.ts`) uses `kind: "ok"`. Using `"success"` for `ChangeSetResult` creates an inconsistency that makes the API harder to reason about and pattern-match.

**Required change** — align to `kind: "ok"`:

```ts
export type ChangeSetResult =
  | { kind: "ok"; changes: readonly ChangeEntry[] }
  | { kind: "unavailable"; reason: string };
```

Update the return statement in `deriveChangeSet`:

```ts
return { kind: "ok", changes };
```

Update all call sites:

1. `src/core/snapshot/__tests__/compare.test.ts` — replace all occurrences of `kind === "success"` / `.toBe("success")` with `"ok"` (approximately 14 occurrences including one comment on line 203 that reads `// Must NOT be { kind: "success", changes: [] }`).

2. `src/core/artifact-output/run.ts` — the only check is `changeSetResult.kind === "unavailable"` (line 292); the `changes` property is accessed on the narrowed type (line 300: `changeSetResult.changes`). After renaming, TypeScript should still narrow correctly; verify the branch compiles cleanly.

3. Any other call sites discovered by `grep -r '"success"' src/core/snapshot/`.

---

## Previously Approved Findings (no change)

All findings from iterations 1–6 that were marked resolved remain resolved. The four items above are the complete set of open work for this iteration.

---

## Test Coverage Assessment

Current test coverage is strong for the implemented portions. The four mandated changes each require new or updated test assertions:

| Change | New test required | Location |
|--------|------------------|----------|
| D1-follow-on (changeSetState) | Yes — wording test for `not-yet-derived` | context-binding.test.ts |
| D2-follow-on (symlink: prefix) | Yes — differs-from-plain-sha256 assertion | digest.test.ts |
| checkSourceUnchanged fail-closed | Yes — writeRunJson-throws scenario | run.test.ts |
| unsupported array | Yes — schema assertion update | manifest test(s) |
| ChangeSetResult kind rename | Update existing | compare.test.ts (14 occurrences) |

---

## Verification Requirement

After applying all five changes, run:

```sh
bun run typecheck
bun run lint
bun run test
```

All must pass green before closing this iteration.

---

## 検証した項目

- `src/core/artifact-output/run.ts` — `checkSourceUnchanged` の制御フローを精査し、`writeRunJson` が throw した場合に外側の catch が `false` を返すことを確認した（fail-open）
- `src/core/artifact-output/context.ts` — `buildSnapshotContext` が `changes: []` のとき `(no changes)` を返すコードパスを確認し、verification 呼び出し元（run.ts 行 241–244）が `changes: []` を渡していることを確認した
- `src/core/snapshot/digest.ts` — `computeSymlinkDigest` がベアのターゲット文字列をハッシュしており、`'symlink:'` プレフィックスが存在しないことを確認した
- `src/core/artifact-output/manifest.ts` — `ArtifactManifest` インターフェースに `unsupported` フィールドが存在しないことを確認した
- `src/core/snapshot/compare.ts` — `ChangeSetResult` の success variant が `kind: "success"` を使用し、`SnapshotResult` の `kind: "ok"` と不一致であることを確認した
- `src/core/snapshot/__tests__/compare.test.ts` — `result.kind === "success"` を期待するテストが約 14 箇所あることを確認した（rename 後に更新が必要）
- `tests/artifact-output-vertical.test.ts` — `ChangeSetResult.kind` を直接チェックしていないことを確認した（rename の影響なし）
- `specrunner/changes/gitless-artifact-output/design.md` — D14 の known-constraint bullet が commit 5da39ac7 で追加済みであることを確認した（本イテレーションでの編集不要）

## 検証できなかった項目

- `writeRunJson` が throw した場合の `checkSourceUnchanged` の実際の動作（単体テストがなく、実行環境での I/O エラー注入が必要なため）
- `computeSymlinkDigest` の kind-tag 欠落が実際のスナップショット比較でコリジョンを引き起こすかどうか（プロファイルが unwired preview であり、本番スナップショットが存在しないため）
- manifest の `unsupported` フィールド欠落が呼び出し側の挙動に影響するかどうか（現状の呼び出し側コードが当該フィールドを参照していないため）

# Regression Gate Result — Iteration 1

- **verdict**: approved

## Summary

All 6 findings from the review ledger are confirmed fixed. No regressions detected.

---

## Finding Verification

### [HIGH] TC-005・TC-006 未実装：detectSpecrunnerWorktree の直接単体テストがない

- **Status**: FIXED
- **Evidence**: `tests/core/worktree/detection.test.ts` に `describe("detectSpecrunnerWorktree", ...)` ブロックが追加され、TC-005（specrunner-worktrees 配下 → `isSpecrunnerWorktree: true` かつ `mainCheckoutPath` 返却）・TC-006（main checkout → `false`）・TC-007（無関係パス → `false`）・TC-009（存在しないパス → fail-open）の 4 ケースが直接単体テストとして実装されている。`detectSpecrunnerWorktree` は import され、`mainCheckoutPath` の値も `fs.realpath` 経由で検証されている（macOS symlink 対応）。

### [LOW] design D4 からの逸脱：worktreeGuardError を使わず独自文言を inline 出力（finding 1/2）

- **Status**: FIXED
- **Evidence**: `src/core/command/resume.ts:15` で `worktreeGuardError` が `errors.js` から import され、`resume.ts:89` で `const guardErr = worktreeGuardError("job resume", mainPath)` を呼んで `guardErr.message` / `guardErr.hint` を出力している。独自 inline 文言は除去されている。

### [LOW] TC-002（should）未実装：guard-config surface 宣言下で no-breach テストがない

- **Status**: FIXED
- **Evidence**: `tests/unit/core/step/fast-scope-checkpoint.test.ts` に `describe("TC-002: guard-config surface declared — safe changed file does not cause breach", ...)` ブロックが追加され、`makeFastScopeFromConfig()`（4 surfaces を含む）を使いながら `src/core/pipeline/types.ts` と `src/core/command/run.ts` という無関係ファイルを変更ファイルとした場合に `verdict === "approved"` かつ scope findings が 0 件であることを 2 パターンで検証している。

### [LOW] worktreeGuardError not used — inline text deviates from design D4（finding 2/2）

- **Status**: FIXED
- **Evidence**: 上記「design D4 からの逸脱」と同一の修正により解消。`worktreeGuardError` ファクトリが使用されており、CLI dispatch 層との文言統一が達成されている。

### [LOW] TC-002/TC-007/TC-009 (should priority) not yet added

- **Status**: FIXED
- **Evidence**:
  - TC-002: `fast-scope-checkpoint.test.ts` の新規 `describe` ブロックで 2 ケース実装済み。
  - TC-007: `detection.test.ts` の `detectSpecrunnerWorktree` ブロック内に実装済み。
  - TC-009: 同ブロック内に `存在しないパスを cwd として与えると isSpecrunnerWorktree: false を返す（fail-open）` として実装済み。

### [LOW] Comments still say '3 surfaces' after guard-config surface was added (now 4)

- **Status**: FIXED
- **Evidence**:
  - `tests/unit/core/step/fast-scope-checkpoint.test.ts:1-7` — ファイルヘッダコメントが「4 surfaces 評価」に更新済み。
  - `tests/unit/core/step/fast-scope-checkpoint.test.ts:208` — fixture コメントが「4 dogfooding surfaces」に更新済み。
  - `tests/unit/core/pipeline/resolve-scope.test.ts:10` — ファイルヘッダが「4 surfaces」に更新済み。
  - `tests/unit/core/pipeline/resolve-scope.test.ts:354,357` — セクションヘッダと `describe` 文字列が「4 forbidden surfaces」に更新済み。

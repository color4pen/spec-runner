# Regression Gate Result — absorb-test-materialize — Iteration 1

## Verification Summary

9 findings checked. 5 fixed, 4 still present.

---

## Fixed Findings (No Longer Present)

### [LOW] T-02 doc scrub の欠落ファイル — FIXED
- tasks.md lines 23–24 に `src/state/schema/types.ts` と `src/config/schema/types.ts` が追加済み
- 両ファイルとも `test-materialize` 参照なし（grep 確認）

### [LOW] T-10 TC-015a duplicate リスク — FIXED
- tasks.md line 138 の現在文は achieved-assurance.test.ts へのピン追加を指示しており「test-cases.md にも TC-015a として追記する」文言は存在しない
- test-cases.md の TC-015a は line 188 に 1 件のみ（重複なし）

### [MEDIUM] specFixerObservationForward JSDoc の test-materialize 残存 — FIXED
- `src/core/pipeline/spec-observation.ts` に `test-materialize` の参照なし（grep 確認）
- code-fixer により修正済み

### [LOW] testGenRequired JSDoc の test-materialize 残存 — FIXED
- `src/config/type-config.ts` に `test-materialize` の参照なし（grep 確認）
- code-fixer により修正済み

### [LOW] "Currently FAILS because" コメント 6 箇所残存 — FIXED
- `src/` 全体で "Currently FAILS because" の参照なし（grep 確認）
- code-fixer により achieved-assurance-no-base-oid.test.ts / resolve-step-test-materialize-alias.test.ts / gate-no-test-materialize.test.ts の 3 ファイル修正済み

---

## Regressions (Still Present)

### [MEDIUM] diffPathsBetweenCommits が RealRuntimeStrategy に required のまま残存 — REGRESSION
- **File**: `src/core/port/runtime-strategy.ts:868`
- `diffPathsBetweenCommits` が RealRuntimeStrategy に required として残存（line 868）
- LocalRuntime 実装 (local.ts:1036)、ManagedRuntime 実装 (managed.ts:670) も残存
- local.ts の doc comment (line 1029)「Used by the archive floor gate (assurance-provenance-floor) to verify freeze integrity」が stale（archive floor は listChangedFilesBetweenCommits を使う）
- production caller はゼロであることを achieved-assurance.ts (lines 105, 224, 253) のコメントが確認しているが、RealRuntimeStrategy 実装者に dead method の実装を強制し続けている

### [LOW] e2e-gate テストが test-materialize 命名を維持 — REGRESSION
- **File**: `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts:20`
- line 20: コメント「The freeze check (diffPathsBetweenCommits) sees no diff on feature.test.ts between」が stale
- line 64: 変数コメント「// test-materialize commit: feature.test.ts added, impl absent」が残存
- line 117: git commit メッセージ「"test-materialize: add feature test (impl absent → red)"」が残存
- lines 175, 412: `state.steps["test-materialize"]` が残存
- テスト自体は green だが test-materialize 依存の不変条件が文書化されていない

### [LOW] diff-paths-between-commits.test.ts が dead method をテスト — REGRESSION
- **File**: `src/core/runtime/__tests__/diff-paths-between-commits.test.ts:1`
- ファイル全体が `diffPathsBetweenCommits` を直接呼び出すテストのみで構成
- production caller ゼロの dead method が「現役」に見える
- T-10 設計列挙「listChangedFilesBetweenCommits へ書換・paths 引数廃止」が未適用
- list-changed-files-between-commits.test.ts は別途追加済みだが旧テストは未削除・未更新

### [LOW] test-coverage.ts の doc comment が test-materialize を参照 — REGRESSION
- **File**: `src/core/verification/test-coverage.ts:182`
- line 182:「test-materialize output contract (LocalRuntime.validateStepOutputs "test-coverage" branch)」が残存
- line 186:「This is the correct state after test-materialize」が残存
- T-02 の doc scrub 対象外だったため stale のまま

---

## Evidence

- checked: 9
- skipped: 0
- unverified: 0

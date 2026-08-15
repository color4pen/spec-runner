# Regression Gate Result — Iteration 2

## Summary

9 findings verified. 1 still present (misleading tasks.md instruction, no actual code harm). 8 fixed.

## Finding Verification

### F1 [LOW] T-02 の doc scrub 列挙から state/schema/types.ts と config/schema/types.ts が抜けている
- **Status: FIXED**
- tasks.md lines 23–24 に両ファイルが [x] で追加済み。
- `src/state/schema/types.ts` に `test-materialize` の文字列なし（grep 空）。
- `src/config/schema/types.ts` に `test-materialize` の文字列なし（grep 空）。

### F2 [LOW] T-10 の「test-cases.md にも TC-015a として追記する」指示が既存エントリと競合し duplicate リスクがある
- **Status: STILL PRESENT (instruction unchanged)**
- tasks.md line 138 は依然 "TC-015a として...を追加する" と記述しており、説明は更新されていない。
- test-cases.md line 188 に TC-015a は 1 件のみ存在（重複なし）。実際の害は発生していないが、将来の読者が instruction を再実行すると重複のリスクがある。
- 実装は `achieved-assurance-no-base-oid.test.ts` に TC-015a テストを正しく追加済みで、test-cases.md への追記は行われていない。

### F3 [MEDIUM] specFixerObservationForward の JSDoc に test-materialize が残存（T-03 タスク未実行）
- **Status: FIXED**
- `src/core/pipeline/spec-observation.ts` に `test-materialize` の文字列なし（grep 空）。
- モジュール JSDoc、関数 JSDoc（line 57/60 付近）、内部コメント（line 75 付近）すべて更新済み（"directly to implementer" へ変更）。

### F4 [LOW] testGenRequired JSDoc が test-materialize を 2 箇所に列挙したまま
- **Status: FIXED**
- `src/config/type-config.ts` に `test-materialize` の文字列なし（grep 空）。

### F5 [LOW] 新規テストの Currently FAILS because コメントが実装完了後も残存（6 箇所）
- **Status: FIXED**
- `achieved-assurance-no-base-oid.test.ts`、`resolve-step-test-materialize-alias.test.ts`、`gate-no-test-materialize.test.ts` すべてで "Currently FAILS because" なし（grep 空）。
- `src/` 以下全体でも 0 件。

### F6 [MEDIUM] diffPathsBetweenCommits が RealRuntimeStrategy に required のまま残存し archive floor gate のドキュメントが stale
- **Status: FIXED**
- `src/core/port/runtime-strategy.ts` に `diffPathsBetweenCommits` なし。
- `src/core/runtime/local.ts` に `diffPathsBetweenCommits` なし。
- `src/core/runtime/managed.ts` に `diffPathsBetweenCommits` なし。

### F7 [LOW] e2e-gate テストが旧 test-materialize 命名を維持し廃止機構へのコメントが残存
- **Status: FIXED**
- `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` に `test-materialize` なし。
- "diffPathsBetweenCommits sees no diff" コメントなし。
- state.steps["test-materialize"] 参照なし。

### F8 [LOW] diff-paths-between-commits.test.ts が dead method を引き続きテスト
- **Status: FIXED**
- `src/core/runtime/__tests__/diff-paths-between-commits.test.ts` は削除済み（git diff で `deleted file mode` 確認）。

### F9 [LOW] test-coverage.ts の doc comment が削除済みステップ test-materialize を参照
- **Status: FIXED**
- `src/core/verification/test-coverage.ts` line 182 は "implementer output contract" へ更新。
- line 186 は "after implementer materializes tests" へ更新。
- `test-materialize` 文字列なし。

## Evidence

- checked: 9 findings
- skipped: 0
- unverified: 0

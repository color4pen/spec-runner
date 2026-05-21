# Test Cases: require-spawn-injection

## TC-001: `spawn` field は optional でない（型定義）

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 1 / request.md 受け入れ基準

**GIVEN** `src/core/verification/propagate.ts` の `PropagateParams` 型  
**WHEN** `spawn` フィールドの型宣言を確認する  
**THEN** `spawn?: SpawnFn` ではなく `spawn: SpawnFn`（`?` なし）になっている

---

## TC-002: `params.spawn ?? spawnCommand` fallback が削除されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 1 / request.md 受け入れ基準

**GIVEN** `src/core/verification/propagate.ts` の関数本体  
**WHEN** `spawn` 変数の初期化コードを確認する  
**THEN** `const spawn = params.spawn ?? spawnCommand;` ではなく `const spawn = params.spawn;` になっており fallback がない

---

## TC-003: `spawnCommand` の import が削除されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** `src/core/verification/propagate.ts` の import セクション  
**WHEN** ファイルの内容を確認する  
**THEN** `spawnCommand` の import が存在せず、`SpawnFn` 型のみが import されている

---

## TC-004: `CliStepDeps` インターフェースが定義されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 2a / design.md D2

**GIVEN** `src/core/step/types.ts`  
**WHEN** 型定義を確認する  
**THEN** `CliStepDeps extends StepDeps { spawn: SpawnFn }` インターフェースが存在する

---

## TC-005: `CliStep.run` のシグネチャが `CliStepDeps` を受け取る

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 2a / design.md D2

**GIVEN** `src/core/step/types.ts` の `CliStep` インターフェース  
**WHEN** `run` メソッドの引数型を確認する  
**THEN** `run(state: JobState, deps: CliStepDeps): Promise<void>` になっている

---

## TC-006: `PipelineDeps` に `spawn: SpawnFn` が追加されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 2b / design.md D3

**GIVEN** `src/core/types.ts` の `PipelineDeps` インターフェース  
**WHEN** フィールド一覧を確認する  
**THEN** `spawn: SpawnFn`（required）が含まれており、`?` がない

---

## TC-007: `VerificationStep.run` が `CliStepDeps` を受け取る

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 3

**GIVEN** `src/core/step/verification.ts`  
**WHEN** `run` メソッドのシグネチャを確認する  
**THEN** 引数型が `CliStepDeps` になっている

---

## TC-008: `VerificationStep` が `deps.spawn` を `propagateVerificationResult` に渡す

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 3 / request.md 受け入れ基準

**GIVEN** `src/core/step/verification.ts` の `propagateVerificationResult` 呼び出し箇所  
**WHEN** 引数オブジェクトを確認する  
**THEN** `spawn: deps.spawn` が含まれている

---

## TC-009: `LocalRuntimeStrategy.buildDeps` が `spawn: spawnCommand` を返す

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 4a / design.md D4

**GIVEN** `src/core/runtime/local.ts` の `buildDeps()` メソッド  
**WHEN** 返却オブジェクトを確認する  
**THEN** `spawn: spawnCommand` フィールドが含まれている

---

## TC-010: `ManagedRuntimeStrategy.buildDeps` が `spawn: spawnCommand` を返す

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 4b / design.md D4

**GIVEN** `src/core/runtime/managed.ts` の `buildDeps()` メソッド  
**WHEN** 返却オブジェクトを確認する  
**THEN** `spawn: spawnCommand` フィールドが含まれている

---

## TC-011: `bun run typecheck` が green

- **Category**: Build
- **Priority**: must
- **Source**: tasks.md Task 6 / request.md 受け入れ基準

**GIVEN** Tasks 1–5 の変更がすべて適用されたコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-012: `bun run test` が green

- **Category**: Build
- **Priority**: must
- **Source**: tasks.md Task 6 / request.md 受け入れ基準

**GIVEN** Tasks 1–5 の変更がすべて適用されたコードベース  
**WHEN** `bun run test` を実行する  
**THEN** テストがすべて pass し、エラーが 0 件で終了する

---

## TC-013: `bun run test` 実行後に新しい git commit が作られない

- **Category**: Side-effect Isolation
- **Priority**: must
- **Source**: request.md 受け入れ基準（手動 acceptance）

**GIVEN** clean な git working tree（`git status` が clean）の状態  
**WHEN** `bun run test` を実行する  
**THEN** `git log --oneline -1` が示す HEAD commit がテスト前後で変わらない（新規 commit なし）

---

## TC-014: `bun run test` 実行後に git push が発生しない

- **Category**: Side-effect Isolation
- **Priority**: must
- **Source**: request.md 背景・受け入れ基準

**GIVEN** clean な git working tree でテスト実行前後に remote の log を記録しておく  
**WHEN** `bun run test` を実行する  
**THEN** remote branch に新しい commit が push されていない（origin の HEAD がテスト前後で同一）

---

## TC-015: `pipeline-integration.test.ts` の全 `runPipeline` 呼び出しに `noopSpawn` が渡されている

- **Category**: Side-effect Isolation
- **Priority**: must
- **Source**: tasks.md Task 5 / design.md D5

**GIVEN** `tests/pipeline-integration.test.ts`  
**WHEN** `runPipeline` の呼び出し箇所（TC-010〜TC-DC-108）を網羅的に確認する  
**THEN** すべての deps オブジェクトに `spawn: noopSpawn` が含まれており、`noopSpawn` の実装は `{ exitCode: 0, stdout: "", stderr: "" }` を返す

---

## TC-016: `propagate.test.ts` は変更不要のまま pass する

- **Category**: Unit
- **Priority**: should
- **Source**: request.md 要件 3 / design.md D5

**GIVEN** `tests/unit/core/verification/propagate.test.ts`（変更なし）  
**WHEN** `bun run test` を実行する  
**THEN** `propagate.test.ts` のテストケースがすべて pass する（既に fake spawn を inject 済みのため影響なし）

---

## TC-017: `spawn` を渡さずに `propagateVerificationResult` を呼ぶとコンパイルエラーになる

- **Category**: Type Safety
- **Priority**: must
- **Source**: design.md D1 / request.md 目的

**GIVEN** 変更後の `propagateVerificationResult` 型定義  
**WHEN** `spawn` フィールドを省略して呼び出すコードを書く  
**THEN** TypeScript が型エラーを報告し、コンパイルが失敗する（compile-time guarantee）

---

## TC-018: `VerificationStep` が `spawn` なしの `StepDeps` で instantiate されるとコンパイルエラーになる

- **Category**: Type Safety
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 2

**GIVEN** `CliStep.run` が `CliStepDeps` を要求する型定義  
**WHEN** `spawn` フィールドを持たない `StepDeps` を `VerificationStep.run` に渡すコードを書く  
**THEN** TypeScript が型エラーを報告する

---

## TC-019: `PrCreateStep.run` は変更なしで型チェックを通過する

- **Category**: Type Safety
- **Priority**: should
- **Source**: design.md "Not Changed" / D2 backward compat

**GIVEN** `src/core/step/pr-create.ts`（変更なし）  
**WHEN** `bun run typecheck` を実行する  
**THEN** `PrCreateStep` に関するコンパイルエラーが 0 件（bivariant method checking により `StepDeps` が `CliStepDeps` に assignable）

---

## TC-020: `StepContext` が変更されていない

- **Category**: Type Safety
- **Priority**: should
- **Source**: request.md 要件 2 "StepContext は触らない" / design.md D2

**GIVEN** `src/core/types.ts` の `StepContext` インターフェース  
**WHEN** 定義を確認する  
**THEN** `spawn` フィールドが追加されておらず、変更前と同一の定義を保っている

---

## TC-021: `executor.ts` が変更なしで型チェックを通過する

- **Category**: Type Safety
- **Priority**: should
- **Source**: design.md "Not Changed" / D3

**GIVEN** `src/core/step/executor.ts`（変更なし）  
**WHEN** `bun run typecheck` を実行する  
**THEN** executor に関するコンパイルエラーが 0 件（`PipelineDeps` が `CliStepDeps` を satisfy するため）

---

## TC-022: `noopSpawn` は `SpawnFn` 型に適合する

- **Category**: Unit
- **Priority**: should
- **Source**: tasks.md Task 5 / design.md D5

**GIVEN** `tests/pipeline-integration.test.ts` に定義された `noopSpawn`  
**WHEN** 型定義と戻り値を確認する  
**THEN** `SpawnFn` 型に一致し、`{ exitCode: 0, stdout: "", stderr: "" }` を resolve する Promise を返す

---

## TC-023: `local.ts` に `spawnCommand` の import が追加されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 4a

**GIVEN** `src/core/runtime/local.ts` の import セクション  
**WHEN** import 一覧を確認する  
**THEN** `import { spawnCommand } from "../../util/spawn.js"` が存在する

---

## TC-024: `managed.ts` に `spawnCommand` の import が追加されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: tasks.md Task 4b

**GIVEN** `src/core/runtime/managed.ts` の import セクション  
**WHEN** import 一覧を確認する  
**THEN** `import { spawnCommand } from "../../util/spawn.js"` が存在する

---

## TC-025: `buildDeps` の戻り値が `PipelineDeps` 型を満たす（local）

- **Category**: Type Safety
- **Priority**: must
- **Source**: design.md D4

**GIVEN** `src/core/runtime/local.ts` の `buildDeps` メソッド  
**WHEN** `bun run typecheck` を実行する  
**THEN** `spawn` 必須フィールドが追加されたことで型エラーが解消し、`PipelineDeps` を満たしている

---

## TC-026: `buildDeps` の戻り値が `PipelineDeps` 型を満たす（managed）

- **Category**: Type Safety
- **Priority**: must
- **Source**: design.md D4

**GIVEN** `src/core/runtime/managed.ts` の `buildDeps` メソッド  
**WHEN** `bun run typecheck` を実行する  
**THEN** `spawn` 必須フィールドが追加されたことで型エラーが解消し、`PipelineDeps` を満たしている

---

## TC-027: Tasks 1–4 適用後・Task 5 適用前の `typecheck` は green

- **Category**: Build
- **Priority**: could
- **Source**: tasks.md Task 4 Verification

**GIVEN** Tasks 1–4 のみ適用した状態（pipeline-integration.test.ts 未修正）  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件（型の compile error は Tasks 1–4 で解消済みのため）

> Note: `bun run test` は TC-DC-xxx 系で runtime crash する可能性あり（Task 5 適用前）。typecheck のみを確認する。

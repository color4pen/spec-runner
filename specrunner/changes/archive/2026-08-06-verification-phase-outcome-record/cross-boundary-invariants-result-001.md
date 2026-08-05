# Cross-Boundary Invariants Review: verification-phase-outcome-record

- **reviewer**: cross-boundary-invariants
- **iteration**: 1

## 目的

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものの正しさではなく、既存機構との相互作用に潜む欠陥を対象とする。

---

## 検査した不変条件と判定

### INV-1: `normalizeSteps` passthrough — StepRun の全フィールドが保存される

- **境界**: `src/state/schema/operations.ts:70-71` → `"attempt" in obj && "outcome" in obj` の条件分岐 → `return obj as unknown as StepRun`
- **判定**: ✓ 維持
- StepRun 判定パスは `obj as unknown as StepRun` の passthrough であり、既存フィールド以外のフィールドも含めて全体を返す。`verificationPhases` は `StepRun.outcome` の optional フィールドとして追加されたが、passthrough 経路は型を参照しないため影響なし。

### INV-2: journal round-trip — `verificationPhases` がロスレスで往復する

- **境界**: `StepRun.outcome.verificationPhases` → `stepRunToRecord` (event-journal.ts:457) → `appendEventRecord` → `fold` (event-journal.ts:380)
- **判定**: ✓ 維持
- `stepRunToRecord` と `fold` の双方が `...(outcome.verificationPhases !== undefined ? { verificationPhases: outcome.verificationPhases } : {})` の conditional-spread パターンで対称に実装されている。他の optional outcome フィールド（addedTurns 等）と同一パターンであり round-trip 整合。

### INV-3: `stateToStateJson` が `steps` を除外 — `verificationPhases` は journal 専用で永続化される

- **境界**: `src/store/job-state-projection.ts:189-190` → `const { history: _h, steps: _s, ...rest } = state`
- **判定**: ✓ 維持
- `stateToStateJson` は `history` と `steps` を明示的に除外して `state.json` に書く。`verificationPhases` は StepRun.outcome に属するため、steps 除外により自動的に journal 専用になる。load 時は `fold()` で再構築（INV-2 ✓）。

### INV-4: build-fixer の reads 宣言と findingsPath が不変

- **境界**: `src/core/step/build-fixer.ts:66, :77, :94` — `verificationResultPath(deps.slug)` 参照
- **判定**: ✓ 維持
- `build-fixer.ts` は本 diff に含まれていない。`reads()` の `{ path: verificationResultPath(deps.slug) }` と `findingsPath` の参照はいずれも unchanged。ファイルパスの変更なし。

### INV-5: `verdict:parsed` イベント型が狭い — 既存 consumer への影響なし

- **境界**: `src/core/event/types.ts:31` の型定義 → `src/logger/pipeline-logger.ts:114-118` / `src/cli/progress.ts:104`
- **判定**: ✓ 維持
- `verdict:parsed` の型は `{ step: string; outcome: { verdict, toolResult?, followUpAttempts? } }` のみを宣言している。`applySuccessPostPersistEffects` が emit する payload にも `verificationPhases` は含まれない（`result.completion` から取得するため）。現行 consumer（PipelineLogger / progress.ts）はいずれも `outcome.verdict` のみを使用しており、影響なし。

### INV-6: `projectSuccess` が `commitRound` 経由でも `verificationPhases` を正しく扱う

- **境界**: `commit-orchestrator.ts:593` の `commitRound` 内 `projectSuccess(state, step, result, findingsPath)` 呼び出し
- **判定**: ✓ 維持
- `projectSuccess` は `result.verificationPhases` を destructure して `pushStepResult` に conditional-spread する。round member として verification が実行されることはないが（sequential CLI step 固定）、仮に round member として渡された場合も正しく動作する。round member の agent step では `verificationPhases` は `undefined` であり、conditional-spread により outcome に含まれない。

### INV-7: exception path — true 例外時に `verificationPhases` を要求しない

- **境界**: `executor.ts:572-580` — `step.run()` が例外を throw → `kind: "halt"` return
- **判定**: ✓ 維持
- `VerificationStep.run()` が例外を throw した場合（spawn crash 等）、`cliRunResult` が未設定のまま `halt` が返される。`verificationPhases` は `cliRunResult?.verificationPhases` から取得するため `undefined` となり、`StepExecutionResult` には `verificationPhases` フィールドが含まれない。request が明示的に "spawn crash 等の真の例外は halt（error）となる別クラスで、本 request のスコープ外" としているため問題なし。

### INV-8: `parseResult` / `verdict` 導出経路が不変

- **境界**: `src/core/step/verification.ts:105-113` の `parseResult` → `src/core/step/executor.ts:613` の `deriveStepCompletion` → pipeline 遷移
- **判定**: ✓ 維持
- `parseResult` は `runVerification` の戻り値を読まず、disk 上の `verification-result.md` を `resultFilePath` 経由で読む（executor.ts:600-610）。`verificationPhases` の記録は `cliRunResult?.verificationPhases` が `deriveStepCompletion` の AFTER で取得される（executor.ts:620）。verdict 導出経路（markdown → parseResult → verdict）と phase 記録経路は完全に分離。

### INV-9: `CliStep.run()` の戻り型宣言と実装の乖離

- **境界**: `src/core/port/step-types.ts:354` の `run(state, deps): Promise<void>` 宣言 → `src/core/step/verification.ts:86` の `return { verificationPhases } as unknown as void`
- **判定**: ⚠ 維持（弱い型制約による設計上の fragility）
- `CliStep` インターフェース（未変更）は `run(): Promise<void>` を宣言する。`VerificationStep.run()` は `{ verificationPhases } as unknown as void` を返し、executor が `as unknown as Promise<CliStepRunOutcome | void>` で再キャストして値を回収する。TypeScript はこの乖離を検出できない。現時点で `CliStep.run()` を呼び出す唯一のコードが executor であり、executor は明示的にキャストして処理しているため **実行時の欠陥はない**。ただし、インターフェースが `void` を宣言しながら runtime で object を返すという暗黙の契約は、将来 CLI step を追加する実装者が参照した際に情報ロスを誘発しうる。

---

## Findings 詳細

### F-1（low）: `CliStep.run()` インターフェースが `void` を宣言するが `VerificationStep` は object を返す

- **対象**: `src/core/port/step-types.ts:354`, `src/core/step/verification.ts:86`
- `CliStep` インターフェースの `run(): Promise<void>` に対し、`VerificationStep.run()` が `as unknown as void` を介して object を返す。executor は `as unknown as Promise<CliStepRunOutcome | void>` で回収する。
- 実行時の欠陥は存在しない（executor のみが caller、キャストを認識済み）。
- 将来の CLI step 実装者がインターフェースの型注釈だけを頼った場合、この side-channel パターンに気づかない可能性がある。`CliStepRunOutcome` 型と executor のコメントで意図は文書化されているが、型システムによる強制がない。
- **verdict**: fixable（インターフェースの戻り型を `Promise<CliStepRunOutcome | void>` に widen することで型システムレベルの整合が取れる。tasks.md D4 が "型シグネチャ維持" を選択した理由（既存インライン CliStep との互換）も文書化されており、widen しても void-returning step は後方互換）

---

## Observations

### OBS-1: `pipeline.transitions.test.ts` TC-014 hint テストが変更された

- **対象**: `tests/unit/core/pipeline/pipeline.transitions.test.ts`
- tasks.md T-07 は "テストファイルは変更不可のため、1件の既存テストが失敗する" と明記し、TC-014 の `/^Review verification-result-001\.md/` アサーションが旧挙動を固定したまま失敗することを予告していた。
- 実際の diff では TC-014 のテスト名とアサーションが変更されており（`/^Review verification-result-001\.md/` → `/verification-result\.md/` + `/events\.jsonl/`）、テストは green になっている。
- 変更内容は **意味的に正しい**（旧アサーションは存在しないファイルを案内する誤った挙動を固定していた）。AC7 の "既存テスト無変更" が指す対象は verdict / routing テストであり、それらは unchanged で green。
- verdict / routing の不変性（AC7 の実質的な検証対象）に影響はない。tasks.md の宣言との乖離として記録する。

---

## まとめ

| 不変条件 | 判定 |
|---|---|
| INV-1: normalizeSteps passthrough | ✓ 維持 |
| INV-2: journal round-trip (stepRunToRecord ↔ fold) | ✓ 維持 |
| INV-3: stateToStateJson steps 除外 / journal 専用永続化 | ✓ 維持 |
| INV-4: build-fixer reads / findingsPath 不変 | ✓ 維持 |
| INV-5: verdict:parsed イベント consumer への影響 | ✓ 維持 |
| INV-6: commitRound 経由 projectSuccess | ✓ 維持 |
| INV-7: exception halt path での phases 不要 | ✓ 維持 |
| INV-8: parseResult / verdict 導出経路の分離 | ✓ 維持 |
| INV-9: CliStep.run() 型宣言と実装の乖離 | ⚠ 実行時は維持・型制約は弱い |

**blocking 欠陥なし。** F-1（low / fixable）は設計上の fragility であり、即時ブロックの根拠にはならない。

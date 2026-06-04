# Test Cases: 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 27
- **Manual**: 0
- **Priority**: must: 23, should: 4, could: 0

---

## Category 1: PipelineDescriptor スキーマ

### TC-001: standard 記述子が全 step の役割と phase を宣言する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PipelineDescriptor は工程の役割と phase を一級フィールドとして持つ > Scenario: standard 記述子が全 step の役割と phase を宣言する

---

### TC-002: 各 phase に creator と reviewer がちょうど 1 つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PipelineDescriptor は工程の役割と phase を一級フィールドとして持つ > Scenario: 各 phase に creator と reviewer がちょうど 1 つ

---

### TC-003: AgentStep.phase フィールドが型定義に存在しない

**Category**: unit
**Priority**: must
**Source**: design.md > D2: AgentStep.phase を廃止し phase の単一情報源を記述子にする / tasks.md > T-02

**GIVEN** `src/core/port/step-types.ts` の `AgentStep` 型定義、および `design.ts` / `spec-review.ts` / `spec-fixer.ts`
**WHEN** 型定義と各 step ファイルの `phase` フィールド宣言を確認する
**THEN** `AgentStep` 型に `phase` フィールドが存在せず、いずれのステップ定義にも `phase:` 宣言が残っていない

---

## Category 2: resolve-step 記述子駆動

### TC-004: standard 記述子での再開ルーティングが従来と一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume の役割導出は記述子から行い standard 決め打ちと standard import を持たない > Scenario: standard 記述子での再開ルーティングが従来と一致する

---

### TC-005: --from の legacy alias が phase に応じて記述子から解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume の役割導出は記述子から行い standard 決め打ちと standard import を持たない > Scenario: --from の legacy alias が phase に応じて記述子から解決する

---

### TC-006: fixer-empty 検出が記述子の loopFixerPairs reverse から解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume の役割導出は記述子から行い standard 決め打ちと standard import を持たない > Scenario: fixer-empty 検出が記述子の loopFixerPairs reverse から解決する

---

### TC-007: resolve-step が standard 固有の import / リテラルを含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume の役割導出は記述子から行い standard 決め打ちと standard import を持たない > Scenario: resolve-step が standard 固有の import / リテラルを含まない

---

### TC-008: impl phase STEP_MAPPING の fixer が code-review ペアから一意解決される

**Category**: unit
**Priority**: should
**Source**: design.md > D3: resolve-step.ts を記述子駆動にする（phase fixer の導出が核心）

**GIVEN** STANDARD_DESCRIPTOR と impl phase の STEP_MAPPING 導出ロジック（`loopFixerPairs[reviewerOf(phase)]`）
**WHEN** impl phase の reviewer（code-review）から fixer を導出する
**THEN** `loopFixerPairs["code-review"] = "code-fixer"` で一意解決され、build-fixer と混同されない

---

## Category 3: 非標準記述子での再開解決

### TC-009: design-only の crash 再開が design に解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 非標準記述子で再開が正しい工程に解決する > Scenario: design-only の crash 再開が design に解決する

---

### TC-010: design-only で creator 再開が design に解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 非標準記述子で再開が正しい工程に解決する > Scenario: design-only で creator 再開が design に解決する

---

### TC-011: design-only で存在しない役割への alias 再開はエラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 非標準記述子で再開が正しい工程に解決する > Scenario: design-only で存在しない役割への alias 再開はエラーになる

---

## Category 4: Pipeline 収束意味論の記述子駆動化

### TC-012: まとめ表示が記述子の summaryStep から駆動される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Pipeline 本体は standard 固有の直書きを持たず収束意味論を記述子駆動にする > Scenario: まとめ表示が記述子の summaryStep から駆動される

---

### TC-013: summaryStep 未設定の記述子は summary を emit しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pipeline 本体は standard 固有の直書きを持たず収束意味論を記述子駆動にする > Scenario: summaryStep 未設定の記述子は summary を emit しない

---

### TC-014: fixer bypass が reviewer↔fixer ペアから一般的に動作する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pipeline 本体は standard 固有の直書きを持たず収束意味論を記述子駆動にする > Scenario: fixer bypass が reviewer↔fixer ペアから一般的に動作する

---

### TC-015: paired fixer を持たない loop 工程は救済なく打ち切られる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pipeline 本体は standard 固有の直書きを持たず収束意味論を記述子駆動にする > Scenario: paired fixer を持たない loop 工程は救済なく打ち切られる

---

### TC-016: loopName 省略時に loopNames[0] へフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md > D5: Pipeline 本体から standard 固有リテラルを除去する（loopName 既定値除去）/ tasks.md > T-04

**GIVEN** `loopName` を省略し `loopNames` に 1 件以上の要素を持つ `PipelineDescriptor` で構築した `Pipeline`
**WHEN** `Pipeline` を初期化する
**THEN** `this.loopName` が `loopNames[0]` に設定され、`STEP_NAMES.SPEC_REVIEW` 等の standard リテラルは使われない

---

### TC-017: 例外 catch 経路の resumePoint 既定が run() の startStep になる

**Category**: unit
**Priority**: should
**Source**: design.md > D5: Pipeline 本体から standard 固有リテラルを除去する（例外 catch 経路の resumePoint 既定変更）/ tasks.md > T-04

**GIVEN** pipeline 実行中に予期しない例外が発生し、`resumePoint.step` が未設定の状態
**WHEN** 例外 catch 経路で `resumePoint` を構築する
**THEN** `resumePoint.step` が `run()` に渡された `startStep` の値になり、`STEP_NAMES.DESIGN` を含む standard リテラルを参照しない

---

### TC-018: pipeline.ts から STEP_NAMES import が除去されている

**Category**: unit
**Priority**: must
**Source**: design.md > D5: Pipeline 本体から standard 固有リテラルを除去する / tasks.md > T-04

**GIVEN** `src/core/pipeline/pipeline.ts` のソース
**WHEN** import 文を確認する
**THEN** `STEP_NAMES` の import が存在しない

---

### TC-019: buildPipeline が summaryStep を Pipeline constructor に伝播する

**Category**: unit
**Priority**: should
**Source**: design.md > D6: まとめ表示を summaryStep 記述子フィールドで駆動する / tasks.md > T-04

**GIVEN** `summaryStep = "spec-review"` を持つ STANDARD_DESCRIPTOR
**WHEN** `src/core/pipeline/run.ts` の `buildPipeline` が `Pipeline` を構築する
**THEN** `Pipeline` constructor に `summaryStep: "spec-review"` が渡されている

---

## Category 5: 標準 pipeline 挙動の不変性

### TC-020: iter 進捗のバイト単位出力が保存される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: standard pipeline の挙動が画面出力・打ち切り・救済・遷移で不変 > Scenario: iter 進捗のバイト単位出力が保存される

---

### TC-021: review 枯渇の打ち切りコードが保存される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: standard pipeline の挙動が画面出力・打ち切り・救済・遷移で不変 > Scenario: review 枯渇の打ち切りコードが保存される

---

## Category 6: 既存 state 互換性

### TC-022: pipelineId 欠落の state が standard として再開解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 state ファイルが本変更後の再開で壊れない > Scenario: pipelineId 欠落の state が standard として再開解決する

---

### TC-023: in-flight 状態の state が再開で壊れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 state ファイルが本変更後の再開で壊れない > Scenario: in-flight 状態の state が再開で壊れない

---

## Category 7: アーキテクチャ静的検査

### TC-024: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07: 検証ゲート

**GIVEN** 本変更後のソース全体（役割 / phase 型追加・AgentStep.phase 削除・resolve-step 書き換え・pipeline.ts リテラル除去）
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で終了する

---

### TC-025: bun run test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07: 検証ゲート

**GIVEN** 本変更後のソース全体
**WHEN** `bun run test` を実行する
**THEN** 全テストが green で終了する

---

### TC-026: core-invariants テストが green（禁止 import / I/O を増やさない）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / T-01（ソース文字列読み取りテストの影響なし確認）

**GIVEN** `tests/unit/architecture/core-invariants.test.ts`（import edge・pipeline 内 I/O を検査）
**WHEN** 本変更後のソースで当該テストを実行する
**THEN** 新たな禁止 import・pipeline 内 I/O を増やしておらず green になる

---

### TC-027: grep-no-step-name-hardcode テストが green（executor への step 名 hardcode なし）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / T-01（ソース文字列読み取りテストの影響なし確認）

**GIVEN** `tests/grep-no-step-name-hardcode.test.ts`（`executor.ts` / `executor-helpers.ts` のみ scan）
**WHEN** 本変更後のソースで当該テストを実行する
**THEN** executor 側に step 名 hardcode が増えておらず green になる

---

## Result

```yaml
result: completed
total: 27
automated: 27
manual: 0
must: 23
should: 4
could: 0
blocked_reasons: []
```

# Test Cases: fixer-helpers-step-name-literal

## TC-001: ローカル定数が削除されている

- **Category**: Static Analysis
- **Priority**: must
- **Source**: 要件 1 / 受け入れ基準 1

**GIVEN** `src/core/step/fixer-helpers.ts` の最新ソースを参照する  
**WHEN** `grep -n "STEP_NAMES_BUILD_FIXER" src/core/step/fixer-helpers.ts` を実行する  
**THEN** 出力が 0 件である

---

## TC-002: プロジェクト全体にリテラル定数が残っていない

- **Category**: Static Analysis
- **Priority**: must
- **Source**: 受け入れ基準 3

**GIVEN** `src/` 配下のすべての TypeScript ファイルを対象にする  
**WHEN** `grep -rn "STEP_NAMES_BUILD_FIXER" src/` を実行する  
**THEN** 出力が 0 件である

---

## TC-003: 参照箇所が STEP_NAMES.BUILD_FIXER 経由になっている

- **Category**: Static Analysis
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 2

**GIVEN** `src/core/step/fixer-helpers.ts` の `buildContinuationMessage` 関数を参照する  
**WHEN** `opts.stepName` との比較式を確認する  
**THEN** `opts.stepName === STEP_NAMES.BUILD_FIXER` という形式になっており、文字列リテラル `"build-fixer"` との直接比較は存在しない

---

## TC-004: typecheck が通る

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準 4 / Task 2

**GIVEN** 変更後のソースコードがある  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなしで終了する（exit code 0）

---

## TC-005: 既存テストがすべて pass する

- **Category**: Regression
- **Priority**: must
- **Source**: 受け入れ基準 4 / 要件 3 / Task 2

**GIVEN** `buildContinuationMessage` に関する既存テストがある  
**WHEN** `bun run test` を実行する  
**THEN** すべてのテストが pass し、失敗が 0 件である

---

## TC-006: build-fixer の source ラベルが "verification" になる（挙動不変確認）

- **Category**: Behavioral
- **Priority**: must
- **Source**: design.md「挙動変更なし」/ 設計判断 2

**GIVEN** `buildContinuationMessage` を `stepName = "build-fixer"` で呼び出す  
**WHEN** 戻り値の文字列を確認する  
**THEN** `"verification から新しい findings が出ました"` というテキストが含まれている（変更前と同一の出力）

---

## TC-007: build-fixer 以外の source ラベルが "reviewer" になる（挙動不変確認）

- **Category**: Behavioral
- **Priority**: must
- **Source**: design.md「挙動変更なし」/ 設計判断 2

**GIVEN** `buildContinuationMessage` を `stepName = "spec-fixer"` または `"code-fixer"` で呼び出す  
**WHEN** 戻り値の文字列を確認する  
**THEN** `"reviewer から新しい findings が出ました"` というテキストが含まれている（変更前と同一の出力）

---

## TC-008: STEP_NAMES.BUILD_FIXER の値が "build-fixer" と一致する

- **Category**: Static Analysis
- **Priority**: should
- **Source**: design.md「Risks: なし」の前提確認

**GIVEN** `src/core/step/step-names.ts` を参照する  
**WHEN** `STEP_NAMES.BUILD_FIXER` の定義値を確認する  
**THEN** 値が文字列 `"build-fixer"` である（置換前のリテラルと同値）

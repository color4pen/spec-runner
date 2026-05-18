# Test Cases: spec-review baseline 取得を Read-tool-pull モデルに切替

## Overview

| # | Category | Priority | Source |
|---|----------|----------|--------|
| TC-01〜TC-05 | prompt | must | request.md 受け入れ基準 |
| TC-06〜TC-08 | type | must | request.md 受け入れ基準 |
| TC-09〜TC-14 | behavior | must/should | request.md 要件 + design.md |
| TC-15〜TC-18 | regression | must | tasks.md Task 7 |
| TC-19〜TC-20 | spec | must | request.md 要件 4 + tasks.md Task 8 |
| TC-21〜TC-22 | build | must | request.md 受け入れ基準 |

---

## TC-01: `{{BASELINE_SPECS}}` placeholder が削除されている

- **Category**: prompt
- **Priority**: must
- **Source**: request.md 受け入れ基準 #1

**GIVEN** `src/prompts/spec-review-system.ts` を参照する  
**WHEN** ファイル全体を検索する  
**THEN** `{{BASELINE_SPECS}}` という文字列が存在しない

---

## TC-02: `## Baseline Spec Consistency Check` が Read-tool-pull 手順に書き換えられている

- **Category**: prompt
- **Priority**: must
- **Source**: request.md 受け入れ基準 #4 + design.md §1

**GIVEN** `src/prompts/spec-review-system.ts` の system prompt 文字列を参照する  
**WHEN** `## Baseline Spec Consistency Check` セクションの内容を確認する  
**THEN** 以下がすべて含まれる:
- "Read tool" または "Read `specrunner/specs/" というキーワード
- "Identify the capability name" というステップ指示
- "Extract existing" というステップ指示
- "category: consistency" という severity 指定
- MODIFIED / REMOVED / RENAMED-FROM header の検証手順
- ADDED header の重複検証手順
- baseline ファイルが存在しない場合の HIGH severity 指示

---

## TC-03: conditional skip 文が削除されている

- **Category**: prompt
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3

**GIVEN** `src/prompts/spec-review-system.ts` の system prompt 文字列を参照する  
**WHEN** ファイル全体を検索する  
**THEN** "skip this check entirely" という文字列が存在しない

---

## TC-04: initial message template に `{{BASELINE_SPECS}}` が含まれない

- **Category**: prompt
- **Priority**: must
- **Source**: request.md 受け入れ基準 #1 + tasks.md Task 2

**GIVEN** `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` 定数を参照する  
**WHEN** テンプレート文字列を検索する  
**THEN** `{{BASELINE_SPECS}}` という文字列が存在しない

---

## TC-05: `buildSpecReviewInitialMessage()` の戻り値に `<baseline-specs>` タグが含まれない

- **Category**: prompt
- **Priority**: must
- **Source**: design.md §2 + tasks.md Task 4

**GIVEN** `buildSpecReviewInitialMessage()` を任意の引数で呼び出す  
**WHEN** `baselineSpecs` を渡しても渡さなくても関数を実行する  
**THEN** 戻り値の文字列に `<baseline-specs>` タグが含まれない

---

## TC-06: `SpecReviewPromptInput` に `baselineSpecs` field が存在しない

- **Category**: type
- **Priority**: must
- **Source**: request.md 受け入れ基準 #2 + tasks.md Task 3

**GIVEN** `src/prompts/spec-review-system.ts` の `SpecReviewPromptInput` 型定義を参照する  
**WHEN** 型定義を確認する  
**THEN** `baselineSpecs` という field が定義されていない

---

## TC-07: `DynamicContext` に `baselineSpecs` field が存在しない

- **Category**: type
- **Priority**: must
- **Source**: request.md 受け入れ基準 #5 + tasks.md Task 5

**GIVEN** `src/git/dynamic-context.ts` の `DynamicContext` interface を参照する  
**WHEN** interface 定義を確認する  
**THEN** `baselineSpecs?: Record<string, string>` field および対応する JSDoc が存在しない

---

## TC-08: `bun run typecheck` が成功する

- **Category**: type
- **Priority**: must
- **Source**: request.md 受け入れ基準 #10

**GIVEN** Task 1〜Task 8 の全変更が適用された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーがゼロで終了コードが 0

---

## TC-09: `enrichContext()` が `baselineSpecs` を populate しない

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 受け入れ基準 #6 + tasks.md Task 6

**GIVEN** `src/core/step/spec-review.ts` の `SpecReviewStep.enrichContext()` を参照する  
**WHEN** メソッド内部を確認する  
**THEN**:
- specs/ ディレクトリの走査ロジックが存在しない
- `fs.readFile` を用いた baseline 収集ループが存在しない
- `{ ...dynamicContext, baselineSpecs }` というオブジェクト合成が存在しない

---

## TC-10: `buildMessage()` が `baselineSpecs` を渡さない

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 受け入れ基準 #7 + tasks.md Task 6

**GIVEN** `src/core/step/spec-review.ts` の `buildMessage()` を参照する  
**WHEN** `buildSpecReviewInitialMessage()` の呼び出し箇所を確認する  
**THEN** 引数オブジェクトに `baselineSpecs` プロパティが存在しない

---

## TC-11: baseline spec が存在する場合、MODIFIED header 不一致で HIGH severity finding が報告される

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 要件 4 + design.md §Read-tool-pull 手順 step 4

**GIVEN** delta spec の `## MODIFIED Requirements` セクションに header `### Requirement: foo` が存在する  
**AND** baseline `specrunner/specs/<capability>/spec.md` に `### Requirement: foo` が存在しない  
**WHEN** spec-review agent が delta spec をレビューする  
**THEN** `category: consistency`、severity `HIGH` の finding が報告される

---

## TC-12: baseline spec が存在する場合、MODIFIED header 完全一致では finding なし

- **Category**: behavior
- **Priority**: should
- **Source**: design.md §Read-tool-pull 手順 step 4

**GIVEN** delta spec の `## MODIFIED Requirements` セクションに header `### Requirement: bar` が存在する  
**AND** baseline に `### Requirement: bar` が存在する  
**WHEN** spec-review agent が delta spec をレビューする  
**THEN** consistency カテゴリの HIGH severity finding が当該 header に対して報告されない

---

## TC-13: ADDED header が baseline に既存する場合、HIGH severity finding が報告される

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 要件 4 (重複追加の防止) + design.md §Read-tool-pull 手順 step 5

**GIVEN** delta spec の `## ADDED Requirements` セクションに header `### Requirement: existing` が存在する  
**AND** baseline に `### Requirement: existing` が既に存在する  
**WHEN** spec-review agent が delta spec をレビューする  
**THEN** `category: consistency`、severity `HIGH` の finding が報告される

---

## TC-14: baseline ファイルが存在しない場合の分岐

- **Category**: behavior
- **Priority**: should
- **Source**: design.md §Read-tool-pull 手順 step 6-7

**GIVEN** `specrunner/specs/<capability>/spec.md` が存在しない  
**WHEN A** delta spec に `## MODIFIED` / `## REMOVED` セクションが含まれる  
**THEN A** `category: consistency`、severity `HIGH` の finding が報告される

**WHEN B** delta spec に `## ADDED` セクションのみが含まれる  
**THEN B** consistency finding は報告されない (新規 capability として扱われる)

---

## TC-15: baseline が注入されなくても check が silent skip されない

- **Category**: regression
- **Priority**: must
- **Source**: request.md 背景 (PR #306 / PR #308 の真因) + design.md §問題

**GIVEN** `SpecReviewStep.enrichContext()` が `baselineSpecs` を populate しない状態  
**WHEN** spec-review session が MODIFIED セクションを含む delta spec でレビューを実行する  
**THEN** Baseline Spec Consistency Check が実行され、header 検証結果が出力に含まれる  
**AND** "skip this check entirely" に相当するスキップが発生しない

---

## TC-16: 既存テスト TC-015〜TC-017 (MODIFIED/REMOVED/ADDED check keywords) が維持される

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md Task 7 更新対象

**GIVEN** `tests/prompts/spec-review-system.test.ts` を参照する  
**WHEN** `bun run test` を実行する  
**THEN** MODIFIED / REMOVED / ADDED check のキーワード検証テストがすべて pass する  
**AND** system prompt の書き換え後もこれらのキーワードが prompt 内に存在する

---

## TC-17: 削除済みテスト (注入モデル依存) が残存しない

- **Category**: regression
- **Priority**: should
- **Source**: tasks.md Task 7 削除対象

**GIVEN** `tests/prompts/spec-review-system.test.ts` を参照する  
**WHEN** テストケースを確認する  
**THEN** 以下のテストが存在しない:
- "skip check when no baseline" (旧 TC-018)
- "baseline-specs section when provided" (旧 TC-019)
- "baseline-specs omission when absent" (旧 TC-020)
- "buildMessage passes baselineSpecs" (旧 TC-021)
- "SpecReviewPromptInput has baselineSpecs field" (旧 TC-022)

---

## TC-18: Read-tool-pull モデル確認テストが追加されている

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md Task 7 追加対象

**GIVEN** `tests/prompts/spec-review-system.test.ts` を参照する  
**WHEN** テストケースを確認する  
**THEN** 以下の assertion が存在する:
- system prompt に "Read tool" が含まれる
- system prompt に "Identify the capability name" が含まれる
- system prompt に "Read `specrunner/specs/" が含まれる
- system prompt に "Extract existing" が含まれる
- system prompt に "category: consistency" が含まれる
- system prompt に "skip this check entirely" が含まれない
- initial message template に `{{BASELINE_SPECS}}` が含まれない
- `buildSpecReviewInitialMessage()` の戻り値に `<baseline-specs>` が含まれない

---

## TC-19: delta spec が REMOVED + ADDED の combo で作成されている

- **Category**: spec
- **Priority**: must
- **Source**: request.md 受け入れ基準 #11 + tasks.md Task 8

**GIVEN** `specrunner/changes/spec-review-baseline-pull-model/specs/spec-review-session/spec.md` を参照する  
**WHEN** ファイルが存在することを確認する  
**THEN**:
- `## REMOVED Requirements` セクションが存在する
- `## ADDED Requirements` セクションが存在する
- REMOVED セクションの header が baseline `specrunner/specs/spec-review-session/spec.md` の実際の Requirement header と完全一致する
- ADDED セクションに "Read tool で baseline spec を自力取得" に相当する新 Requirement が含まれる

---

## TC-20: delta spec の REMOVED header が baseline と完全一致する

- **Category**: spec
- **Priority**: must
- **Source**: request.md 要件 4 教訓 + tasks.md Task 8

**GIVEN** `specrunner/changes/spec-review-baseline-pull-model/specs/spec-review-session/spec.md` の `## REMOVED Requirements` セクションを参照する  
**AND** `specrunner/specs/spec-review-session/spec.md` を参照する  
**WHEN** REMOVED セクションに記載された `### Requirement:` header 名を baseline と照合する  
**THEN** 完全一致する header が baseline に存在する (= spec-merge escalation の再発なし)

---

## TC-21: `bun run test` が成功する

- **Category**: build
- **Priority**: must
- **Source**: request.md 受け入れ基準 #9-10

**GIVEN** Task 1〜Task 8 の全変更が適用された状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、終了コードが 0

---

## TC-22: `baselineSpecs` 参照がコードベース全体から除去されている

- **Category**: build
- **Priority**: should
- **Source**: request.md 受け入れ基準 #2, #5, #6, #7, #8

**GIVEN** リポジトリ全体を対象に `baselineSpecs` を grep する  
**WHEN** `src/` ディレクトリ配下を検索する  
**THEN** `baselineSpecs` という識別子が production コードに存在しない  
**AND** `tests/` ディレクトリ内には注入モデル依存テスト以外での参照が存在しない

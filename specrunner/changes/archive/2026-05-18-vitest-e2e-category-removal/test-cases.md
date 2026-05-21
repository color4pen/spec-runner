# Test Cases: vitest-e2e-category-removal

## Summary

`src/prompts/test-case-gen-system.ts` から `e2e` category を削除し、test category 体系を `unit | integration | manual` に整理する変更のテストシナリオ。prompt 文字列検証 (TC-CATG)・delta spec 構造検証 (TC-SPEC)・regression 保護 (TC-REG)・ビルド検証 (TC-BUILD) の 4 グループで構成する。

Automated: 3 (unit)
Manual: 5

---

## TC-CATG-01: prompt 内に `e2e` 文字列が含まれない

- **Category**: unit
- **Priority**: must
- **Source**: Task 1 (1a/1b/1c), req#受け入れ基準

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が `src/prompts/test-case-gen-system.ts` から import できる状態  
**WHEN** prompt 文字列全体に対して `e2e` を検索する  
**THEN** 一致箇所がゼロである (`not.toContain("e2e")`)

---

## TC-CATG-02: prompt 内に 3 種 category が明示されている

- **Category**: unit
- **Priority**: must
- **Source**: Task 1 (1a), req#受け入れ基準

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が import できる状態  
**WHEN** prompt の Category 列挙行を確認する  
**THEN** `unit | integration | manual` の文字列が含まれている (`toContain("unit | integration | manual")`)

---

## TC-CATG-03: LLM 経路規律が prompt に明示されている

- **Category**: unit
- **Priority**: must
- **Source**: Task 2, req#受け入れ基準

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が import できる状態  
**WHEN** Constraints セクションに追加された規律を確認する  
**THEN**
- `MUST NOT be` が含まれている
- `dogfood` が含まれている

---

## TC-CATG-04: Category Determination テーブルから e2e 行が削除されている

- **Category**: unit
- **Priority**: must
- **Source**: Task 1 (1b)

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が import できる状態  
**WHEN** Category Determination テーブルの行を確認する  
**THEN**
- `Screen operations, full user flows` が含まれていない
- `env-dependent` が含まれていない

---

## TC-CATG-05: Summary セクションの Automated 集計が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: Task 1 (1c)

**GIVEN** `TEST_CASE_GEN_SYSTEM_PROMPT` が import できる状態  
**WHEN** Summary セクションの Automated 行を確認する  
**THEN**
- `Automated (unit/integration/e2e)` が含まれていない
- `Automated (unit/integration)` が含まれている

---

## TC-SPEC-01: delta spec が `## ADDED Requirements` セクションを持つ

- **Category**: manual
- **Priority**: must
- **Source**: Task 4, req#受け入れ基準

**GIVEN** `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` が存在する  
**WHEN** ファイルの内容を確認する  
**THEN** `## ADDED Requirements` セクションが存在する

---

## TC-SPEC-02: delta spec に category 体系 Requirement が記述されている

- **Category**: manual
- **Priority**: must
- **Source**: Task 4, req 設計判断#1

**GIVEN** `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` が存在する  
**WHEN** `## ADDED Requirements` セクションの Requirement を確認する  
**THEN**
- `unit` / `integration` / `manual` の 3 種が category として明示されている
- `e2e` は category として生成しないことが明示されている

---

## TC-SPEC-03: delta spec に LLM 経路規律 Requirement が記述されている

- **Category**: manual
- **Priority**: must
- **Source**: Task 4, req 設計判断#4

**GIVEN** `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` が存在する  
**WHEN** `## ADDED Requirements` セクションの Requirement を確認する  
**THEN** 「LLM 呼び出し / 実 API / 実 GitHub repo に依存する scenario は vitest test として表現しない」趣旨の Requirement が記述されている

---

## TC-SPEC-04: delta spec に Scenario が記述されている

- **Category**: manual
- **Priority**: should
- **Source**: Task 4, req#2 Scenario

**GIVEN** `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` が存在する  
**WHEN** Scenario セクションを確認する  
**THEN**
- `e2e` を category として出力することが違反であると記述されている
- LLM mock を前提とする scenario を列挙することが違反であると記述されている

---

## TC-SPEC-05: baseline spec が本 PR で直接作成されていない

- **Category**: manual
- **Priority**: must
- **Source**: req#受け入れ基準, AUTHORITY_SPEC_GUARD_RULE

**GIVEN** 実装後のファイルシステム  
**WHEN** `specrunner/specs/test-case-generator/spec.md` の存在を確認する  
**THEN** ファイルが存在しない (= finish 時の spec-merge で新規作成される経路を維持する)

---

## TC-REG-01: 既存 unit / integration test が regression なし

- **Category**: integration
- **Priority**: must
- **Source**: req#4 既存 test の regression なし, req#受け入れ基準

**GIVEN** 変更後の状態で `bun run test` を実行する  
**WHEN** テストスイート全体が実行される  
**THEN**
- 既存 unit / integration test が全て pass する
- 新規 TC-CATG-01 〜 TC-CATG-05 の 5 TC が pass する
- テスト失敗件数がゼロである

---

## TC-REG-02: archived test-cases.md が変更されていない

- **Category**: manual
- **Priority**: must
- **Source**: req regression check

**GIVEN** 変更後の git diff  
**WHEN** `specrunner/changes/archive/` 配下の全ファイルを確認する  
**THEN**
- `Category: e2e` を含む test-cases.md を含め、archive 配下のファイルが一切変更されていない

---

## TC-BUILD-01: typecheck と test が green

- **Category**: integration
- **Priority**: must
- **Source**: req#受け入れ基準

**GIVEN** 実装が完了した状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN**
- 型エラーがゼロである
- テストが全て pass する
- exit code が 0 で終了する

---

## TC-BUILD-02: test ファイルの import パスが正しい

- **Category**: unit
- **Priority**: must
- **Source**: Task 3 受け入れ基準

**GIVEN** `tests/prompts/test-case-gen-system.test.ts` が新規作成されている  
**WHEN** import 文を確認する  
**THEN** `../../src/prompts/test-case-gen-system.js` を import している

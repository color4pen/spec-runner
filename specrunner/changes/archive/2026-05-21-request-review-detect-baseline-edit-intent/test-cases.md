# Test Cases: request-review-detect-baseline-edit-intent

## Overview

`request-review-system.ts` の authority path 検出ルールを **edit verb 列挙** から **intent 判定** に抽象化する変更のテストシナリオ。

対象ファイル:
- `src/prompts/request-review-system.ts`
- `tests/unit/command/request-review.test.ts`
- `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md`

---

## Category: prompt-content — Step 2 Detection Rule

### TC-RRI-001: Step 2 が intent 判定ベースの検出文言を含む

- **Priority**: must
- **Source**: Task 1, AC[1]

**GIVEN** `src/prompts/request-review-system.ts` が実装されている  
**WHEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の Step 2 (Request Validation) セクションを参照する  
**THEN** authority path への言及の intent を判定する旨の文言が含まれている

---

### TC-RRI-002: 具体的な edit verb 列挙が prompt に含まれない

- **Priority**: must
- **Source**: Task 1, AC[2]

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が実装されている  
**WHEN** prompt 全文を検索する  
**THEN** `MODIFIED`, `ADDED`, `"を更新"`, `"を作成"` 等の具体 verb 列挙が Step 2 の検出条件として含まれない

---

### TC-RRI-003: intent の 3 分類（参照・設計反映・直接操作）が記述されている

- **Priority**: must
- **Source**: Task 1, design.md § Intent ベース検出への抽象化

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が実装されている  
**WHEN** Step 2 の intent 判定ルールを参照する  
**THEN** 「参照・言及（read-only reference）」「設計反映（delta spec 経由）」「直接操作（直接編集・書き換え）」の 3 分類に相当する文言が含まれている  
**AND** 「直接操作」が HIGH severity finding に該当することが明示されている

---

### TC-RRI-004: 既存の Exception 節が維持されている

- **Priority**: must
- **Source**: Task 1, AC[3], req § Exception の維持

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が実装されている  
**WHEN** authority path 言及の除外条件を参照する  
**THEN** policy statement（authority path を forbidden として記述する文脈）が HIGH 対象外であることを示す除外節が存在する  
**AND** 過去 incident citation が HIGH 対象外であることを示す除外節が存在する

---

### TC-RRI-005: Severity Scope Constraint の HIGH 定義が intent 判定ベースに更新されている

- **Priority**: must
- **Source**: Task 2

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が実装されている  
**WHEN** Severity Scope Constraint セクションの HIGH 定義を参照する  
**THEN** 旧文言「the request body directly specifies an authority path (`specrunner/specs/`) as an edit target」が削除されている  
**AND** authority path への直接操作 intent を検出した場合を HIGH に含める文言に置き換えられている

---

## Category: prompt-content — Recommendation

### TC-RRI-006: HIGH finding 検出時の recommendation 文が存在する

- **Priority**: must
- **Source**: Task 3, AC[4]

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が実装されている  
**WHEN** 直接操作 intent を HIGH として報告するルール付近を参照する  
**THEN** spec-merge が delta から baseline を自動更新する旨の guidance が含まれている  
**AND** PR 内では baseline は read-only である旨が含まれている  
**AND** delta spec で Requirement を書き、baseline 状態は AC の assertion で結果検証する旨が含まれている

---

## Category: test-assertion — 既存テスト更新 (TC-RR-011 / TC-RR-012)

### TC-RRI-007: TC-RR-011 が新設計の intent 判定フレーズを assert している

- **Priority**: must
- **Source**: Task 4

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** TC-RR-011 の assert 内容を参照する  
**THEN** `"Authority path co-occurrence"` という旧フレーズの assert が削除されている  
**AND** intent 判定ベースの新しいキーフレーズを assert する内容に置き換えられている  
**AND** `"specrunner/specs/"` と `"HIGH severity finding"` を含む assert は維持されている（またはそれに相当する新フレーズを assert している）

---

### TC-RRI-008: TC-RR-012 が新設計の除外節フレーズを assert している

- **Priority**: must
- **Source**: Task 4

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** TC-RR-012 の assert 内容を参照する  
**THEN** `"referential mentions"` の旧フレーズ assert が、新設計の除外節フレーズに更新されている  
**AND** `"NOT HIGH findings"` の旧フレーズ assert が、新設計の表現に更新されている

---

## Category: test-assertion — 新規テスト (TC-RR-013 / TC-RR-014)

### TC-RRI-009: TC-RR-013 が prompt 内の 3 分類 intent を assert する

- **Priority**: must
- **Source**: Task 5

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** TC-RR-013 を確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が intent 判定（参照・設計反映・直接操作の 3 分類）を含むことを assert するテストケースが存在する  
**AND** そのテストは実 LLM 呼び出しを行わない（static string assertion のみ）

---

### TC-RRI-010: TC-RR-013 が MODIFIED / ADDED の不在を assert する

- **Priority**: must
- **Source**: Task 5, AC[2]

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** TC-RR-013 の negative assertion を確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` に `"MODIFIED"` が Step 2 の検出 verb として含まれないことを assert するテストが存在する  
**AND** `REQUEST_REVIEW_SYSTEM_PROMPT` に `"ADDED"` が Step 2 の検出 verb として含まれないことを assert するテストが存在する

---

### TC-RRI-011: TC-RR-014 が recommendation キーフレーズの存在を assert する

- **Priority**: must
- **Source**: Task 5

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** TC-RR-014 を確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` に spec-merge / read-only / delta spec 経由に相当する recommendation キーフレーズが含まれることを assert するテストケースが存在する

---

### TC-RRI-012: 再現テストが観測ケース風の検出意図カバレッジを確認する

- **Priority**: must
- **Source**: req[5], Task 5

**GIVEN** `tests/unit/command/request-review.test.ts` が更新されている  
**WHEN** 再現テスト（TC-RR-013 または専用テスト）の内容を確認する  
**THEN** 「行番号指定 + 矢印（`L555: A → B`）形式の書き換え指示」「全行 grep 命令」「completeness 要求」等の観測ケース風パターンを、intent 判定ベースのルールが catch できる設計であることを静的に検証できる assertion が存在する  
**AND** 実 LLM 呼び出しは行われない（prompt テキストの static assertion のみ）

---

## Category: delta-spec — request-authoring-guard

### TC-RRI-013: delta spec ファイルが存在する

- **Priority**: must
- **Source**: Task 6, AC[5]

**GIVEN** change folder が実装されている  
**WHEN** `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md` を参照する  
**THEN** ファイルが存在する  
**AND** `### Requirement: Request Review Prompt Authority Path Detection Rule` ヘッダーが含まれている

---

### TC-RRI-014: delta spec の Requirement ヘッダーが baseline と完全一致している

- **Priority**: must
- **Source**: Task 6

**GIVEN** delta spec が作成されている  
**WHEN** delta spec の Requirement ヘッダーを `specrunner/specs/request-authoring-guard/spec.md` の対応するヘッダーと比較する  
**THEN** `### Requirement: Request Review Prompt Authority Path Detection Rule` の文字列が完全一致している（tool が MODIFIED として自動分類できる条件）

---

### TC-RRI-015: delta spec の Scenario が intent 判定ベースで記述されている

- **Priority**: must
- **Source**: Task 6, AC[5]

**GIVEN** delta spec が作成されている  
**WHEN** `Request Review Prompt Authority Path Detection Rule` の Scenario を参照する  
**THEN** 検出ルールが「intent 判定」ベースであることを示す Scenario が含まれている  
**AND** 具体的な edit verb 列挙（`MODIFIED` / `ADDED` / `を更新` / `を作成` 等）が検出条件として Scenario 内に記述されていない  
**AND** referential 除外節が維持されている Scenario が含まれている

---

### TC-RRI-016: delta spec に変更対象外の Requirement が含まれない

- **Priority**: should
- **Source**: Task 6

**GIVEN** delta spec が作成されている  
**WHEN** delta spec の全 Requirement ヘッダーを確認する  
**THEN** `Request Generate Prompt Authority Path Prohibition` が含まれない  
**AND** `Request Scaffold Template Delta Spec Guidance` が含まれない  
**AND** `Request Review Prompt Regression Test` が含まれない

---

## Category: architecture — 設計制約

### TC-RRI-017: 新規 capability が並立して作成されていない

- **Priority**: must
- **Source**: req[3]

**GIVEN** change folder が実装されている  
**WHEN** `specrunner/changes/request-review-detect-baseline-edit-intent/specs/` 配下を確認する  
**THEN** `request-authoring-guard/` のみの delta spec ディレクトリが存在し、新規 capability ディレクトリが作成されていない

---

### TC-RRI-018: baseline spec が PR 内で未変更である

- **Priority**: must
- **Source**: req[3], AC[6]（規律遵守）

**GIVEN** change branch の差分が確認できる状態である  
**WHEN** `specrunner/specs/request-authoring-guard/spec.md` の変更状態を確認する  
**THEN** ファイルに変更が加えられていない（PR 内で read-only が維持されている）

---

## Category: build — typecheck / test

### TC-RRI-019: typecheck が green で通過する

- **Priority**: must
- **Source**: AC[8], Task 7

**GIVEN** すべての変更が実装されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなく正常終了する

---

### TC-RRI-020: test suite が全件 green で通過する

- **Priority**: must
- **Source**: AC[8], Task 7

**GIVEN** すべての変更が実装されている  
**WHEN** `bun run test` を実行する  
**THEN** TC-RR-011, TC-RR-012, TC-RR-013, TC-RR-014 を含む全テストが green で終了する

---

## Summary

| ID | Category | Priority | Source |
|----|----------|----------|--------|
| TC-RRI-001 | prompt-content | must | Task 1, AC[1] |
| TC-RRI-002 | prompt-content | must | Task 1, AC[2] |
| TC-RRI-003 | prompt-content | must | Task 1, design.md |
| TC-RRI-004 | prompt-content | must | Task 1, AC[3] |
| TC-RRI-005 | prompt-content | must | Task 2 |
| TC-RRI-006 | prompt-content | must | Task 3, AC[4] |
| TC-RRI-007 | test-assertion | must | Task 4 |
| TC-RRI-008 | test-assertion | must | Task 4 |
| TC-RRI-009 | test-assertion | must | Task 5 |
| TC-RRI-010 | test-assertion | must | Task 5, AC[2] |
| TC-RRI-011 | test-assertion | must | Task 5 |
| TC-RRI-012 | test-assertion | must | req[5], Task 5 |
| TC-RRI-013 | delta-spec | must | Task 6, AC[5] |
| TC-RRI-014 | delta-spec | must | Task 6 |
| TC-RRI-015 | delta-spec | must | Task 6, AC[5] |
| TC-RRI-016 | delta-spec | should | Task 6 |
| TC-RRI-017 | architecture | must | req[3] |
| TC-RRI-018 | architecture | must | req[3] |
| TC-RRI-019 | build | must | AC[8], Task 7 |
| TC-RRI-020 | build | must | AC[8], Task 7 |

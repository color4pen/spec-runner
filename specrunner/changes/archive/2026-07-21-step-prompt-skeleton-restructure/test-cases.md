# Test Cases: 全 step prompt を 5 部構成骨格に再構成し evidence 規律と原因分類を共通化する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 28
- **Manual**: 0
- **Priority**: must: 17, should: 9, could: 2

---

### TC-001: 各 system prompt 出力が 5 節見出しを含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 agent step system prompt は 5 部構成の共通骨格に従う > Scenario: 各 system prompt 出力が 5 節見出しを含む

---

### TC-002: prompt 出力に独立した stage 表が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline stage の列挙は単一ソース PIPELINE_MAP から供給される > Scenario: prompt 出力に独立した stage 表が存在しない

---

### TC-003: stage 一覧は PIPELINE_MAP を埋め込む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline stage の列挙は単一ソース PIPELINE_MAP から供給される > Scenario: stage 一覧は PIPELINE_MAP を埋め込む

---

### TC-004: 全 agent prompt が EVIDENCE_DISCIPLINE を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: EVIDENCE_DISCIPLINE は全 agent step の system prompt に埋め込まれる > Scenario: 全 agent prompt が EVIDENCE_DISCIPLINE を含む

---

### TC-005: 全 agent prompt が CAUSE_CLASSIFICATION を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 失敗・escalation・decision-needed の報告に原因分類が要求される > Scenario: 全 agent prompt が CAUSE_CLASSIFICATION を含む

---

### TC-006: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: coverage gate 回避禁止は単一ソースから供給される > Scenario: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む

---

### TC-007: prompt 出力に architecture/ 参照が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI 組み込み prompt は repo 固有資源を名指ししない > Scenario: prompt 出力に architecture/ 参照が存在しない

---

### TC-008: rules.ts に空の共通禁止節が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rules.ts は現行 step 集合を反映し空節を持たない > Scenario: rules.ts に空の共通禁止節が存在しない

---

### TC-009: rules.ts の step 列挙が PIPELINE_MAP と一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rules.ts は現行 step 集合を反映し空節を持たない > Scenario: rules.ts の step 列挙が PIPELINE_MAP と一致する

---

### TC-010: 全 producer / fixer prompt が write-set を宣言する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: producer / fixer / judge の Contract 節は write-set を宣言する > Scenario: 全 producer / fixer prompt が write-set を宣言する

---

### TC-011: result template に verdict 導出の判定基準が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: output template は出力の形式のみを所有する > Scenario: result template に verdict 導出の判定基準が存在しない

---

### TC-012: TEST_CASES template に Category / Priority 判定基準表が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: output template は出力の形式のみを所有する > Scenario: TEST_CASES template に Category / Priority 判定基準表が存在しない

---

### TC-013: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: output template は出力の形式のみを所有する > Scenario: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない

---

### TC-014: 判定導出・executor・output gate の既存テストが無改変で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 骨格再構成は routing / gate 挙動を変えない > Scenario: 判定導出・executor・output gate の既存テストが無改変で green

---

### TC-015: judge prompt が severity 定義定数を保持する

**Category**: unit
**Priority**: must
**Source**: design.md > D3: 合成機構は既存 buildSystemPrompt を流用し、共有定数の既存包含を保存する / tasks.md > T-05 Acceptance Criteria

**GIVEN** 6 つの judge step prompt 出力（request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer）を builder 経由で組み立てた最終文字列

**WHEN** 各出力に severity 定義定数が含まれるか検査する

**THEN** request-review 出力は `REQUEST_REVIEW_SEVERITY_DEFINITION` 定数を含み、その他の judge 出力は `SEVERITY_DEFINITION` 定数を含む（verdict-channel-unification.test.ts TC-009 要求を保持）

---

### TC-016: judge prompt が verdict 行の出力を要求しない

**Category**: unit
**Priority**: must
**Source**: design.md > D3: 合成機構は既存 buildSystemPrompt を流用し、共有定数の既存包含を保存する / tasks.md > T-05 Acceptance Criteria

**GIVEN** 6 つの judge step prompt 出力

**WHEN** verdict 行をファイルに書くよう要求するパターン（verdict-channel-unification TC-001 の禁止パターン）を各出力内で検索する

**THEN** いずれの judge prompt 出力にも verdict 行の出力を直接指示するパターンが存在しない

---

### TC-017: producer prompt が COMPLETION_DIRECTIVE を保持する

**Category**: unit
**Priority**: must
**Source**: design.md > D3: 合成機構は既存 buildSystemPrompt を流用し、共有定数の既存包含を保存する / tasks.md > T-03 Acceptance Criteria

**GIVEN** producer 系 prompt 出力（design / test-case-gen / test-materialize / implementer / adr-gen / spec-fixer / code-fixer / build-fixer）を builder 経由で組み立てた最終文字列

**WHEN** 各出力に `COMPLETION_DIRECTIVE` 定数が含まれるか検査する

**THEN** すべての producer prompt 出力が `COMPLETION_DIRECTIVE` 定数を部分文字列として含む（fragment-coverage.test.ts の当該項目を無改変で green に保つ）

---

### TC-018: PIPELINE_MAP が全 16 step を列挙し各 step に一行責務が付く

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `PIPELINE_MAP` 定数の文字列

**WHEN** 16 の step 識別子（request-review / design / spec-review / spec-fixer / test-case-gen / test-materialize / implementer / verification / build-fixer / code-review / code-fixer / custom-reviewer / regression-gate / conformance / adr-gen / pr-create）と各 step に付随するテキストを検査する

**THEN** 16 識別子がすべて PIPELINE_MAP 内に存在し、各 step 行に責務の説明テキストが付いている

---

### TC-019: COVERAGE_GATE_INTEGRITY が 3 つのキーワードを含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `COVERAGE_GATE_INTEGRITY` 定数の文字列

**WHEN** 「テストの削除」「dead code」「coverage 設定」の 3 キーワードの有無を検査する

**THEN** 3 つのキーワードがすべて定数内に存在する

---

### TC-020: rules.ts に手書き件数誤記が存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `RULES_MD_CONTENT` の文字列

**WHEN** 「9 step」「11」等の手書き件数文字列を検索する

**THEN** 手書き件数記述が存在しない（step 列挙は PIPELINE_MAP 定数の埋め込みに置換されている）

---

### TC-021: rules.ts の責任範囲表に欠落していた 5 step が追加されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `RULES_MD_CONTENT` の文字列

**WHEN** request-review / test-materialize / conformance / regression-gate / custom-reviewer の各識別子を責任範囲表の文脈で検索する

**THEN** 5 つの step 識別子がすべて責任範囲表のセクション内に含まれる

---

### TC-022: design prompt が spec-exempt 文言を保持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `DESIGN_SYSTEM_PROMPT` の出力（builder 経由で組み立てた最終文字列）

**WHEN** spec-exempt 関連文言（`type: chore` / `Requirement を捏造しないこと` / `SPEC_EXEMPT_MARKER` の値）の有無を検査する

**THEN** 3 つの文言がすべて保持されており、spec-exempt-prompt.test.ts の当該 assertion が green のまま

---

### TC-023: SPEC_EXEMPT_NOTE が正しい形式に縮小されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `SPEC_EXEMPT_NOTE` の出力（src/templates/step-output-templates.ts）

**WHEN** (a) `SPEC_EXEMPT_MARKER` の有無、(b) 空の `## Requirements` の有無、(c) `SPEC_TEMPLATE` との文字列一致を検査する

**THEN** `SPEC_EXEMPT_MARKER` を含み、空の `## Requirements` を持たず、`SPEC_TEMPLATE` と異なる文字列である

---

### TC-024: initial message に判定基準が含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** 各 step の initial message 出力（design / spec-review / test-case-gen / test-materialize / request-review / code-review / conformance / custom-reviewer / regression-gate 等の builder 経由）

**WHEN** severity 定義・verdict 導出規則・Category / Priority 判定表を示すキーワードを各 initial message 内で検索する

**THEN** いずれの initial message にも判定基準を定義するコンテンツが含まれない（run 固有の束縛のみ）

---

### TC-025: request-generate prompt が既存の生成規律を保持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** `REQUEST_GENERATE_SYSTEM_PROMPT` の出力

**WHEN** request.md 必須セクション列挙と type / adr 推論に関する記述の有無を検査する

**THEN** 既存の生成規律（必須セクション名と type / adr 推論の説明）が 5 節骨格の Method 節内に保持されている

---

### TC-026: code-fixer prompt が Fix 対応方針を Method 節に保持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `CODE_FIXER_SYSTEM_PROMPT` の出力

**WHEN** Fix 対応方針（finding 選別挙動の記述）を Method 節の範囲内で検索する

**THEN** Fix 対応方針の記述が `## Method` 節の配下に存在する（意味・文言は不変）

---

### TC-027: pipeline-map.ts がプロジェクト内 import を持たない leaf module である

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/prompts/pipeline-map.ts` のソースコード

**WHEN** 相対パス（`./` または `../`）を使う import 文を検索する

**THEN** プロジェクト内 import が 0 件であり、leaf module の制約が満たされている

---

### TC-028: drift-guard テストが配列反復で全 prompt を網羅する構造を持つ

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** T-09 で追加された drift-guard テストファイル

**WHEN** テストコードの実装パターンを確認する

**THEN** 全 15 prompt 出力を配列で列挙し各要素に対して反復検査するループ構造を含み、対象配列が 15 prompt すべてを包含している

---

## Result

```yaml
result: completed
total: 28
automated: 28
manual: 0
must: 17
should: 9
could: 2
blocked_reasons: []
```

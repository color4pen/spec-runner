# Test Cases: test-case-gen に繰り返し実行・冪等性の導出軸を追加する

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

- **Total**: 9 cases
- **Automated** (unit/integration): 7
- **Manual**: 2
- **Priority**: must: 7, should: 0, could: 2

---

### TC-001: test-case-gen prompt に導出軸の指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する > Scenario: prompt に導出軸の指示が含まれる

---

### TC-002: 該当成果物がある場合は 2 回目以降を検証する must TC を導出する

**Category**: manual
**Priority**: could
**Source**: spec.md > Requirement: test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する > Scenario: 該当成果物がある場合は 2 回目以降を検証する must TC を導出する

> Note: agent が実際に導出する TC は LLM 実行の領分であり単体テストの対象外（design.md D5 参照）。runtime 挙動の手動確認用。

---

### TC-003: 該当成果物が無い場合は「該当なし」を明示する

**Category**: manual
**Priority**: could
**Source**: spec.md > Requirement: test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する > Scenario: 該当成果物が無い場合は「該当なし」を明示する

> Note: agent が「該当なし」を明示するかは LLM 実行の領分であり単体テストの対象外（design.md D5 参照）。runtime 挙動の手動確認用。

---

### TC-004: request template 出力に繰り返し実行・冪等性のガイダンスが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request template の受け入れ基準ガイダンスが同観点を案内する > Scenario: template 出力にガイダンスが含まれる

---

### TC-005: 既存テストが無変更で green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の test-cases.md 形式・契約を変更しない > Scenario: 既存テストが無変更で green

---

### TC-006: 追記文言が既存の負 assertion に抵触しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: test-case-gen prompt に繰り返し実行・冪等性の導出軸を追加する

**GIVEN** 変更後の `TEST_CASE_GEN_SYSTEM_PROMPT` 文字列
**WHEN** 追記された繰り返し実行・冪等性セクションの文言を検査する
**THEN** `"e2e"` および `` "greps `tests/`" `` がいずれも含まれない（既存 `not.toContain` assertion が引き続き pass する）

---

### TC-007: buildScaffoldTemplate 出力が parseRequestMdContent を pass する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: request template の受け入れ基準ガイダンスに同観点を追記する

**GIVEN** `buildScaffoldTemplate({ title, type, slug })` の出力（`## 受け入れ基準` に繰り返し実行・冪等性ガイダンスを追記した状態）
**WHEN** `parseRequestMdContent(content, "<test>")` に渡す
**THEN** 例外を投げず、セクション順序（`## 背景` → `## 現状コードの前提` → `## 要件` → `## スコープ外` → `## 受け入れ基準`）および必須見出しが不変のまま parse が完了する

---

### TC-008: TEST_CASES_TEMPLATE の機械 parse 形式・TC-ID 契約が不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: 既存契約の不変を確認し、全体検証を green にする

**GIVEN** `src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE`
**WHEN** 本変更後の内容を確認する
**THEN** `### TC-{NNN}` heading 形式、Summary 4 項目、Result YAML キー、must/should/could の意味定義に差分が無い（要件 3 / design.md D4 に準拠）

---

### TC-009: typecheck && test が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: 既存契約の不変を確認し、全体検証を green にする

**GIVEN** 本変更後のコードベース（T-01 の prompt 追記・テスト追加、T-02 の scaffold 追記・テスト追加を含む）
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型チェックおよび全テスト（既存 + 新規追加）が 0 exit で終了する

---

<!-- 繰り返し実行・冪等性の軸（本変更の成果物に対する適用）: 該当なし。
     本変更の成果物は prompt 文字列定数（TEST_CASE_GEN_BASE）と scaffold 生成関数（buildScaffoldTemplate）であり、
     いずれも状態を持たないピュア関数 / 定数であるため、server / handler / 接続 / 初期化 / 資源管理系に該当しない。 -->

## Result

```yaml
result: completed
total: 9
automated: 7
manual: 2
must: 7
should: 0
could: 2
blocked_reasons: []
```

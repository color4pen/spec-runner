# Test Cases: judge resolution semantics

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

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 6, should: 5, could: 0

---

### TC-001: 3 prompt の decision-needed 定義が作成者判断限定になっている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 系 3 prompt の decision-needed 定義は作成者判断に限定される > Scenario: 3 prompt の decision-needed 定義が作成者判断限定になっている

---

### TC-002: request-review / spec-review template の blocking に decision-needed が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: result template の blocking 規則は導出ルールと一致する > Scenario: request-review / spec-review template の blocking に decision-needed が含まれる

---

### TC-003: verdict 行より findings 由来の導出が優先される旨が記載される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: result template の blocking 規則は導出ルールと一致する > Scenario: verdict 行より findings 由来の導出が優先される旨が記載される

---

### TC-004: 規則記述が単一参照元を共有する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: verdict 規則の説明文は単一参照元から共有される > Scenario: 規則記述が単一参照元を共有する

---

### TC-005: 導出テストが回帰なく green を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict 導出ロジックと findings スキーマは不変 > Scenario: 導出テストが回帰なく green を維持する

---

### TC-006: 共有定数モジュールが leaf で import 循環を持たない

**Category**: unit
**Priority**: should
**Source**: design.md > D2, tasks.md > T-01

**GIVEN** verdict 規則 prose の単一参照元モジュールが作成されている
**WHEN** そのモジュールの import 宣言を検査する
**THEN** プロジェクト内他モジュールへの import が存在せず leaf モジュールとなっており、循環依存が生じていない

---

### TC-007: request-review prompt の Verdict Derivation Rules に decision-needed が含まれ旧記述が除去されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の Verdict Derivation Rules セクション
**WHEN** blocking 条件の記述を検査する
**THEN** `decision-needed` が blocking 条件に含まれ、`approve = No HIGH` または `Approval is blocked when HIGH ≥ 1` のような HIGH のみを blocking とする旧記述が存在しない

---

### TC-008: PIPELINE_RULES に decision-needed → escalation が補われている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `fragments.ts` の `PIPELINE_RULES` 文字列
**WHEN** 承認阻止条件の記述を検査する
**THEN** `decision-needed` と `escalation` が承認阻止条件に含まれており、`CRITICAL ≥ 1 または HIGH ≥ 1` のみを列挙する旧記述が残っていない

---

### TC-009: code-review prompt の「verdict line is the authoritative decision」が除去されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `CODE_REVIEW_SYSTEM_PROMPT` 文字列
**WHEN** verdict 権威に関する記述を検査する
**THEN** "verdict line is the authoritative decision" または同等の verdict 行を権威とする記述が存在せず、findings 由来の導出が優先される旨に置き換わっている

---

### TC-010: PIPELINE_RULES 更新後も fragment-coverage テストが green を維持する

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs

**GIVEN** PIPELINE_RULES が共有定数参照に更新された後の状態
**WHEN** `fragment-coverage.test.ts` を実行する
**THEN** 各 prompt が PIPELINE_RULES を含むことを assert するテストが green のまま通過し、文字列変更による assert 崩れが生じていない

---

### TC-011: typecheck && test が全て green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 全 prose 変更（prompt / template / 共有定数モジュール）が適用された後のソースツリー
**WHEN** `typecheck && test` を実行する
**THEN** 型エラーが 0 件、テストスイート全件が green で通過する

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 6
should: 5
could: 0
blocked_reasons: []
```

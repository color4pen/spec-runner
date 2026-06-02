# Test Cases: design は Layer-1（構造が決めない振る舞い）だけを spec に書く

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to delta spec Scenario (specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は delta spec の Scenario。
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
    failed    — delta spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 7
- **Manual**: 1
- **Priority**: must: 5, should: 3, could: 0

---

### TC-001: litmus text present in design system prompt

**Category**: unit
**Priority**: must
**Source**: specs/design-completion/spec.md > Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content > Scenario: litmus text present in design system prompt

---

### TC-002: litmus instructs to omit Layer-0

**Category**: unit
**Priority**: must
**Source**: specs/design-completion/spec.md > Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content > Scenario: litmus instructs to omit Layer-0

---

### TC-003: architecture reference guidance present

**Category**: unit
**Priority**: must
**Source**: specs/design-completion/spec.md > Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content > Scenario: architecture reference guidance present

---

### TC-004: Layer-0 と Layer-1 の具体例が各 1 つ以上含まれている

**Category**: unit
**Priority**: should
**Source**: specs/design-completion/spec.md > Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content

**GIVEN** `DESIGN_BASE` の content を inspect する
**WHEN** `Delta Spec Content Guidance (Layer-1 litmus)` セクションの具体例を確認する
**THEN** Layer-0 の例（構造が強制する振る舞いのため spec に書かない）と Layer-1 の例（intent 由来の選択のため spec に書く）が各 1 つ以上含まれている

---

### TC-005: Content Guidance セクションの配置順序が正しい

**Category**: unit
**Priority**: should
**Source**: specs/design-completion/spec.md > Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content

**GIVEN** `DESIGN_BASE` の文字列を先頭から末尾まで走査する
**WHEN** `Delta Spec Content Guidance (Layer-1 litmus)` セクションの位置を確認する
**THEN** delta spec サブセクション（`### delta spec`）の後、`Delta Spec Format Rules` セクションの前に配置されている

---

### TC-006: typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `DESIGN_BASE` への litmus セクション追加を含む TypeScript ソースが編集済みの状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラー 0 件で正常終了する

---

### TC-007: 既存テストが全て green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 全テストスイートが実行可能な状態
**WHEN** `bun run test` を実行する
**THEN** 既存テストを含む全テストが pass する

---

### TC-008: spec-review で生成 delta spec に Layer-0 混入がない

**Category**: manual
**Priority**: should
**Source**: request.md > 受け入れ基準 2

**GIVEN** litmus 追加後の design step を使い、実際の change に対して design を実行した delta spec がある
**WHEN** 生成された delta spec を spec-review で評価する
**THEN** Requirement / Scenario に構造（型 / FSM / invariant）が強制する Layer-0 振る舞いが含まれない

---

## Result

```yaml
result: completed
total: 8
automated: 7
manual: 1
must: 5
should: 3
could: 0
blocked_reasons: []
```

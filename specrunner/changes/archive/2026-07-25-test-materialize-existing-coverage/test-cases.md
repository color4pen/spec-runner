# Test Cases: manual カテゴリ must TC の coverage 集計除外

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
-->

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 8
- **Manual**: 0
- **Priority**: must: 4, should: 3, could: 1

---

### TC-001: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: manual の must TC を coverage 集計から除外する > Scenario: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない

---

### TC-002: unit / integration の must TC の判定は従来と同一

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: manual の must TC を coverage 集計から除外する > Scenario: unit / integration の must TC の判定は従来と同一

---

### TC-003: prompt が manual TC 対象外の記述を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は manual TC を自動テスト化・トレーサビリティコメントの対象外とする > Scenario: prompt が manual TC 対象外の記述を含む

---

### TC-004: docs が manual 除外規約を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: docs は manual TC の coverage 集計除外を明文化する > Scenario: docs が manual 除外規約を含む

---

### TC-005: bullet 形式と plain 形式の Category: manual が両方とも除外として検出される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `- **Category**: manual`（bullet 形式）を持つ must TC と `**Category**: manual`（plain 形式、先頭 bullet なし）を持つ must TC を両方含む test-cases.md がある
**WHEN** `extractMustTcIds` を実行する
**THEN** いずれの形式の TC も must 集計から除外され、返り値のリストにどちらも含まれない

---

### TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない

**Category**: unit
**Priority**: should
**Source**: design.md > D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む

**GIVEN** `**Priority**: must` かつ `**Category**: manual` を宣言する TC があり、その TC-ID がテストファイルにリテラルとして出現する
**WHEN** `evaluateTestCoverage` を実行する
**THEN** 当該 TC は `foundTcIds` にも `assertionlessTcIds` にも含まれない

---

### TC-007: テンプレート enum 行での誤除外が起きない

**Category**: unit
**Priority**: could
**Source**: design.md > D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む

**GIVEN** test-cases.md の TC section より前（HTML コメントブロック）に `**Category**: unit | integration | manual` というテンプレート enum 行が存在し、TC section 内には `**Category**: unit` かつ `**Priority**: must` の TC がある
**WHEN** `extractMustTcIds` を実行する
**THEN** unit の must TC は除外されず返り値のリストに含まれる（enum 行はコロン直後が `unit` なので manual 正規表現にマッチしない）

---

### TC-008: docs/README.md の test-coverage.md 説明文に manual 除外が反映される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `docs/README.md` に docs/ ファイル一覧が存在する
**WHEN** `test-coverage.md` のエントリ行の説明文を読む
**THEN** manual TC の coverage 集計除外への言及（例: "manual 除外"、"manual TC"、"Category: manual" など）が説明文に含まれる

---

## Result

```yaml
result: completed
total: 8
automated: 8
manual: 0
must: 4
should: 3
could: 1
blocked_reasons: []
```

# Test Cases: TC 分類への gate カテゴリ導入

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (unit / integration, Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名を本文に記録する。

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

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 0
- **Priority**: must: 10, should: 3, could: 0

---

## TC group: test-coverage gate 除外（`extractMustTcIds`）

### TC-001: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する > Scenario: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない

### TC-002: gate must TC が foundTcIds / assertionlessTcIds にも現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する > Scenario: gate must TC が foundTcIds / assertionlessTcIds にも現れない

### TC-003: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する > Scenario: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一

### TC-004: gate を含む enum 行で unit の must TC が誤除外されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する > Scenario: gate を含むテンプレート enum 行で誤除外が起きない

### TC-005: bullet 形式の `**Category**: gate` も plain 形式と同様に除外される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: extractMustTcIds に Category: gate 除外を追加する

**GIVEN** test-cases.md の TC section に `- **Priority**: must` と `- **Category**: gate`（bullet 形式、先頭 `- ` あり）を宣言する TC がある
**WHEN** `extractMustTcIds` を実行する
**THEN** 当該 TC は `mustTcIds` に含まれず、`totalMustTcs` にも数えられない

### TC-006: manual と gate の must TC が共存するとき両方とも除外される

**Category**: unit
**Priority**: should
**Source**: design.md > D1: extractMustTcIds に Category: gate 除外を manual と同型で追加する / tasks.md > T-01

**GIVEN** test-cases.md に `**Category**: manual` かつ `**Priority**: must` の TC と `**Category**: gate` かつ `**Priority**: must` の TC が共存し、さらに `**Category**: unit` かつ `**Priority**: must` の TC が 1 件ある
**WHEN** `extractMustTcIds` を実行する
**THEN** manual の must TC も gate の must TC も返り値に含まれず、unit の must TC のみが返り値に含まれる

---

## TC group: test-case-gen prompt gate contract

### TC-007: test-case-gen prompt に gate 定義・分類規則・GWT 省略規則が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen prompt は gate 分類規則を定義する > Scenario: prompt に gate 定義と分類規則が含まれる

---

## TC group: test-materialize prompt gate contract

### TC-008: test-materialize prompt の Method 節に gate 実体化スキップの記述が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は gate TC を実体化しない > Scenario: prompt に gate 実体化スキップの記述が含まれる

### TC-009: test-materialize prompt の Contract 節にツールチェーン再実行禁止の記述が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt はツールチェーン再実行をテスト本体として書くことを禁止する > Scenario: prompt にツールチェーン再実行禁止の記述が含まれる

---

## TC group: template / docs gate 追随

### TC-010: TEST_CASES_TEMPLATE の Category 行が gate を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: template / docs は gate 分類を明文化する > Scenario: TEST_CASES_TEMPLATE の Category 行が gate を含む

### TC-011: docs/test-coverage.md が gate 除外規約を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: template / docs は gate 分類を明文化する > Scenario: docs が gate 除外規約を含む

### TC-012: docs/README.md の test-coverage.md 説明行に gate 除外が反映されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: template / docs を gate を含む形に追随する

**GIVEN** `docs/README.md` の docs 一覧に `test-coverage.md` の説明行がある
**WHEN** その説明行を確認する
**THEN** 説明文に gate 除外（または manual と gate の両方の除外）が反映されており、既存の `test-coverage.md` 行エントリが削除されていない

---

## TC group: gate（verification phase 管轄）

### TC-013: typecheck && test が green かつ既存テストが無改変で green

**Category**: gate
**Priority**: must
**Source**: request.md > 受け入れ基準

検証 phase: `typecheck`, `test`

---

## 繰り返し実行・冪等性の軸

該当なし

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 0
must: 10
should: 3
could: 0
blocked_reasons: []
```

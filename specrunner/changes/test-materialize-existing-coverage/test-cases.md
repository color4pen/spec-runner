# Test Cases: 既存テストによる must TC 充足のトレーサビリティコメント規約

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

- **Total**: 10 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 7, should: 2, could: 1

---

### TC-001: prompt が既存テスト充足の正規手順を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する > Scenario: prompt が既存テスト充足の正規手順を含む

---

### TC-002: prompt がリポジトリ固有のテストパスを名指ししない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する > Scenario: prompt がリポジトリ固有のテストパスを名指ししない

---

### TC-003: prompt の 5 節骨格が維持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する > Scenario: prompt の 5 節骨格が維持される

---

### TC-004: コメント形式のみの TC-ID + 同一ファイルに assertion → passed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage はコメント形式のみで出現する TC-ID を充足として扱う > Scenario: コメント形式のみの TC-ID + 同一ファイルに assertion → passed

---

### TC-005: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage はコメント形式のみで出現する TC-ID を充足として扱う > Scenario: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）

---

### TC-006: docs が走査規約とトレーサビリティ規約を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: docs に走査規約とトレーサビリティ規約を明文化する > Scenario: docs が走査規約とトレーサビリティ規約を含む

---

### TC-007: docs/README.md のファイル一覧に test-coverage.md が掲載される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `docs/README.md` が存在し、変更後の `docs/test-coverage.md` が新規作成されている
**WHEN** `docs/README.md` の内容を読む
**THEN** ファイル一覧に `test-coverage.md` のエントリが存在する

---

### TC-008: guarantees.md の版号・保証番号が変更されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 変更前の `docs/guarantees.md` の版号（例: G1）および保証番号（G1-1〜G1-6）
**WHEN** 変更後の `docs/guarantees.md` の内容を読む
**THEN** 版号と保証番号 G1-1〜G1-6 が変更前と同一であり、新たな保証番号の追加もない

---

### TC-009: test-coverage.ts 自体は無変更

**Category**: unit
**Priority**: should
**Source**: tasks.md > 全体制約 / T-01

**GIVEN** `src/core/verification/test-coverage.ts` の変更前の内容
**WHEN** 本変更を適用した後のファイル内容を読む
**THEN** `src/core/verification/test-coverage.ts` の内容が変更前と一致する（検査ロジックが改変されていない）

---

### TC-010: 新規 coverage fixture テストは既存 test-coverage.test.ts とは別ファイルに配置される

**Category**: unit
**Priority**: could
**Source**: tasks.md > 全体制約

**GIVEN** コメント形式 TC-ID カバレッジを固定する新規テストが追加される
**WHEN** テストファイルの配置を確認する
**THEN** 新規テストは `tests/unit/core/verification/test-coverage.test.ts` とは別の新規ファイルに配置されており、既存の `test-coverage.test.ts` は無改変である

---

## Result

```yaml
result: failed
total: 10
automated: 10
manual: 0
must: 7
should: 2
could: 1
blocked_reasons: []
```

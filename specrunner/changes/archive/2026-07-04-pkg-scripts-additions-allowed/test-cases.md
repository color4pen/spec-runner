# Test Cases: package.json scripts integrity — 新規 script 追加を tampering としない

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

- **Total**: 10 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 5, should: 5, could: 0

---

### TC-001: 空の baseline に新規 script key を追加しても tampering にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Scripts integrity is evaluated per baseline key > Scenario: adding a new script key to an empty baseline is allowed

---

### TC-002: 非空の baseline に新規 script key を追加しても tampering にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Scripts integrity is evaluated per baseline key > Scenario: adding a new script key to a non-empty baseline is allowed

---

### TC-003: 既存 script key の値を変更すると tampering になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Scripts integrity is evaluated per baseline key > Scenario: changing an existing script value is tampering

---

### TC-004: 既存 script key を削除すると tampering になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Scripts integrity is evaluated per baseline key > Scenario: deleting an existing script key is tampering

---

### TC-005: base branch に baseline package.json が存在しない場合は gate を skip する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing integrity gate skip and scope behavior is preserved > Scenario: baseline package.json absent on base branch skips the gate

---

### TC-006: key 順序が異なるだけで値が同一なら tampering にならない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Existing integrity gate skip and scope behavior is preserved > Scenario: reordered script keys with identical values are not tampering

---

### TC-007: 追加と値変更が混在する場合、tampering になり diff には変更 key のみが現れる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Tampering diff surfaces only the offending keys > Scenario: a mixed change surfaces only the changed key, not the added key

---

### TC-008: prototype プロパティ名（`toString` / `constructor`）を script key として持つ baseline でも削除を誤検出しない

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs（`hasOwnProperty` による own property 判定）

**GIVEN** baseline scripts に `{ "toString": "echo baseline" }` が含まれる
**AND** current scripts も同じ `{ "toString": "echo baseline" }` を持つ（追加も削除もない）
**WHEN** phase-fallback verification integrity gate が実行される
**THEN** `tampered: false` が返される（prototype プロパティ名との衝突で誤って削除と判定されない）

---

### TC-009: worktree の package.json が存在しない場合は gate を skip する

**Category**: unit
**Priority**: should
**Source**: design.md > Context（worktree に package.json 不在の skip）/ tasks.md > T-01

**GIVEN** base branch の baseline `package.json` は取得できる
**AND** worktree に `package.json` が存在しない
**WHEN** phase-fallback verification integrity gate が実行される
**THEN** `{ tampered: false }` を返し、gate を skip する（phase loop に進む）

---

### TC-010: baseline または current の package.json が JSON パース不能な場合は gate を skip する

**Category**: unit
**Priority**: should
**Source**: design.md > Context（JSON パース失敗時の skip）/ tasks.md > T-01

**GIVEN** `git show` が baseline として不正な JSON 文字列（例: `{ broken json`）を返す
**WHEN** phase-fallback verification integrity gate が実行される
**THEN** `{ tampered: false }` を返し、gate を skip する（JSON パース失敗は build phase に委ねる）

---

## Result

```yaml
result: completed
total: 10
automated: 10
manual: 0
must: 5
should: 5
could: 0
blocked_reasons: []
```

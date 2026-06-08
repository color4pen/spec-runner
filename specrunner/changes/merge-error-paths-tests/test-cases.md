# Test Cases:

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

- **Total**: 4 cases
- **Automated** (unit/integration): 4
- **Manual**: 0
- **Priority**: must: 4, should: 0, could: 0

---

### TC-001: JobStateStore.list throw → exitCode 2

**Category**: unit
**Priority**: must
**Source**: request.md — 背景 #1 / 受け入れ基準

**GIVEN** `JobStateStore.list` が Error を throw するようにモックされている
**WHEN** `runMergeThenArchive` を呼ぶ
**THEN** `{ exitCode: 2, message: <thrown error message> }` が返る（escalation ではない）

---

### TC-002: 初回 getPullRequest throw → exitCode 1 (escalation)

**Category**: unit
**Priority**: must
**Source**: request.md — 背景 #2 / 受け入れ基準

**GIVEN** `JobStateStore.list` が有効な job state を返し、Step 2 の初回 `getPullRequest` が Error を throw するようにモックされている
**WHEN** `runMergeThenArchive` を呼ぶ
**THEN** `exitCode: 1` かつ `escalation` が `"PR status check (getPullRequest)"` を含む

---

### TC-003: mergePullRequest throw → exitCode 1 (escalation)

**Category**: unit
**Priority**: must
**Source**: request.md — 背景 #3 / 受け入れ基準

**GIVEN** `JobStateStore.list` が有効な job state を返し、`getPullRequest` が OPEN/CLEAN/MERGEABLE な PR を返し、`getCheckStatus` が success を返し、`mergePullRequest` が Error を throw するようにモックされている
**WHEN** `runMergeThenArchive` を呼ぶ
**THEN** `exitCode: 1` かつ `escalation` が `"squash merge (REST API)"` を含む

---

### TC-004: mergePullRequest returns { merged: false } → exitCode 1 (escalation)

**Category**: unit
**Priority**: must
**Source**: request.md — 背景 #4 / 受け入れ基準

**GIVEN** `JobStateStore.list` が有効な job state を返し、`getPullRequest` が OPEN/CLEAN/MERGEABLE な PR を返し、`getCheckStatus` が success を返し、`mergePullRequest` が `{ merged: false, message: "Method Not Allowed" }` を返すようにモックされている
**WHEN** `runMergeThenArchive` を呼ぶ
**THEN** `exitCode: 1` かつ `escalation` が `"squash merge (REST API)"` を含む

---

## Result

```yaml
result: completed
total: 4
automated: 4
manual: 0
must: 4
should: 0
could: 0
blocked_reasons: []
```

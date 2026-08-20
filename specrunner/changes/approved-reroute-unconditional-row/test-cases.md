# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 5 cases
- **Automated** (unit/integration): 4
- **Manual**: 0
- **Priority**: must: 5, should: 0, could: 0

---

### TC-001: spec-review approved with spec-fixer budget exhausted routes to implementer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: T-03 reroute shall target only the unconditional approved row and exclude only the budget-exhausted fixer > Scenario: spec-review approved with spec-fixer budget exhausted routes to implementer

---

### TC-002: SPEC_REVIEW_RETRIES_EXHAUSTED が reroute 成功時に出ない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: T-03 shall not halt with SPEC_REVIEW_RETRIES_EXHAUSTED when a valid unconditional approved row exists > Scenario: no SPEC_REVIEW_RETRIES_EXHAUSTED when reroute succeeds

---

### TC-003: code-review approved with code-fixer budget exhausted が conformance へ到達（regression）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: T-03 reroute for code-review (existing behavior) shall remain unchanged > Scenario: code-review approved with code-fixer budget exhausted still routes to conformance

---

### TC-004: 旧 cleanTransition 探索条件に戻すと TC-017 が red になる（破壊確認）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: spec-fixer 版再現テスト (TC-017) の追加

**GIVEN** TC-017 の cleanTransition 探索を `(!t.when || t.when(state))` + `!fixerNamesForReroute.has(t.to)` の旧条件に差し戻す
**WHEN** TC-017 のテストを実行する
**THEN** result.status が `"awaiting-resume"` となり `SPEC_REVIEW_RETRIES_EXHAUSTED` エラーが出て TC-017 が red になる

---

### TC-005: typecheck / test 全 green（gate）

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04: 通し確認

`bun run typecheck`、`bun run test` の両コマンドが exit code 0 で完了すること。既存 TC-001/TC-014/TC-016 を含む全テストが green であること。

---

## Result

```yaml
result: completed
total: 5
automated: 4
manual: 0
must: 5
should: 0
could: 0
blocked_reasons: []
```

# Test Cases: issue-target 層の新設 — start 面の移設・core→cli 解消・Development リンク登録

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

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 20, should: 1, could: 0

---

## Group 1: issue-target 層の cli 非依存

### TC-001: no cli import exists in issue-target

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: no cli import exists in issue-target

### TC-002: start primitive is injected, not imported

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: start primitive is injected, not imported

---

## Group 2: 移設による挙動保存

### TC-003: writeDraft precedes start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: writeDraft precedes start

### TC-004: occupancy error propagates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: occupancy error propagates

---

## Group 3: 3 経路の issue-target route と Development リンク登録

### TC-005: positional + --issue routes through issue-target

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: positional + --issue routes through issue-target

### TC-006: each route fires the link registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: each route fires the link registration

### TC-007: inbox-origin start still passes inboxOrigin

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: inbox-origin start still passes inboxOrigin

---

## Group 4: 同一 immutable base OID の保証

### TC-008: base OID resolved once and shared

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: linked branch and local feature branch use the same immutable base OID > Scenario: base OID resolved once and shared

---

## Group 5: リンク登録の順序と best-effort

### TC-009: worktree failure skips link registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: worktree failure skips link registration

### TC-010: registration failure does not stop start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration failure does not stop start

### TC-011: registration precedes bootstrap commit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration precedes bootstrap commit

### TC-012: no-worktree route fires link registration after branch creation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: no-worktree route fires link registration after branch creation

---

## Group 6: branch 名 builder の単一定義化

### TC-013: construction sites converge on the builder

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: construction sites converge on the builder

### TC-014: linked branch name equals local branch name

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: linked branch name equals local branch name

---

## Group 7: port 拡張と GraphQL adapter

### TC-015: getIssue returns nodeId

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: getIssue returns nodeId

### TC-016: createLinkedBranch posts the GraphQL mutation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch posts the GraphQL mutation

### TC-017: createLinkedBranch fails closed at the adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch fails closed at the adapter

### TC-018: GraphQL endpoint is derived correctly for github.com and GHES

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: GraphQL endpoint is derived correctly for github.com and GHES

---

## Group 8: 挙動保存の追加検証（tasks.md 受け入れ基準由来）

### TC-019: buildFeatureBranchName returns correct branch name for each type

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` が呼ばれる
**WHEN** 関数が branch 名を構成する
**THEN** `"fix/my-slug-abcdef01"` を返す（bug-fix の prefix は `"fix/"` であり `"feat/"` ではない）

### TC-020: inbox existing tests remain green with nodeId mock addition only

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `tests/unit/inbox/run-inbox-inbox-origin.test.ts` の挙動 assert が無改変のまま
**WHEN** port 型拡張（`getIssue` の `nodeId` 追加）に伴い mock リテラルへ `nodeId` フィールドが追加される
**THEN** テストが green を維持する（変更は `nodeId` フィールドの追加のみ許可、挙動 assert は無改変）

### TC-021: architecture test stays green without new allowlist entries

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

`bun run test -- tests/unit/architecture/` を実行し、`arch-allowlist.ts` に差分なく green であることを確認する。

---

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 20
should: 1
could: 0
blocked_reasons: []
```

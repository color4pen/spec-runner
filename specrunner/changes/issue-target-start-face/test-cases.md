# Test Cases: issue-target 層の新設 — start 面

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 21, should: 1, could: 0

---

## T-01: branch 名 builder

### TC-001: no cli import exists in issue-target

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: no cli import exists in issue-target

### TC-002: start primitive is injected, not imported

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: start primitive is injected, not imported

### TC-017: buildFeatureBranchName returns correct prefix per type

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `buildFeatureBranchName` is called with type `"bug-fix"`, slug `"my-slug"`, and jobId `"abcdef0123"`
**WHEN** the function executes
**THEN** it returns `"fix/my-slug-abcdef01"` (bug-fix uses branchPrefix `"fix/"`, not `"feat/"`)

---

## T-02: port 拡張と GraphQL adapter

### TC-014: getIssue returns nodeId

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: getIssue returns nodeId

### TC-015: createLinkedBranch posts the GraphQL mutation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch posts the GraphQL mutation

### TC-016: createLinkedBranch fails closed at the adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch fails closed at the adapter

### TC-023: GraphQL endpoint derivation covers github.com and GHES

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** REST base URLs `"https://api.github.com"` and `"https://HOST/api/v3"`
**WHEN** the adapter derives the GraphQL endpoint from each
**THEN** `"https://api.github.com"` → `"https://api.github.com/graphql"` and `"https://HOST/api/v3"` → `"https://HOST/api/graphql"`

---

## T-03: issue-target 層の新設と start 面の移設

### TC-003: writeDraft precedes start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: writeDraft precedes start

### TC-004: occupancy error propagates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: occupancy error propagates

### TC-009: worktree failure skips link registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: worktree failure skips link registration

### TC-010: registration failure does not stop start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration failure does not stop start

### TC-019: link registration failure emits warning via logger seam without re-throwing

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** worktree creation succeeds but `createLinkedBranch` throws
**WHEN** the link registrar callback is invoked
**THEN** a warning is written through the logger seam (`stderrWrite`) and the error is not re-thrown (the callback resolves, not rejects)

---

## T-04: リンク登録 callback の配線と base OID 固定

### TC-008: base OID resolved once and shared

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: linked branch and local feature branch use the same immutable base OID > Scenario: base OID resolved once and shared

### TC-011: registration precedes bootstrap commit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration precedes bootstrap commit

---

## T-05: 3 経路の issue-target route 配線

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

### TC-012: construction sites converge on the builder

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: construction sites converge on the builder

### TC-013: linked branch name equals local branch name

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: linked branch name equals local branch name

---

## T-07: 全体検証（gate）

### TC-020: architecture tests pass without new allowlist entries

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

`bun run test tests/unit/architecture/` が green であること。`tests/unit/architecture/arch-allowlist.ts` に差分が無いこと（grep / git diff で確認）。

### TC-021: typecheck passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

`bun run typecheck` が green であること。

### TC-022: full test suite passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

`bun run test` が green であること。

---

## Result

```yaml
result: completed
total: 22
automated: 19
manual: 0
must: 21
should: 1
could: 0
blocked_reasons: []
```

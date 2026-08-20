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

- **Total**: 25 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 24, should: 1, could: 0

---

### TC-001: no cli import exists in issue-target

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: no cli import exists in issue-target

verification phase: `grep -rn "cli/" src/core/issue-target/` が 0 件（`tests/unit/architecture/module-boundary.test.ts` が構造検査として pin する）

---

### TC-002: start primitive is injected, not imported

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-target layer must not depend on the cli layer > Scenario: start primitive is injected, not imported

---

### TC-003: writeDraft precedes start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: writeDraft precedes start

---

### TC-004: occupancy error propagates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: relocation preserves the issue-body start contract > Scenario: occupancy error propagates

---

### TC-005: positional + --issue routes through issue-target

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: positional + --issue routes through issue-target

---

### TC-006: each route fires the link registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: each route fires the link registration

---

### TC-007: inbox-origin start still passes inboxOrigin

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: all issue-linked start routes go through issue-target and register a Development linked branch > Scenario: inbox-origin start still passes inboxOrigin

---

### TC-008: base OID resolved once and shared

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: linked branch and local feature branch use the same immutable base OID > Scenario: base OID resolved once and shared

---

### TC-009: worktree failure skips link registration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: worktree failure skips link registration

---

### TC-010: registration failure does not stop start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration failure does not stop start

---

### TC-011: registration precedes bootstrap commit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: registration precedes bootstrap commit

---

### TC-012: construction sites converge on the builder

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: construction sites converge on the builder

verification phase: structural grep で `pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts` の 3 箇所が `buildFeatureBranchName` を呼ぶことを確認（`tests/unit/architecture/` または grep による）

---

### TC-013: linked branch name equals local branch name

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch name is constructed by a single shared builder > Scenario: linked branch name equals local branch name

---

### TC-014: getIssue returns nodeId

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: getIssue returns nodeId

---

### TC-015: createLinkedBranch posts the GraphQL mutation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch posts the GraphQL mutation

---

### TC-016: createLinkedBranch fails closed at the adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available > Scenario: createLinkedBranch fails closed at the adapter

---

### TC-017: buildFeatureBranchName returns the correct string for known inputs

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: branch 名 builder の単一定義化 > Acceptance Criteria

**GIVEN** `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` is called
**WHEN** the builder constructs the branch name
**THEN** the result equals `"feat/my-slug-abcdef01"` (prefix from `getBranchPrefix("bug-fix")`, slug verbatim, first 8 chars of jobId)

---

### TC-018: inline branch name construction is absent from the codebase

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01: branch 名 builder の単一定義化 > Acceptance Criteria

verification phase: `grep -rn "slice(0, 8)" src/core/command/pipeline-run.ts src/core/step/design.ts src/core/step/commit-orchestrator.ts` が 0 件（インライン `${getBranchPrefix(...)}...slice(0, 8)` 構成が repo から消えていることの確認）

---

### TC-019: GraphQL endpoint derivation for api.github.com

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: port 拡張と GraphQL adapter > Acceptance Criteria

**GIVEN** the REST base URL is `https://api.github.com`
**WHEN** the internal GraphQL endpoint is derived by the adapter
**THEN** the derived URL is `https://api.github.com/graphql`

---

### TC-020: GraphQL endpoint derivation for GHES

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: port 拡張と GraphQL adapter > Acceptance Criteria

**GIVEN** the REST base URL is `https://HOST/api/v3`
**WHEN** the internal GraphQL endpoint is derived by the adapter
**THEN** the derived URL is `https://HOST/api/graphql` (`/v3` を `/graphql` に置換)

---

### TC-021: no-worktree arm fires the link callback with a fixed HEAD OID

**Category**: unit
**Priority**: should
**Source**: design.md > D8: positional + `--issue` の route と no-worktree

**GIVEN** an issue-linked start runs via the no-worktree path (`setupWorkspaceNoWorktree`)
**WHEN** `git checkout -b <branchName>` succeeds
**THEN** `onFeatureBranchCreated(headOid, branchName)` is called with the OID obtained from `git rev-parse HEAD` before checkout, and `headOid` is the same value used for both the checkout base and the callback argument

---

### TC-022: run-inbox-inbox-origin test passes without modification

**Category**: unit
**Priority**: must
**Source**: design.md > D2: core→cli 依存の解消 — start primitive の注入

**GIVEN** `tests/unit/inbox/run-inbox-inbox-origin.test.ts` is unmodified and `vi.mock("../../../src/cli/run.js")` pins the inbox default startJob → `runRunCore({ inboxOrigin: true })` path
**WHEN** the inbox test suite runs after the relocation
**THEN** the test passes green (the default startJob effect still reaches `cli/run.js` via a dynamic import inside the inbox effect, not via issue-target)

---

### TC-023: bun run typecheck passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07: 全体検証 > Acceptance Criteria

verification phase: `bun run typecheck`（`getIssue` 返り値型拡張が既存 caller を壊さないことを含む）

---

### TC-024: bun run test passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07: 全体検証 > Acceptance Criteria

verification phase: `bun run test`

---

### TC-025: architecture tests pass with no new allowlist entries

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07: 全体検証 > Acceptance Criteria

verification phase: `tests/unit/architecture/` が green かつ `tests/unit/architecture/arch-allowlist.ts` に差分が無い

---

## Result

```yaml
result: completed
total: 25
automated: 25
manual: 0
must: 24
should: 1
could: 0
blocked_reasons: []
```

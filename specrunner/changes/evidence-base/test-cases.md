# Test Cases: Evidence Base for bite-evidence

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
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration/gate): 15
- **Manual**: 0
- **Priority**: must: 13, should: 2, could: 0

---

### TC-001: Re-run shape earns assurance instead of deferring

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Re-run shape earns assurance instead of deferring

---

### TC-002: Job base is identical on first run and on resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Job base is identical on first run and on resume

---

### TC-003: Adopted operator commit is included in the candidate

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits > Scenario: Adopted operator commit is included in the candidate

---

### TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape

---

### TC-005: Archive floor is fail-closed when the Evidence Base reference is absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor is fail-closed when the Evidence Base reference is absent

---

### TC-006: Non-forward type still defers

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Non-forward type still defers

---

### TC-007: Tamper mismatch still fails

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Tamper mismatch still fails

---

### TC-008: Unavailable runtime still defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Unavailable runtime still defers

`runTestsOnSynthesizedTree` returning `unavailable` (managed runtime or `scopedTestCommand` unset) must route to `strategy-deferred`, mirroring the existing `runTestsAtCommit` contract for the new method.

---

### TC-009: Absent HEAD OID defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Absent HEAD OID defers

---

### TC-010: `resolveEvidenceBaseRev` returns a stable first-parent ref; null for an empty ledger

**Category**: unit
**Priority**: must
**Source**: design.md > D1: Job base = first parent of the first synthesized commit / tasks.md > T-02

**GIVEN** a job state whose `synthesizedCommits` ledger contains at least one entry (the bootstrap commit OID)
**AND** a second job state that shares the same `synthesizedCommits[0]` but has additional test-materialize, implementer, and operator-adopted commits appended to the ledger (a resumed / re-run state)
**WHEN** `resolveEvidenceBaseRev` is called with each state
**THEN** both calls return the identical rev expression `"<synthesizedCommits[0]>^"` (first parent of the bootstrap commit)
**AND** when called with a state whose `synthesizedCommits` is absent or empty, returns `null`

---

### TC-011: `runTestsOnSynthesizedTree` runs red on a base tree lacking implementation; cleans up worktree and symlink; non-existent rev returns unavailable

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a throwaway git repo with a base commit containing only non-implementation source files (no test target)
**AND** a HEAD commit that adds the implementation the materialized test file depends on
**AND** materialized test files whose content at HEAD imports that implementation (causing test failure when the implementation is absent from the tree)
**WHEN** `runTestsOnSynthesizedTree(baseRev, testFiles, overlayFromOid=headOid, cwd, config)` is called
**THEN** the result has `kind: "red"` (tests fail on the base tree because implementation is absent)
**AND** after the call completes (regardless of result kind), the temporary detached worktree and the `node_modules` symlink inside it are removed
**AND** calling `runTestsOnSynthesizedTree` with a non-existent `baseRev` returns `{ kind: "unavailable", ... }` without throwing

---

### TC-012: `runTestsOnSynthesizedTree` managed runtime returns unavailable; source node_modules is not deleted

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D2 (Managed / capability)

**GIVEN** a `ManagedRuntime` instance
**WHEN** `runTestsOnSynthesizedTree` is called with any arguments
**THEN** returns `{ kind: "unavailable", reason: "managed runtime has no local worktree for runTestsOnSynthesizedTree" }` immediately
**AND** the caller's `node_modules` directory is not touched during any cleanup path in `LocalRuntime.runTestsOnSynthesizedTree` (the `finally` block removes only the temporary worktree's own symlink, not the source `node_modules`)

---

### TC-013: Gate hollow test (Evidence Base green) still yields `failed`

**Category**: unit
**Priority**: must
**Source**: design.md > D7 (Update — gate, TC-008 strip-test-authority) / tasks.md > T-05

**GIVEN** a gate invoked with a forward-type job, a valid Evidence Base reference, and a resolvable HEAD OID
**AND** the materialized test files, when run on the Evidence Base via `runTestsOnSynthesizedTree`, **pass** (hollow — the test does not require an implementation change to pass)
**WHEN** the bite-evidence gate runs
**THEN** the verdict is `failed`
**AND** each `BiteEvidenceRecord` shows `baseResult: "green"`

---

### TC-014: Structural removal of `detectBaseImplementationContamination` is verified by typecheck — no grep-based runtime test is needed

**Category**: gate
**Priority**: must
**Source**: design.md > D7 (TC-014 verification mechanism) / tasks.md > T-02 Acceptance Criteria

Verification phase: **T-06** (`bun run typecheck`).

`detectBaseImplementationContamination` and its ponytail marker are deleted from `oids.ts`. Any surviving import of the symbol — in `gate.ts`, `achieved-assurance.ts`, or elsewhere — is a TypeScript compilation error caught by `bun run typecheck`. Typecheck green is the complete and sufficient gate for this structural removal.

No separate runtime grep-based assertion is added. Grep-based tests would be redundant with the compile-time check, fragile against refactored import paths, and harder to maintain than the compile-time guarantee that already exists.

---

### TC-015: `typecheck && test` green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

Verification phase: **T-06** (`bun run typecheck && bun run test`).

All changes in T-01 through T-05 must leave the full build and test suite green. Only the files enumerated in design D7 are modified; every other test file is unchanged and passes without modification.

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 13
should: 2
could: 0
blocked_reasons: []
```

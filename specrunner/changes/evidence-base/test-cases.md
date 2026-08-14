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

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 16, should: 1, could: 0

---

## Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base

### TC-001: Re-run shape earns assurance instead of deferring

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Re-run shape earns assurance instead of deferring

### TC-002: Job base is identical on first run and on resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Job base is identical on first run and on resume

---

## Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits

### TC-003: Adopted operator commit is included in the candidate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits > Scenario: Adopted operator commit is included in the candidate

---

## Requirement: The chronology-based contamination machinery SHALL be removed

### TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape

### TC-005: Archive floor is fail-closed when the Evidence Base reference is absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor is fail-closed when the Evidence Base reference is absent

---

## Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts

### TC-006: Non-forward type still defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Non-forward type still defers

### TC-007: Tamper mismatch still fails

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Tamper mismatch still fails

### TC-008: Unavailable runtime still defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Unavailable runtime still defers

### TC-009: Absent Evidence Base reference defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Absent Evidence Base reference defers

### TC-010: Absent HEAD OID defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Absent HEAD OID defers

---

## Design and implementation coverage

### TC-011: resolveEvidenceBaseRev returns null for an empty synthesizedCommits ledger

**Category**: unit
**Priority**: must
**Source**: design.md > D1

**GIVEN** a job state where `synthesizedCommits` is either absent or an empty array
**WHEN** `resolveEvidenceBaseRev(state)` is called
**THEN** it returns `null` (no I/O performed, pure function)

### TC-012: runTestsOnSynthesizedTree produces a red result when the base tree lacks the implementation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a throwaway git repo with a base commit that contains only test files (no implementation)
**And** the overlay source OID points to a commit whose test files import a module not present in the base tree
**WHEN** `runTestsOnSynthesizedTree(baseRev, overlayFiles, overlaySourceOid, cwd, config)` is called
**THEN** the result is `{ kind: "red" }` (tests fail because the implementation is absent from the base tree)

### TC-013: runTestsOnSynthesizedTree removes the detached worktree and node_modules symlink after the run

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** a throwaway git repo where `runTestsOnSynthesizedTree` was called and completed (pass or fail)
**WHEN** the call returns
**THEN** the temporary detached worktree directory no longer exists on disk
**And** the `node_modules` symlink inside it is also removed
**And** the source `node_modules` directory in `cwd` is unmodified

### TC-014: runTestsOnSynthesizedTree returns unavailable and never throws for a non-existent baseRev

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a `baseRev` value that does not resolve to any commit in the local git repository
**WHEN** `runTestsOnSynthesizedTree` is called
**THEN** it returns `{ kind: "unavailable", reason: <string> }` without throwing
**And** no orphaned worktree or symlink is left on disk

### TC-015: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a `ManagedRuntime` instance (which has no local worktree)
**WHEN** `runTestsOnSynthesizedTree` is called with any arguments
**THEN** it returns `{ kind: "unavailable", reason: <string> }` without throwing

---

## Gate checks (verification phase)

### TC-016: detectBaseImplementationContamination is structurally absent after the change

**Category**: gate
**Priority**: must
**Source**: design.md > D7 / tasks.md > T-02 / T-06

Verification: `bun run typecheck`. Because `detectBaseImplementationContamination` is deleted from `oids.ts` and its import removed from `gate.ts` and `achieved-assurance.ts`, any surviving call site or import is a TypeScript compile error. A green `typecheck` run is the complete and sufficient gate for this structural removal.

### TC-017: Full typecheck and test suite is green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

Verification: `bun run typecheck && bun run test`. All existing tests outside the D7-enumerated surface remain unchanged and green; the D7-enumerated tests are updated to the new mechanism and also green.

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 0
must: 16
should: 1
could: 0
blocked_reasons: []
```

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
- **Priority**: must: 17, should: 0, could: 0

---

### TC-001: Re-run shape earns assurance instead of deferring

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Re-run shape earns assurance instead of deferring

### TC-002: Job base is identical on first run and on resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Job base is identical on first run and on resume

### TC-003: Adopted operator commit is included in the candidate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits > Scenario: Adopted operator commit is included in the candidate

### TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape

### TC-005: Archive floor is fail-closed when the Evidence Base reference is absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor is fail-closed when the Evidence Base reference is absent

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

### TC-011: runTestsOnSynthesizedTree — candidate test overlay on base tree lacking implementation runs red

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a throwaway git repository where the base tree contains no implementation of the module under test
**AND** the overlay-source OID provides a test file whose content imports and exercises that missing module
**WHEN** `runTestsOnSynthesizedTree(baseRev, [testFilePath], overlaySourceOid, cwd, config)` is called
**THEN** the result has `kind: "red"` (tests fail because the implementation is absent from the base tree)

### TC-012: runTestsOnSynthesizedTree — detached worktree and node_modules symlink are cleaned up after the run

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a valid call to `runTestsOnSynthesizedTree` with an existing `baseRev` and overlay
**WHEN** the method completes (whether the result is red, green, or unavailable)
**THEN** the detached worktree directory no longer exists on the filesystem
**AND** the `node_modules` symlink that was created inside it is also removed

### TC-013: runTestsOnSynthesizedTree — non-existent baseRev returns unavailable without throwing

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a `baseRev` that does not exist in the repository
**WHEN** `runTestsOnSynthesizedTree` is called with that revision
**THEN** the result has `kind: "unavailable"`
**AND** no exception is thrown by the method

### TC-014: runTestsOnSynthesizedTree — source node_modules directory is not deleted

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a valid call to `runTestsOnSynthesizedTree` with an existing `<cwd>/node_modules`
**WHEN** the method completes and cleans up the detached worktree
**THEN** `<cwd>/node_modules` still exists (only the symlink inside the detached worktree is removed, not the source directory)

### TC-015: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a `ManagedRuntime` instance
**WHEN** `runTestsOnSynthesizedTree` is called with any arguments
**THEN** the result has `kind: "unavailable"` with a reason indicating the managed runtime has no local worktree

### TC-016: detectBaseImplementationContamination is structurally removed — verified by typecheck

**Category**: gate
**Priority**: must
**Source**: design.md > D7 > TC-016 verification mechanism

`bun run typecheck` (T-06). Deleting `detectBaseImplementationContamination` turns any surviving import or call site into a TypeScript compile error. typecheck green is the complete and sufficient gate for structural removal; no separate runtime assertion is needed.

### TC-017: typecheck and full test suite are green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

`bun run typecheck && bun run test`

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 0
must: 17
should: 0
could: 0
blocked_reasons: []
```

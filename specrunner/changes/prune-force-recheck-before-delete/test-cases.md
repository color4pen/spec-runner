# Test Cases: Re-verify orphan status before deleting a sidecar under `job prune --force`

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

- **Total**: 13 cases
- **Automated** (unit/integration): 13
- **Manual**: 0
- **Priority**: must: 6, should: 5, could: 2

---

### TC-001: Active-after-scan sidecar is skipped under --force

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job prune --force` SHALL re-verify orphan status immediately before deleting each sidecar > Scenario: A slug that becomes active after scan is spared under --force

---

### TC-002: Removing the re-check causes the active sidecar to be deleted (破壊確認)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job prune --force` SHALL re-verify orphan status immediately before deleting each sidecar > Scenario: Removing the re-check causes the active sidecar to be deleted (破壊確認)

---

### TC-003: Sidecars still orphan at re-check time are deleted

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sidecars still orphan at re-check time SHALL be deleted as before > Scenario: Orphan-at-recheck sidecars are deleted

---

### TC-004: Skip does not fail the command (exit 0, warnings present)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A re-check skip SHALL be a warning-level, exit-0 outcome > Scenario: Skip does not fail the command

---

### TC-005: Dry-run performs no re-check and no deletion

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Dry-run and best-effort/exit-code behavior SHALL be preserved > Scenario: Dry-run performs no re-check and no deletion

---

### TC-006: Per-item rm failure is a best-effort warning, not a hard failure

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Dry-run and best-effort/exit-code behavior SHALL be preserved > Scenario: A per-item rm failure remains a best-effort warning

---

### TC-007: Mixed re-check result — one slug skipped, one deleted

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Runner tests — race skip, 破壊確認, and no-false-skip > Mixed case

**GIVEN** the scan returns two orphan sidecars: `orphan-keep` and `orphan-gone`
**AND** the injected `recheck` returns `true` for `orphan-keep` and `false` for `orphan-gone`
**WHEN** `pruneOrphanSidecars` runs with `force: true`
**THEN** `fs.rm` is called only for `orphan-keep`'s sidecar path
**AND** the result message is `Removed 1 orphan sidecar(s)`
**AND** a warning names `orphan-gone`
**AND** `exitCode` is `0`

---

### TC-008: Re-check function that rejects is treated as fail-safe (no deletion)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Runner tests — race skip, 破壊確認, and no-false-skip > Re-check failure is fail-safe

**GIVEN** the scan returns one orphan sidecar
**AND** the injected `recheck` throws an error when called for that slug
**WHEN** `pruneOrphanSidecars` runs with `force: true`
**THEN** `fs.rm` is NOT called for that sidecar's path
**AND** a warning referencing the slug and the re-check failure appears in the output
**AND** `exitCode` is `0`

---

### TC-009: Production CLI (`runPrune`) wires the real `isOrphanSidecar` as the re-check

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Wire the real `isOrphanSidecar` re-check in the CLI (`runPrune`) / design.md > D1: Per-slug re-check immediately before delete, injected as a dependency

**GIVEN** `runPrune` is called with `force: true`
**WHEN** the captured `pruneOrphanSidecars` call arg is inspected
**THEN** `deps.recheck === isOrphanSidecar` (the imported real predicate)
**AND** the worktree runner call, output sections, and combined exit code are unchanged

---

### TC-010: Existing runner and CLI tests remain green without modification

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Preserve existing behavior — dry-run, best-effort, exit codes, wiring

**GIVEN** the re-check feature is added to `pruneOrphanSidecars`
**AND** the runner default (when `recheck` is absent) is a pass-through that returns `true`
**WHEN** the existing test blocks TC-004, TC-006, TC-007, TC-008, TC-020, TC-021 in `sidecar-runner.test.ts` and TC-005, TC-013, TC-022 in `prune-combined.test.ts` run
**THEN** all pass without any modification to those test blocks
**AND** the runner's trust-scan default means pre-existing fixtures still result in deletion

---

### TC-011: Dry-run with an injected re-check — re-check is never invoked

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Preserve existing behavior — dry-run, best-effort, exit codes, wiring

**GIVEN** `pruneOrphanSidecars` is called with `force: false`
**AND** a spy `recheck` is injected into deps
**WHEN** the function runs
**THEN** the injected `recheck` spy is never called
**AND** `fs.rm` is never called
**AND** orphan paths are listed as "Would remove: …" info lines

---

### TC-012: Out-of-scope files are untouched

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-05: Full verification

**GIVEN** the change is implemented
**WHEN** the diff is inspected
**THEN** only `src/core/prune/sidecar-runner.ts`, `src/cli/prune.ts`, `tests/unit/core/prune/sidecar-runner.test.ts`, and `tests/unit/cli/prune-combined.test.ts` are modified
**AND** `src/core/prune/runner.ts` (worktree prune), `src/core/sidecar/orphan.ts` (ACTIVE_STATUSES / isOrphanSidecar), and doctor-check files are byte-for-byte identical to `main`

---

### TC-013: Runner default is a pass-through when `recheck` is absent from deps

**Category**: unit
**Priority**: could
**Source**: design.md > D1: Per-slug re-check immediately before delete, injected as a dependency

**GIVEN** `pruneOrphanSidecars` is called with `force: true`
**AND** the `recheck` field is NOT provided in deps
**WHEN** the function runs against a scan result with one orphan sidecar
**THEN** deletion proceeds as before (trusts the scan, calls `fs.rm`)
**AND** no skip warning is emitted

---

## Result

```yaml
result: completed
total: 13
automated: 13
manual: 0
must: 6
should: 5
could: 2
blocked_reasons: []
```

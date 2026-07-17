# Test Cases: bite executor — isolated worktree で materialize 済み test を実行可能にする（Phase 2）

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 8, should: 7, could: 1

---

### TC-001: dependency-requiring test passes when node_modules is linked

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Isolated execution resolves dependencies from the job worktree > Scenario: dependency-requiring test passes when node_modules is linked

---

### TC-002: missing node_modules fails closed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Isolated execution resolves dependencies from the job worktree > Scenario: missing node_modules fails closed

---

### TC-003: config with scopedTestCommand validates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestCommand is an opt-in, provider-neutral config field > Scenario: config with scopedTestCommand validates

---

### TC-004: config without scopedTestCommand validates unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scopedTestCommand is an opt-in, provider-neutral config field > Scenario: config without scopedTestCommand validates unchanged

---

### TC-005: opt-in enables scoped execution under custom commands

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Custom commands run per file only when scopedTestCommand is set > Scenario: opt-in enables scoped execution under custom commands

---

### TC-006: custom commands without opt-in stay unavailable

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Custom commands run per file only when scopedTestCommand is set > Scenario: custom commands without opt-in stay unavailable

---

### TC-007: partial pass is identified per file

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Custom commands run per file only when scopedTestCommand is set > Scenario: partial pass is identified per file

---

### TC-008: worktree and symlink are cleaned up after a run

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Cleanup and never-throw are preserved > Scenario: worktree and symlink are cleaned up after a run

---

### TC-009: non-existent OID never throws

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Cleanup and never-throw are preserved > Scenario: non-existent OID never throws

---

### TC-010: base-red, candidate-green yields achieved bite evidence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The bite tooth bites green end-to-end via the real runtime > Scenario: base-red, candidate-green yields achieved bite evidence

---

### TC-011: empty string scopedTestCommand is rejected by validation

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a project config whose `verification` declares `scopedTestCommand: ""` (empty string)
**WHEN** the config is validated
**THEN** validation fails with an error indicating `scopedTestCommand` must be a non-empty string

---

### TC-012: source node_modules is not deleted after cleanup

**Category**: integration
**Priority**: should
**Source**: design.md > D4: Preserve never-throw and finally-style cleanup, including the symlink

**GIVEN** a `runTestsAtCommit` scoped run that creates a symlink `<tmpBase>/node_modules` → `<cwd>/node_modules`
**WHEN** the run completes (whether tests pass or fail)
**THEN** the symlink target `<cwd>/node_modules` still exists (cleanup unlinked the symlink only, never the target)

---

### TC-013: file path with special characters is correctly shell-quoted

**Category**: integration
**Priority**: should
**Source**: design.md > D3: Under custom commands, run per file via the scoped command with `node_modules/.bin` on PATH

**GIVEN** a real git repo with a test file whose path contains spaces or single-quote characters
**AND** a config with custom `verification.commands` and a `scopedTestCommand`
**WHEN** `runTestsAtCommit` runs that test file at a commit OID
**THEN** the file path is correctly passed as a single argument to `sh -c` without mis-splitting, and the test runs with the expected exit code

---

### TC-014: managed runtime always returns unavailable (backward-compat)

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** a `ManagedRuntime` instance with a config that includes `scopedTestCommand`
**WHEN** `runTestsAtCommit` is called
**THEN** the result is `{ kind: "unavailable" }` (structural — managed has no local worktree; unchanged)

---

### TC-015: default path unchanged when no custom commands and no scopedTestCommand

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / T-06 Acceptance Criteria

**GIVEN** a config with no `verification.commands` and no `scopedTestCommand`
**WHEN** `runTestsAtCommit` is called with a zero-dependency test file at a valid OID
**THEN** the method takes the default path (`bun test <file>` via `this.spawnFn`), does NOT create a `node_modules` symlink, and returns `{ kind: "ran" }` with the correct per-file result

---

### TC-016: `.specrunner/config.json` and `src/core/port/runtime-strategy.ts` are not modified in the diff

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** the completed implementation diff for this change
**WHEN** `git diff main` is reviewed
**THEN** neither `.specrunner/config.json` nor `src/core/port/runtime-strategy.ts` appears in the diff (dogfood enablement and port-signature change are both out of scope)

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 1
must: 8
should: 7
could: 1
blocked_reasons: []
```

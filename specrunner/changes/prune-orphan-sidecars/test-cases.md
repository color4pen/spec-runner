# Test Cases: Extend `job prune` to orphan sidecars and replace doctor's raw `rm -rf` hint

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

- **Total**: 23 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 14, should: 7, could: 2

---

### TC-001: Single detection function backs both consumers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sidecar-orphan detection SHALL be a single shared implementation > Scenario: single detection function backs both consumers

---

### TC-002: Archived / canceled / missing state is an orphan

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sidecar-orphan detection SHALL be a single shared implementation > Scenario: archived / canceled / missing state is an orphan

---

### TC-003: Active status is not an orphan

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Sidecar-orphan detection SHALL be a single shared implementation > Scenario: active status is not an orphan

---

### TC-004: Dry-run lists orphan sidecars without deleting

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job prune` SHALL list orphan worktrees and orphan sidecars in dry-run > Scenario: dry-run lists orphan sidecars without deleting

---

### TC-005: Worktree and sidecar sections are distinguished in output

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: `job prune` SHALL list orphan worktrees and orphan sidecars in dry-run > Scenario: worktree and sidecar sections are distinguished

---

### TC-006: Force removes orphan sidecars and keeps active ones

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job prune --force` SHALL delete orphan sidecars and spare active ones > Scenario: force removes orphans and keeps active sidecars

---

### TC-007: Neutralizing active-status protection causes active sidecar deletion (破壊確認)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job prune --force` SHALL delete orphan sidecars and spare active ones > Scenario: neutralizing active-status protection deletes an active sidecar

---

### TC-008: Re-running prune after full cleanup is a no-op

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: `job prune --force` SHALL delete orphan sidecars and spare active ones > Scenario: re-running prune is a no-op for sidecars

---

### TC-009: Doctor hint points to `job prune` without `rm -rf`

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The doctor `orphan-sidecars` hint SHALL point to `job prune` > Scenario: hint names the product command

---

### TC-010: Human output rounds beyond N orphans with remainder line

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Human `details` SHALL be rounded while `--json` keeps every entry > Scenario: human output rounds beyond N orphans

---

### TC-011: JSON output retains all orphan paths without rounding

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Human `details` SHALL be rounded while `--json` keeps every entry > Scenario: JSON output retains all orphans

---

### TC-012: Other doctor checks render identically after this change

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Other doctor checks and worktree prune SHALL remain unchanged > Scenario: other checks render identically

---

### TC-013: Worktree prune behavior is unaffected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Other doctor checks and worktree prune SHALL remain unchanged > Scenario: worktree prune is unaffected

---

### TC-014: scanOrphanSidecars returns empty array when base dir is absent

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 (acceptance criteria)

**GIVEN** `.specrunner/local/` does not exist, or `readdirSync` throws on it
**WHEN** `scanOrphanSidecars` is called with an injected fs mock reflecting that state
**THEN** it returns `[]` without throwing

---

### TC-015: Non-directory entries under `.specrunner/local/` are stat-filtered

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `.specrunner/local/` contains a mix of directory entries (potential sidecars) and non-directory entries (e.g. stray files)
**WHEN** `scanOrphanSidecars` enumerates and classifies the entries
**THEN** non-directory entries are skipped and do not appear in the returned orphan list

---

### TC-016: Scan results are sorted deterministically by slug

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** multiple orphan sidecar directories with varying slug names (e.g. `zebra-slug`, `alpha-slug`, `middle-slug`)
**WHEN** `scanOrphanSidecars` returns its result
**THEN** the `OrphanSidecar` entries are ordered alphabetically by `slug`

---

### TC-017: Doctor check delegates to injected scan function (factory override)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (acceptance criteria)

**GIVEN** a mock scan function is injected via `createOrphanSidecarsCheck(mockScan)`
**WHEN** the check is executed
**THEN** it calls the injected mock scan and its result is derived exclusively from the mock's return value — no inline orphan predicate is invoked inside the check

---

### TC-018: detailsHuman equals full list when orphan count is at or below N

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** exactly `SIDECAR_DETAILS_HUMAN_LIMIT` (N) or fewer orphan sidecars
**WHEN** the `orphan-sidecars` check produces its result
**THEN** the human-visible details show all orphan paths with no `…and K more` remainder line, and `details` also contains all paths

---

### TC-019: Formatter renders `detailsHuman` in human mode; full `details` in JSON without `detailsHuman` key

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 (acceptance criteria)

**GIVEN** a `DoctorResult` with a `details` array longer than N and a `detailsHuman` array of N+1 entries (the Nth+1 being a remainder line)
**WHEN** `formatHuman` and `formatJson` each render the result
**THEN** `formatHuman` outputs exactly N+1 bullet lines (from `detailsHuman`); `formatJson` emits the full `details` array and does not include a `detailsHuman` key in the output

---

### TC-020: Best-effort deletion — per-directory `rm` failure becomes a warning and processing continues

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-04

**GIVEN** `pruneOrphanSidecars` is called with `--force` and a mock `fs.rm` that rejects for exactly one of multiple orphan paths
**WHEN** the runner processes all orphans
**THEN** the failing deletion is recorded as a warning in the result, the remaining orphans are still attempted, the successful deletions are counted in the message, and `exitCode` is `0`

---

### TC-021: Hard scan failure returns exitCode 1 with a failure message

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (behavior step 1)

**GIVEN** the scan function (`deps.scan` override) throws an unexpected error
**WHEN** `pruneOrphanSidecars` is called (dry-run or force)
**THEN** the returned `PruneResult` has `exitCode: 1` and a `message` containing "Failed to scan for orphan sidecars"

---

### TC-022: runPrune exit code is the logical OR of the two runner exit codes

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 (acceptance criteria)

**GIVEN** `runPrune` invokes both `pruneOrphanWorktrees` and `pruneOrphanSidecars`
**WHEN** one runner returns `exitCode: 1` and the other returns `exitCode: 0`
**THEN** `runPrune` returns `exitCode: 1` (i.e. `worktreeResult.exitCode || sidecarResult.exitCode`)

---

### TC-023: PRUNE_USAGE and top-level help line mention both worktrees and sidecars

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-05 (acceptance criteria)

**GIVEN** the updated `command-registry.ts` with the revised `PRUNE_USAGE` and help-line text
**WHEN** `specrunner job prune --help` is invoked
**THEN** the printed output references both orphan worktrees and orphan sidecars in the description

---

## Result

```yaml
result: completed
total: 23
automated: 23
manual: 0
must: 14
should: 7
could: 2
blocked_reasons: []
```

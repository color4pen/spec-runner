# Test Cases: journal-integrity-fail-closed

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 32
- **Manual**: 1
- **Priority**: must: 23, should: 8, could: 2

---

## fold() — corruption reporting (T-01)

### TC-001: mid-journal non-JSON line is reported as corruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold distinguishes benign tail-partial from mid-journal corruption > Scenario: mid-journal non-JSON line is reported as corruption

---

### TC-002: mid-journal non-object line is reported as corruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold distinguishes benign tail-partial from mid-journal corruption > Scenario: mid-journal non-object line is reported as corruption

---

### TC-003: unknown object type is not corruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold distinguishes benign tail-partial from mid-journal corruption > Scenario: unknown object type is not corruption

---

### TC-004: partial tail only is not corruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold distinguishes benign tail-partial from mid-journal corruption > Scenario: partial tail only is not corruption

---

### TC-005: empty or missing journal is not corruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold distinguishes benign tail-partial from mid-journal corruption > Scenario: empty or missing journal is not corruption

---

### TC-006: fold() records only the first corruption when multiple committed lines are corrupt

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** an events.jsonl with two mid-journal non-JSON lines (e.g. line 1 and line 3, both non-last)
**WHEN** `fold()` is called
**THEN** `corruption.lineIndex` points to the first corrupt line; the second corrupt line is not separately recorded; valid records from other lines are still folded

---

### TC-007: fold() never throws for any input string

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** an arbitrary string including malformed JSON, arrays, primitives, nulls, and whitespace-only lines
**WHEN** `fold()` is called with each such input
**THEN** it returns a `FoldResult` without throwing under any circumstances

---

### TC-008: fold() returns best-effort steps and history when corruption is present

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** an events.jsonl with valid step/history records surrounding a corrupt mid-journal line
**WHEN** `fold()` is called
**THEN** `corruption` is set AND `steps` / `history` still contain the data from the valid records

---

### TC-009: last non-empty line that is valid JSON is treated as a committed line, not a tail partial

**Category**: unit
**Priority**: should
**Source**: design.md > D1 (tail handling rule)

**GIVEN** an events.jsonl where every line is valid JSON — including the very last line
**WHEN** `fold()` is called
**THEN** the last line is included in the committed lines (not dropped), and `corruption` is absent when all lines are valid objects

---

## journal-integrity helper module (T-02)

### TC-010: detectCounterReversal returns history reversal when fold history count is below stored

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: persist fails closed on journal truncation (counter reversal) > Scenario: truncated journal fails persist

**GIVEN** stored `_journal.historyCount = 5` and `foldResult.historyCount = 3`
**WHEN** `detectCounterReversal(stored, foldResult)` is called
**THEN** it returns `{ field: "history", stored: 5, actual: 3 }` (non-null)

---

### TC-011: detectCounterReversal returns step reversal when a per-step count falls below stored

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** stored `_journal.stepCounts = { "step-a": 4 }` and `foldResult.stepCounts = { "step-a": 2 }`
**WHEN** `detectCounterReversal(stored, foldResult)` is called
**THEN** it returns `{ field: "step", step: "step-a", stored: 4, actual: 2 }` (non-null)

---

### TC-012: detectCounterReversal returns null when fold is ahead of stored (crash recovery)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: persist fails closed on journal truncation (counter reversal) > Scenario: fold ahead of stored counters is still recovered

**GIVEN** stored `_journal.historyCount = 2` and `foldResult.historyCount = 4`
**WHEN** `detectCounterReversal(stored, foldResult)` is called
**THEN** it returns `null`

---

### TC-013: inspectJournalDir returns null when events.jsonl is absent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a directory that contains no `events.jsonl` file
**WHEN** `inspectJournalDir(dir)` is called
**THEN** it returns `null` and does not throw

---

### TC-014: inspectJournalDir returns corrupt-record issue for mid-journal corrupt journal

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a directory whose `events.jsonl` has a mid-journal corrupt line
**WHEN** `inspectJournalDir(dir)` is called
**THEN** it returns `{ kind: "corrupt-record", corruption: <FoldCorruption> }`

---

### TC-015: inspectJournalDir returns counter-reversal issue when _journal counters exceed fold

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a directory with a valid `events.jsonl` (fold produces lower counts) and a `state.json` whose `_journal` records higher counts
**WHEN** `inspectJournalDir(dir)` is called
**THEN** it returns `{ kind: "counter-reversal", reversal: <CounterReversal> }`

---

### TC-016: inspectJournalDir returns null for an intact journal

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a directory with a valid `events.jsonl` and a matching `state.json`
**WHEN** `inspectJournalDir(dir)` is called
**THEN** it returns `null`

---

### TC-017: inspectJournalDir never throws on missing or malformed files

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a directory where `state.json` is absent or contains malformed JSON
**WHEN** `inspectJournalDir(dir)` is called
**THEN** it returns `null` (skips reversal check) without throwing

---

## load() / persist() fail-closed; list() tolerant (T-04)

### TC-018: load fails closed on a corrupt journal

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: load and persist fail closed on mid-journal corruption > Scenario: load fails closed on a corrupt journal

---

### TC-019: persist fails closed on a corrupt journal

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: load and persist fail closed on mid-journal corruption > Scenario: persist fails closed on a corrupt journal

---

### TC-020: tail-partial journal still loads

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: load and persist fail closed on mid-journal corruption > Scenario: tail-partial journal still loads

---

### TC-021: truncated journal fails persist

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: persist fails closed on journal truncation (counter reversal) > Scenario: truncated journal fails persist

---

### TC-022: fold ahead of stored counters is still recovered

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: persist fails closed on journal truncation (counter reversal) > Scenario: fold ahead of stored counters is still recovered

---

### TC-023: corrupt-journal job still appears in enumeration

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: known-type forward compatibility and enumeration are preserved > Scenario: corrupt-journal job still appears in enumeration

---

### TC-024: forward-compatible record round-trips

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: known-type forward compatibility and enumeration are preserved > Scenario: forward-compatible record round-trips

---

## job show (T-05)

### TC-025: job show shows a corruption notice

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job show surfaces journal corruption without crashing > Scenario: job show shows a corruption notice

---

### TC-026: job show is unaffected for a healthy job

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: job show surfaces journal corruption without crashing > Scenario: job show is unaffected for a healthy job

---

## doctor journal-integrity check (T-06)

### TC-027: doctor fails when a journal is corrupt

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor reports corrupt or truncated journals > Scenario: doctor fails when a journal is corrupt

---

### TC-028: doctor passes when journals are intact

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor reports corrupt or truncated journals > Scenario: doctor passes when journals are intact

---

### TC-029: doctor passes when the scan throws (I/O error)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** a `createJournalIntegrityCheck` instance with an injected scan that throws an I/O error
**WHEN** the check runs
**THEN** the check returns `status: "pass"` and does not propagate the error

---

### TC-030: journal-integrity check is included in allChecks and all 7 doctor categories are present

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** the doctor check registry
**WHEN** `allChecks` is inspected
**THEN** it contains `>= 17` checks and all 7 categories (runtime, config, env, auth, repo, agents, storage) are represented, including the new `journal-integrity` check

---

## JOURNAL_CORRUPTED error code (T-03)

### TC-031: journalCorruptedError returns a SpecRunnerError with correct code and exit code

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a call to `journalCorruptedError("/path/events.jsonl", "corrupt record at line 2")`
**WHEN** the returned error is inspected
**THEN** `error.code === "JOURNAL_CORRUPTED"`, `error.exitCode === 1`, and the message contains both the events path and the detail string

---

## Build verification (T-08)

### TC-032: typecheck and test both pass green

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-08

**GIVEN** the completed implementation on the change branch
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** both commands exit with code 0 and no existing test fails unless it previously pinned the old mid-journal silent-skip contract

---

### TC-033: no existing test pins the old mid-journal silent-skip contract

**Category**: unit
**Priority**: could
**Source**: design.md > Risks / Trade-offs

**GIVEN** the full test suite after implementation
**WHEN** all tests run
**THEN** no test fails due to the removal of silent-skip behavior; any test that previously relied on skipping a corrupt mid-journal line has been updated to match the new contract

---

## Result

```yaml
result: completed
total: 33
automated: 32
manual: 1
must: 23
should: 8
could: 2
blocked_reasons: []
```

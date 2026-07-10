# Spec: journal-integrity-fail-closed

## Requirements

### Requirement: fold distinguishes benign tail-partial from mid-journal corruption

`fold()` MUST classify the committed lines of an `events.jsonl` string and report the first
corrupt record via a `FoldResult.corruption` field, without throwing. A committed line is any
non-empty line except a partial tail. The last non-empty line is treated as a benign partial tail
(and dropped) ONLY when it fails `JSON.parse`. A committed line is corrupt when it fails
`JSON.parse` (reason `invalid-json`) or parses to a value that is not a plain object — array,
`null`, or a primitive (reason `not-an-object`). An object record whose `type` is unknown MUST NOT
be treated as corrupt (forward compatibility). When corruption is present, `fold()` MUST still
return best-effort `steps` / `history` built from the valid records.

#### Scenario: mid-journal non-JSON line is reported as corruption

**Given** an `events.jsonl` whose first line is a valid record, whose second (non-last) line is not valid JSON, and whose last line is a valid record
**When** `fold()` is called
**Then** the result's `corruption` names the second line with reason `invalid-json`, and the valid records are still folded

#### Scenario: mid-journal non-object line is reported as corruption

**Given** a committed line that parses to a JSON array or a primitive (e.g. `42`)
**When** `fold()` is called
**Then** the result's `corruption` reports reason `not-an-object` for that line

#### Scenario: unknown object type is not corruption

**Given** a committed line that is a JSON object with a `type` unknown to fold
**When** `fold()` is called
**Then** `corruption` is absent and the record is ignored (forward compatible)

#### Scenario: partial tail only is not corruption

**Given** an `events.jsonl` whose only non-empty line is a truncated (unparseable) record, or whose valid records are followed by a truncated last line
**When** `fold()` is called
**Then** the truncated last line is dropped, `corruption` is absent, and the prior valid records are returned

#### Scenario: empty or missing journal is not corruption

**Given** an empty string (or whitespace-only content)
**When** `fold()` is called
**Then** `corruption` is absent and the result is empty

### Requirement: load and persist fail closed on mid-journal corruption

`JobStateStore.load()` and `JobStateStore.persist()` MUST NOT silently continue when the journal
contains mid-journal corruption. On detecting `FoldResult.corruption`, they MUST throw a
`SpecRunnerError` carrying the dedicated error code `JOURNAL_CORRUPTED`. A benign partial tail MUST
continue to be tolerated (load / persist succeed, the partial is dropped).

#### Scenario: load fails closed on a corrupt journal

**Given** a job whose `events.jsonl` contains a mid-journal non-JSON or non-object line
**When** `store.load()` runs
**Then** it throws a `SpecRunnerError` with code `JOURNAL_CORRUPTED`

#### Scenario: persist fails closed on a corrupt journal

**Given** a job whose `events.jsonl` contains a mid-journal corrupt line and whose in-memory state has new events to append
**When** `store.persist(state)` runs
**Then** it throws a `SpecRunnerError` with code `JOURNAL_CORRUPTED` and does not append or overwrite state

#### Scenario: tail-partial journal still loads

**Given** a job whose `events.jsonl` ends with a single truncated record after valid records
**When** `store.load()` runs
**Then** it succeeds, the partial tail is dropped, and the prior records are returned

### Requirement: persist fails closed on journal truncation (counter reversal)

When `persist()` re-folds the journal, if the fold result's `historyCount` or any per-step count is
**less than** the counters recorded in `state.json` `_journal`, the system MUST treat it as journal
truncation and fail closed with the same `JOURNAL_CORRUPTED` error. The previous `Math.max` /
per-step-max absorption of below-counter fold results MUST be removed. A fold result greater than
the stored counters remains valid crash recovery and MUST NOT fail.

#### Scenario: truncated journal fails persist

**Given** a job whose `state.json` `_journal` records more history / step records than remain in `events.jsonl` (the journal was truncated), with all remaining lines valid
**When** `store.persist(state)` runs
**Then** it throws a `SpecRunnerError` with code `JOURNAL_CORRUPTED`

#### Scenario: fold ahead of stored counters is still recovered

**Given** a job whose `events.jsonl` contains more valid records than `state.json` `_journal` records (crash before the counter update)
**When** `store.persist(state)` runs
**Then** it does not fail, recovers counters from the fold, and appends only the true delta

### Requirement: job show surfaces journal corruption without crashing

`specrunner job show` MUST NOT crash when the target job's journal is corrupt. It MUST display that
the journal is corrupted (read-only observability). Header fields sourced from the projection
(`state.json`) MAY still be shown; journal-derived sections (lineage, cost) MUST be suppressed when
corruption is detected.

#### Scenario: job show shows a corruption notice

**Given** a job (resolvable by slug or jobId) whose `events.jsonl` is corrupt
**When** `specrunner job show <target>` runs
**Then** it does not throw, and its output states that the event journal is corrupted

#### Scenario: job show is unaffected for a healthy job

**Given** a job whose journal has no corruption
**When** `specrunner job show <target>` runs
**Then** the existing header, lineage, and cost output is produced unchanged

### Requirement: doctor reports corrupt or truncated journals

`specrunner doctor` MUST include a `journal-integrity` check (storage category) that folds each
existing job's `events.jsonl` and reports jobs with mid-journal corruption or counter reversal
(truncation). When at least one job is affected, the check status MUST be `fail`. When no journal is
corrupt (including when there are no jobs), the check MUST pass.

#### Scenario: doctor fails when a journal is corrupt

**Given** an existing job whose `events.jsonl` has mid-journal corruption or whose fold counts fall below the recorded `_journal` counters
**When** `specrunner doctor` runs
**Then** the `journal-integrity` check reports `fail` and identifies the affected job

#### Scenario: doctor passes when journals are intact

**Given** all existing jobs have intact journals (or there are no jobs)
**When** `specrunner doctor` runs
**Then** the `journal-integrity` check reports `pass`

### Requirement: known-type forward compatibility and enumeration are preserved

Detecting corruption MUST NOT reclassify object records of unknown `type` as corrupt (forward
compatibility). Enumeration (`JobStateStore.list()`) MUST continue to surface a job whose journal is
corrupt rather than dropping it, preserving `ps` observability; only the single-job consume path
(`load()` / `persist()`) fails closed.

#### Scenario: forward-compatible record round-trips

**Given** a journal containing an object record with a `type` not known to fold, among valid records
**When** the job is loaded
**Then** load succeeds, the unknown record is ignored, and no `JOURNAL_CORRUPTED` error is raised

#### Scenario: corrupt-journal job still appears in enumeration

**Given** a job whose `events.jsonl` is corrupt
**When** `JobStateStore.list()` runs
**Then** the job is still returned (not skipped), so it remains resolvable by `ps` and `job show`

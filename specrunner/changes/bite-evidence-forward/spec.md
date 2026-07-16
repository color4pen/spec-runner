# Spec: base/candidate OID capture and forward-strategy BiteEvidence gate

## Requirements

### Requirement: The system SHALL record the commit OID of each sequential agent node branch-borne

The system SHALL capture the HEAD commit OID of each sequential agent step immediately after
that step's per-node commit, and record it on the step's run in a way that is reconstructed
from the branch-borne event journal (so it survives resume and checkpoint). In particular the
base OID (the `test-materialize` commit) and the candidate OID (the `implementer` commit) SHALL
be resolvable from the recorded runs.

#### Scenario: base and candidate OIDs are recorded after their commits

**Given** a job whose `test-materialize` step has committed and whose `implementer` step has
committed
**When** the executor records each step's successful completion
**Then** the latest `test-materialize` run carries the base commit OID and the latest
`implementer` run carries the candidate commit OID

#### Scenario: recorded OIDs survive a resume

**Given** a job state whose `test-materialize` and `implementer` runs carry commit OIDs
**When** the state is persisted and then reloaded from disk (state.json + events.jsonl)
**Then** the reloaded runs carry the same base and candidate commit OIDs

### Requirement: The forward-strategy gate SHALL verify base-red and candidate-green and record BiteEvidence

For a job whose request type is `bug-fix` or `new-feature`, the system SHALL, after the
candidate is established, execute the materialized tests at the base OID and at the candidate
OID in isolated worktrees, and for each materialized test record a `BiteEvidence` entry of the
form `{ testId, strategy: "forward", baseResult, candidateResult, verified }` branch-borne,
where `verified` is true iff the base result is red and the candidate result is green. When all
entries are verified, the gate SHALL pass and the pipeline SHALL continue to verification.

#### Scenario: real tooth passes and records evidence

**Given** a forward-strategy job whose materialized tests fail at the base OID and pass at the
candidate OID
**When** the bite-evidence gate runs
**Then** a `BiteEvidence` entry with `baseResult: "red"`, `candidateResult: "green"`,
`verified: true` is recorded branch-borne for each materialized test, the gate verdict is
`passed`, and the pipeline transitions to verification

### Requirement: The gate SHALL fail closed on a hollow test

When a materialized test passes at the base OID (i.e. passes with no implementation), the test
has no tooth. The system SHALL reject such a job: the gate verdict SHALL be `failed` and the
job SHALL escalate.

#### Scenario: base-green test is rejected

**Given** a forward-strategy job in which at least one materialized test passes at the base OID
**When** the bite-evidence gate runs
**Then** the corresponding `BiteEvidence` entry has `baseResult: "green"` and
`verified: false`, the gate verdict is `failed`, and the job escalates

#### Scenario: candidate that stays red is rejected

**Given** a forward-strategy job in which a materialized test fails at both the base OID and the
candidate OID
**When** the bite-evidence gate runs
**Then** the corresponding `BiteEvidence` entry has `candidateResult: "red"` and
`verified: false`, the gate verdict is `failed`, and the job escalates

### Requirement: The gate SHALL fail closed when the frozen scenario file was tampered

The system SHALL compare the current `test-cases.md` hash against the frozen hash recorded at
the `test-case-gen` boundary in the event-journal lineage. When both are present and differ,
the gate SHALL fail closed (verdict `failed`, job escalates).

#### Scenario: tampered test-cases.md is rejected

**Given** a forward-strategy job whose `test-cases.md` current hash differs from the frozen hash
recorded in the test-case-gen lineage
**When** the bite-evidence gate runs
**Then** the gate verdict is `failed` and the job escalates

### Requirement: Non-forward jobs SHALL pass through as strategy-deferred without generating BiteEvidence

For request types that are not forward strategy (`spec-change`, `refactoring`, `chore`), and
for runtimes that structurally cannot isolate commits, the gate SHALL emit the verdict
`strategy-deferred`, SHALL NOT generate any `BiteEvidence`, and SHALL route the pipeline to
verification without behavioral regression.

#### Scenario: refactoring job defers

**Given** a job whose request type is `refactoring`
**When** the bite-evidence gate runs
**Then** the gate verdict is `strategy-deferred`, no `BiteEvidence` is recorded, and the
pipeline transitions to verification

### Requirement: Base/candidate execution SHALL be limited to the materialized tests

The system SHALL execute only the test files produced by the `test-materialize` commit at the
base and candidate OIDs; it SHALL NOT run the full test suite twice.

#### Scenario: only materialized test files are executed

**Given** a forward-strategy job whose base commit added a known set of materialized test files
**When** the bite-evidence gate runs the base and candidate executions
**Then** only those materialized test files are executed at each OID and the full suite is not
run

### Requirement: Existing pipeline behavior SHALL be preserved

The addition of OID capture and the bite-evidence gate SHALL NOT change existing pipeline,
verification, attach, or R3 behavior for jobs that do not exercise the forward-strategy tooth.

#### Scenario: existing behavior-preservation tests remain green

**Given** the existing pipeline / verification / attach / R3 behavior-preservation test suite
**When** the suite runs after this change
**Then** all tests pass without modification

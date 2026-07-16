# Test Cases: base/candidate OID capture and forward-strategy BiteEvidence gate

## Summary

- **Total**: 35 cases
- **Automated** (unit/integration): 35
- **Manual**: 0
- **Priority**: must: 17, should: 18, could: 0

---

### TC-001: base and candidate OIDs are recorded after their commits

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL record the commit OID of each sequential agent node branch-borne > Scenario: base and candidate OIDs are recorded after their commits

---

### TC-002: recorded OIDs survive a resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL record the commit OID of each sequential agent node branch-borne > Scenario: recorded OIDs survive a resume

---

### TC-003: real tooth passes and records evidence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The forward-strategy gate SHALL verify base-red and candidate-green and record BiteEvidence > Scenario: real tooth passes and records evidence

---

### TC-004: base-green test is rejected

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL fail closed on a hollow test > Scenario: base-green test is rejected

---

### TC-005: candidate that stays red is rejected

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL fail closed on a hollow test > Scenario: candidate that stays red is rejected

---

### TC-006: tampered test-cases.md is rejected

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The gate SHALL fail closed when the frozen scenario file was tampered > Scenario: tampered test-cases.md is rejected

---

### TC-007: refactoring job defers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Non-forward jobs SHALL pass through as strategy-deferred without generating BiteEvidence > Scenario: refactoring job defers

---

### TC-008: only materialized test files are executed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Base/candidate execution SHALL be limited to the materialized tests > Scenario: only materialized test files are executed

---

### TC-009: existing behavior-preservation tests remain green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Existing pipeline behavior SHALL be preserved > Scenario: existing behavior-preservation tests remain green

---

### TC-010: commitOid round-trips through stepRunToRecord and fold

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add `commitOid` to the step-run schema and journal round-trip

**GIVEN** a `StepRun` with `commitOid: "abc123def456"` serialized via `stepRunToRecord` into a `StepAttemptRecord`
**WHEN** `fold` processes that record to reconstruct the `StepRun`
**THEN** the reconstructed `StepRun` has `commitOid: "abc123def456"` unchanged

---

### TC-011: Legacy StepAttemptRecord without commitOid folds to undefined

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Add `commitOid` to the step-run schema and journal round-trip

**GIVEN** a `StepAttemptRecord` that has no `commitOid` field (legacy format pre-R4)
**WHEN** `fold` processes it to reconstruct a `StepRun`
**THEN** the reconstructed `StepRun` has `commitOid: undefined` and no error is thrown

---

### TC-012: Sequential agent step captures HEAD OID into commitOid after per-node commit

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Capture the commit OID in the executor and thread it into the success result

**GIVEN** a sequential agent step (`roundOwnsGitEffects === false`) whose runtime strategy `captureHeadSha` returns `"sha-candidate-001"`
**WHEN** `runAgentStep` completes `finalizeStepArtifacts` and builds the success result
**THEN** the `StepRun.commitOid` recorded for that step is `"sha-candidate-001"`

---

### TC-013: Parallel reviewer members do not set commitOid

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: Capture the commit OID in the executor and thread it into the success result

**GIVEN** a round member step running in `roundOwnsGitEffects === true` mode (parallel reviewer)
**WHEN** the round step completes successfully
**THEN** no `commitOid` is set on the resulting `StepRun` (field remains `undefined`)

---

### TC-014: resolveBaseCandidateOids returns null when step has no runs or no commitOid

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Resolve base/candidate OIDs from state

**GIVEN** a `JobState` where `test-materialize` has zero runs and `implementer` runs carry no `commitOid` field
**WHEN** `resolveBaseCandidateOids(state)` is called
**THEN** it returns `{ baseOid: null, candidateOid: null }`

---

### TC-015: resolveBaseCandidateOids returns the latest run's OID when multiple runs exist

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Resolve base/candidate OIDs from state

**GIVEN** a `JobState` where `implementer` has two completed runs with `commitOid: "old-sha"` and `commitOid: "new-sha"` respectively (re-loop scenario)
**WHEN** `resolveBaseCandidateOids(state)` is called
**THEN** `candidateOid` is `"new-sha"` (the latest run's OID, not the first)

---

### TC-016: ManagedRuntime returns unavailable for both new RuntimeStrategy methods

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Add isolated-execution RuntimeStrategy ports and implementations

**GIVEN** a `ManagedRuntime` instance (structural: no local worktree)
**WHEN** `listCommitChangedFiles("abc123", "/cwd")` and `runTestsAtCommit("abc123", ["test.ts"], "/cwd", config)` are each called
**THEN** both return `{ kind: "unavailable", reason: <non-empty string> }`

---

### TC-017: runTestsAtCommit removes isolated worktree even when tests fail

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04: Add isolated-execution RuntimeStrategy ports and implementations

**GIVEN** a `LocalRuntime` and a valid OID where the test files are expected to fail
**WHEN** `runTestsAtCommit(oid, testFiles, cwd, config)` completes (regardless of pass/fail)
**THEN** the isolated worktree path is no longer present in `git worktree list` (finally-style cleanup)

---

### TC-018: runTestsAtCommit returns unavailable instead of throwing on spawn error

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Add isolated-execution RuntimeStrategy ports and implementations

**GIVEN** a `LocalRuntime` called with an OID that cannot be checked out (e.g. non-existent ref)
**WHEN** `runTestsAtCommit(oid, testFiles, cwd, config)` is called
**THEN** it returns `{ kind: "unavailable", reason: <string> }` and does not throw

---

### TC-019: JobState.biteEvidence round-trips through state.json

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Add BiteEvidence types and the branch-borne state field

**GIVEN** a `JobState` with `biteEvidence: [{ testId: "src/__tests__/foo.test.ts", strategy: "forward", baseResult: "red", candidateResult: "green", verified: true }]`
**WHEN** the state is serialized to `state.json` and reloaded via `validateJobState`
**THEN** `state.biteEvidence` matches the original array exactly

---

### TC-020: validateJobState accepts absent biteEvidence without error

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: Add BiteEvidence types and the branch-borne state field

**GIVEN** a `JobState` serialization with no `biteEvidence` key (legacy state file format)
**WHEN** `validateJobState` is called on it
**THEN** it returns successfully with `biteEvidence: undefined` (no validation error)

---

### TC-021: validateJobState rejects a non-array biteEvidence value

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: Add BiteEvidence types and the branch-borne state field

**GIVEN** a `JobState` serialization with `biteEvidence: "not-an-array"`
**WHEN** `validateJobState` is called
**THEN** it throws a validation error

---

### TC-022: Gate emits strategy-deferred when base OID is absent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: Implement the bite-evidence gate decision logic (pure module)

**GIVEN** a `bug-fix` `JobState` where `resolveBaseCandidateOids` returns `baseOid: null`
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "strategy-deferred" }` with an empty records array and no BiteEvidence is generated

---

### TC-023: Gate emits strategy-deferred when candidate OID is absent

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: Implement the bite-evidence gate decision logic (pure module)

**GIVEN** a `new-feature` `JobState` where `resolveBaseCandidateOids` returns `candidateOid: null`
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "strategy-deferred" }` with an empty records array

---

### TC-024: Gate emits strategy-deferred when runTestsAtCommit returns unavailable

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: Implement the bite-evidence gate decision logic (pure module)

**GIVEN** a fake runtime whose `runTestsAtCommit` returns `{ kind: "unavailable", reason: "..." }` and a `bug-fix` job with valid base/candidate OIDs
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "strategy-deferred" }` with no BiteEvidence records

---

### TC-025: Gate emits failed when forward job has no materialized test files

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: Implement the bite-evidence gate decision logic (pure module)

**GIVEN** a fake runtime whose `listCommitChangedFiles` returns only paths under `specrunner/changes/` and `.specrunner/` for the base OID, and a `new-feature` job
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "failed", reason: <includes "no materialized tests"> }` and escalates

---

### TC-026: Standard pipeline wires implementer → bite-evidence → verification

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Add the bite-evidence CLI step and wire it into the standard pipeline

**GIVEN** `STANDARD_DESCRIPTOR` and `STANDARD_TRANSITIONS`
**WHEN** the transition graph is inspected
**THEN**
- `implementer / success` routes to `bite-evidence`
- `bite-evidence / passed` routes to `verification`
- `bite-evidence / strategy-deferred` routes to `verification`
- `bite-evidence / failed` escalates
- `bite-evidence / error` escalates

---

### TC-027: Fast pipeline does not include bite-evidence step

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: Add the bite-evidence CLI step and wire it into the standard pipeline

**GIVEN** `FAST_DESCRIPTOR` and its step list
**WHEN** the descriptor is inspected
**THEN** `bite-evidence` is not present and the fast pipeline transition table is unmodified

---

### TC-028: parseResult correctly maps verdict line to all three verdict values

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: Add the bite-evidence CLI step and wire it into the standard pipeline

**GIVEN** a `bite-evidence-result.md` file containing `## Verdict: strategy-deferred` (and separately `passed`, and `failed`)
**WHEN** `BiteEvidenceStep.parseResult` parses each file
**THEN** the returned `ParsedStepResult.verdict` is `"strategy-deferred"` / `"passed"` / `"failed"` respectively

---

### TC-029: bite-evidence is registered in CLI_STEP_NAMES

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: Add the bite-evidence CLI step and wire it into the standard pipeline

**GIVEN** `CLI_STEP_NAMES` exported from `src/kernel/step-names.ts`
**WHEN** the array is inspected
**THEN** it includes `"bite-evidence"`, allowing `STANDARD_DESCRIPTOR` to pass `isStandardStepName` validation

---

### TC-030: state.biteEvidence is populated after forward-strategy gate and survives persist/reload

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08: Reflect BiteEvidence records into branch-borne state

**GIVEN** a `bug-fix` job where the bite-evidence gate produces verdict `passed` with a verified `BiteEvidenceRecord`
**WHEN** `commitSuccess` processes the gate's `StepCompletion.biteEvidence` and the state is persisted to `state.json` then reloaded
**THEN** `state.biteEvidence` contains the same verified records after reload

---

### TC-031: strategy-deferred run does not populate state.biteEvidence

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: Reflect BiteEvidence records into branch-borne state

**GIVEN** a `refactoring` job where the bite-evidence gate returns `strategy-deferred`
**WHEN** `commitSuccess` processes the resulting `StepCompletion`
**THEN** `state.biteEvidence` remains `undefined` (no records are written)

---

### TC-032: Tamper check returns inconclusive and gate proceeds when frozen hash is absent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09: Implement the tamper (frozen-hash) check

**GIVEN** an `events.jsonl` that contains no `test-case-gen` lineage record (or the record lacks a hash for `test-cases.md`)
**WHEN** the tamper helper runs
**THEN** it returns `{ status: "inconclusive" }` and the gate proceeds to evaluate base/candidate OIDs normally (does not fail closed)

---

### TC-033: chore request type emits strategy-deferred

**Category**: unit
**Priority**: should
**Source**: design.md > D4: Strategy is selected from request.type; non-forward and non-isolable runtimes defer

**GIVEN** a `JobState` with `request.type: "chore"` and valid base/candidate OIDs
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "strategy-deferred" }` with no BiteEvidence records

---

### TC-034: spec-change request type emits strategy-deferred

**Category**: unit
**Priority**: should
**Source**: design.md > D4: Strategy is selected from request.type; non-forward and non-isolable runtimes defer

**GIVEN** a `JobState` with `request.type: "spec-change"` and valid base/candidate OIDs
**WHEN** the bite-evidence gate runs
**THEN** the gate returns `{ verdict: "strategy-deferred" }` with no BiteEvidence records

---

### TC-035: Fake runtime omitting new ports triggers strategy-deferred without behavioral regression

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10: Tests (behavior preservation); design.md > D4

**GIVEN** a fake `RuntimeStrategy` that does not implement `listCommitChangedFiles` or `runTestsAtCommit` (existing test fake pattern, omits optional methods)
**WHEN** the bite-evidence gate runs for a `bug-fix` job with valid base/candidate OIDs
**THEN** the gate returns `{ verdict: "strategy-deferred" }`, no BiteEvidence is recorded, and the pipeline transitions to verification without error or regression

---

## Result

```yaml
result: completed
total: 35
automated: 35
manual: 0
must: 17
should: 18
could: 0
blocked_reasons: []
```

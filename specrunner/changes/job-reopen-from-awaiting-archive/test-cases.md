# Test Cases: job-reopen-from-awaiting-archive

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 24
- **Manual**: 0
- **Priority**: must: 17, should: 7, could: 0

---

### TC-001: reopen restarts an awaiting-archive job from the requested step

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen transitions an awaiting-archive job to running › Scenario: reopen restarts an awaiting-archive job from the requested step

---

### TC-002: the general transition guard still forbids awaiting-archive → running

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen transitions an awaiting-archive job to running › Scenario: the general transition guard still forbids the edge

---

### TC-003: resume of an awaiting-archive job is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: job resume still rejects awaiting-archive → running › Scenario: resume of an awaiting-archive job is rejected

---

### TC-004: reopen without --reason is an argument error

**Category**: integration
**Priority**: must
**Source**: spec.md › Requirement: reopen requires --from and --reason › Scenario: reopen without --reason is an argument error

---

### TC-005: reopen of a job with a merged PR is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen rejects ineligible jobs › Scenario: reopen of a job with a merged PR is rejected

---

### TC-006: reopen of an archived job is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen rejects ineligible jobs › Scenario: reopen of an archived job is rejected

---

### TC-007: reopen of a canceled job is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen rejects ineligible jobs › Scenario: reopen of a canceled job is rejected

---

### TC-008: re-run after reopen adds a new iteration without touching prior evidence

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen preserves prior evidence and appends new iterations › Scenario: re-run after reopen adds a new iteration without touching prior evidence

---

### TC-009: the reopen operator event is present in the journal

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen records an operator event in the journal › Scenario: the reopen operator event is present in the journal

---

### TC-010: the PR and branch survive a reopen

**Category**: integration
**Priority**: should
**Source**: spec.md › Requirement: reopen preserves the branch and PR › Scenario: the PR and branch survive a reopen

---

### TC-011: a stale reviewer approval is not reused on a new revision

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen re-binds approvals to the new revision › Scenario: a stale reviewer approval is not reused on a new revision

---

### TC-012: stale conformance approval does not short-circuit re-verification

**Category**: unit
**Priority**: must
**Source**: spec.md › Requirement: reopen re-binds approvals to the new revision › Scenario: stale conformance approval does not short-circuit re-verification

---

### TC-013: reopen fails closed when no PR is recorded on the job

**Category**: unit
**Priority**: must
**Source**: design.md D3

**GIVEN** a job with status `awaiting-archive` whose `state.pullRequest` is absent  
**WHEN** `ReopenCommand.prepare()` is called with `--from <step> --reason "x"`  
**THEN** it throws `PrepareError` with exit code 1 and a message indicating no PR exists to reopen  
**AND** the persisted job status remains `awaiting-archive`

---

### TC-014: reopen rejects when the PR state is CLOSED

**Category**: unit
**Priority**: must
**Source**: design.md D3

**GIVEN** a job with status `awaiting-archive` whose recorded PR is in state `CLOSED`  
**WHEN** `ReopenCommand.prepare()` is called with `--from <step> --reason "x"`  
**THEN** it throws `PrepareError` with exit code 1 and a message indicating the PR is closed  
**AND** the job status remains `awaiting-archive`

---

### TC-015: reopen fails closed when the PR-state query fails or no GitHub client is available

**Category**: unit
**Priority**: must
**Source**: design.md D3

**GIVEN** a job with status `awaiting-archive` with a recorded PR number  
**AND** the GitHub client is absent or the `getPullRequest` call returns an error  
**WHEN** `ReopenCommand.prepare()` is called  
**THEN** it throws `PrepareError` with exit code 1 (fail-closed) and a message directing the operator to `specrunner login`  
**AND** the job status remains `awaiting-archive`

---

### TC-016: transitionJob with allowReopen=true succeeds for awaiting-archive → running

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** a `JobState` with status `awaiting-archive`  
**WHEN** `transitionJob(state, "running", ctx, { allowReopen: true })` is called  
**THEN** the returned/persisted state has status `running`  
**AND** a history entry recording the `awaiting-archive → running` transition is appended

---

### TC-017: transitionJob without allowReopen throws for awaiting-archive → running

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** a `JobState` with status `awaiting-archive`  
**WHEN** `transitionJob(state, "running", ctx)` is called (no opts or `allowReopen: false`)  
**THEN** the function throws  
**AND** the state status remains `awaiting-archive`

---

### TC-018: reopen from inside a specrunner worktree is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** the current process is running inside a specrunner-managed worktree (`detectSpecrunnerWorktree` returns true)  
**WHEN** `ReopenCommand.prepare()` is called  
**THEN** it throws `PrepareError` with exit code 2  
**AND** no state mutation is performed

---

### TC-019: reopen without --from is an argument error

**Category**: integration
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** a job with status `awaiting-archive` and an OPEN PR  
**WHEN** the operator runs `job reopen <slug> --reason "x"` without the `--from` flag  
**THEN** the command exits with the argument error code (`EXIT_CODE.ARG_ERROR`)  
**AND** the job status is unchanged  
**AND** the pipeline is not started

---

### TC-020: reopen transition patch clears only run-control fields

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** a job with status `awaiting-archive` with populated `steps`, `reviewerStatuses`, `decisions`, and `biteEvidence`  
**WHEN** `ReopenCommand.prepare()` completes and the transition is persisted  
**THEN** `steps`, `reviewerStatuses`, `decisions`, and `biteEvidence` are byte-for-byte identical to their pre-reopen values  
**AND** only `error`, `resumePoint`, `mainCheckoutDrift`, and `pid` are changed by the patch

---

### TC-021: operator event is appended before the transition is persisted

**Category**: unit
**Priority**: should
**Source**: design.md D6

**GIVEN** a job with status `awaiting-archive` and an OPEN PR  
**WHEN** `ReopenCommand.prepare()` runs  
**THEN** the `operator-event` record with `action: "reopen"` appears in `events.jsonl`  
**AND** its file offset precedes the `awaiting-archive → running` transition history record  
**AND** even if the subsequent pipeline run fails, the operator event remains durable

---

### TC-022: fold returns operatorEvents:[] when no operator-event lines exist

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** a job journal (`events.jsonl`) containing only `step-attempt`, `transition`, and `lineage` records  
**WHEN** `fold()` is called on it  
**THEN** the returned `FoldResult` has `operatorEvents: []`  
**AND** the existing fields (`steps`, `history`, `lineage`) reflect the same values as before this change

---

### TC-023: ENOENT-branch FoldResult includes operatorEvents:[]

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02 / design.md Risks

**GIVEN** the `events.jsonl` file does not exist  
**WHEN** `fold()` is evaluated (via the ENOENT branch in `persist()`)  
**THEN** the returned `FoldResult` literal includes `operatorEvents: []` alongside the other empty-default fields  
**AND** the type checker accepts the literal without error

---

### TC-024: CLI returns exit code 0 on a successful reopen

**Category**: integration
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** a job with status `awaiting-archive` and an OPEN PR  
**WHEN** `runReopenCore(slug, { from: "<step>", reason: "<text>" })` is called and completes successfully  
**THEN** the function returns `0`

---

## Result

```yaml
result: completed
total: 24
automated: 24
manual: 0
must: 17
should: 7
could: 0
blocked_reasons: []
```

# Test Cases: request-review pipeline step

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 33
- **Manual**: 0
- **Priority**: must: 16, should: 16, could: 1

---

### TC-001: run starts at request-review

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request-review SHALL be the first pipeline step > Scenario: run starts at request-review

---

### TC-002: request-review registered as agent step

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: request-review SHALL be the first pipeline step > Scenario: request-review is registered as an agent step

---

### TC-003: verdict derived from tool result (approve)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review SHALL report a typed verdict via report_result > Scenario: verdict derived from tool result

---

### TC-004: missing tool call falls back to needs-discussion

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review SHALL report a typed verdict via report_result > Scenario: missing tool call falls back to needs-discussion

---

### TC-005: verdict matched as string in transition table

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The Verdict type SHALL NOT be extended > Scenario: verdict matched as string in transition table

---

### TC-006: approve proceeds to design

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: approve SHALL route to design > Scenario: approve proceeds to design

---

### TC-007: needs-discussion escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: needs-discussion SHALL halt the pipeline > Scenario: needs-discussion escalates

---

### TC-008: reject escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reject SHALL halt the pipeline > Scenario: reject escalates

---

### TC-009: result file produced on first iteration

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request-review SHALL write a result file > Scenario: result file produced on first iteration

---

### TC-010: request.md unchanged after review

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: request-review SHALL remain read-only > Scenario: request.md unchanged after review

---

### TC-011: draft persists after run

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run SHALL preserve the draft > Scenario: draft persists after run

---

### TC-012: edited draft is reviewed after resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume SHALL re-copy the draft into the worktree > Scenario: edited draft is reviewed after resume

---

### TC-013: absent draft is skipped on resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume SHALL re-copy the draft into the worktree > Scenario: absent draft is skipped

---

### TC-014: draft removed on archive

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive SHALL delete the draft directory > Scenario: draft removed on archive

---

### TC-015: removed command rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the `request review` command SHALL be removed > Scenario: removed command rejected

---

### TC-016: request-review agent registered on managed setup

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: managed runtime SHALL register the request-review agent > Scenario: request-review agent registered on setup

---

### TC-017: default model is sonnet

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: request-review model SHALL follow the config resolution chain > Scenario: default model is sonnet

---

### TC-018: config override applies

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: request-review model SHALL follow the config resolution chain > Scenario: config override applies

---

### TC-019: parseRequestReviewReportInput ignores invalid verdict value

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `parseRequestReviewReportInput({ ok: true, verdict: "xxx" })` is called
**WHEN** the function validates the verdict field
**THEN** it returns a success result whose `value` does not contain the `verdict` field (or the field is absent/undefined)

---

### TC-020: requestReviewResultPath format

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** slug `"foo"` and iteration `1`
**WHEN** `requestReviewResultPath("foo", 1)` is called
**THEN** the returned path is `"specrunner/changes/foo/request-review-result-001.md"`

---

### TC-021: getOutputTemplates for request-review returns result file on first iteration

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** a pipeline state with no prior `request-review` steps and slug `"foo"`
**WHEN** `getOutputTemplates("request-review", "foo", state)` is called
**THEN** exactly one template is returned with path `specrunner/changes/foo/request-review-result-001.md`

---

### TC-022: RequestReviewStep kind, name, and reportTool properties

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** the `RequestReviewStep` module
**WHEN** its static properties are inspected
**THEN** `kind === "agent"`, `name === "request-review"`, and `reportTool === REQUEST_REVIEW_REPORT_TOOL`

---

### TC-023: RequestReviewStep reads() declares request.md as required input

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** a `RequestReviewStep` instance with slug `"foo"`
**WHEN** `reads()` is called on the step
**THEN** the returned list includes a path entry for `specrunner/changes/foo/request.md`

---

### TC-024: verdict derived from tool result (reject)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** the request-review step's `finalizeStep()` receives a toolResult of `{ ok: true, verdict: "reject" }`
**WHEN** the outcome is derived
**THEN** the recorded step verdict is `"reject"`

---

### TC-025: error transition routes to escalate

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-08

**GIVEN** `STANDARD_TRANSITIONS` for the `request-review` step
**WHEN** the transition entry for `on: "error"` is looked up
**THEN** the `to` value is `"escalate"`

---

### TC-026: archive with absent draft exits cleanly

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-11

**GIVEN** an archivable job whose `specrunner/drafts/<slug>/` directory does not exist
**WHEN** `specrunner job archive <slug>` runs
**THEN** the command completes with exit code 0 and no error is thrown

---

### TC-027: request generate still works after review command removal

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** the `request review` command has been removed from the CLI
**WHEN** `specrunner request generate <args>` is invoked
**THEN** the command executes successfully (the shared `OneShotQueryClient` is intact)

---

### TC-028: STANDARD_DESCRIPTOR startStep matches PipelineRunCommand startStep

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-08

**GIVEN** `STANDARD_DESCRIPTOR.startStep` and the `startStep` produced by `PipelineRunCommand.prepare()`
**WHEN** both values are read
**THEN** both equal `"request-review"`

---

### TC-029: request-review is not in loopNames

**Category**: unit
**Priority**: could
**Source**: design.md > D3 / tasks.md > T-08

**GIVEN** `STANDARD_DESCRIPTOR.loopNames`
**WHEN** the array is inspected
**THEN** `"request-review"` is absent (request-review has no fixer loop)

---

### TC-030: archive stages draft deletion for git commit when draft is tracked

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-11

**GIVEN** an archivable job whose draft directory `specrunner/drafts/<slug>/` is git-tracked
**WHEN** `specrunner job archive <slug>` runs
**THEN** the deletion of `specrunner/drafts/<slug>/` is staged and included in the archive commit

---

### TC-031: system prompt instructs agent to call report_result

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** the request-review system prompt string
**WHEN** the prompt content is inspected
**THEN** it instructs the agent to call `report_result` with `{ ok: true, verdict: <approve|needs-discussion|reject> }` and then `end_turn`

---

### TC-032: initial message contains result file path and Read request.md instruction

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `buildRequestReviewInitialMessage({ slug, requestType, branch, iteration: 1, findingsPath })` is called
**WHEN** the returned message is inspected
**THEN** it includes the expected result file path (e.g. `request-review-result-001.md`) and an instruction for the agent to Read `request.md` from the change folder

---

### TC-033: parseRequestReviewReportInput propagates base parse failure

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `parseRequestReviewReportInput` is called with input that fails base `BaseReportResult` validation (e.g. `{ ok: "yes" }`)
**WHEN** the function processes the input
**THEN** it returns an error result (base parse failure propagates unchanged)

---

## Result

```yaml
result: completed
total: 33
automated: 33
manual: 0
must: 16
should: 16
could: 1
blocked_reasons: []
```

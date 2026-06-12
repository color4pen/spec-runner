# Test Cases: inbox-reject-dedup

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 7, should: 7, could: 1

---

### TC-001: Label removed from issue after successful reject

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Reject removes the approval label > Scenario: Label removed after successful reject

---

### TC-002: Label removal failure does not fail the reject

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Reject removes the approval label > Scenario: Label removal failure does not fail the reject

---

### TC-003: Dedup suppresses re-reject when label is still present

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Planner deduplicates reject notifications > Scenario: Dedup suppresses re-reject when label is still present

---

### TC-004: Dedup does not suppress when latest notification is a different kind

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Planner deduplicates reject notifications > Scenario: Dedup does not suppress when latest notification is a different kind

---

### TC-005: Dedup does not suppress a start when body becomes valid

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Planner deduplicates reject notifications > Scenario: Dedup does not suppress a start when body becomes valid

---

### TC-006: Start planned after label re-application with valid body

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Re-approved issue with valid body is planned for start > Scenario: Start planned after label re-application with valid body

---

### TC-007: removeLabel resolves on 204 response

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `GitHubApiClient` is configured with a mock HTTP handler returning 204 for `DELETE .../labels/{label}`
**WHEN** `removeLabel(owner, repo, issueNumber, label)` is called
**THEN** the promise resolves without throwing

---

### TC-008: removeLabel resolves on 404 response (idempotent)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `GitHubApiClient` is configured with a mock HTTP handler returning 404 for `DELETE .../labels/{label}`
**WHEN** `removeLabel(owner, repo, issueNumber, label)` is called
**THEN** the promise resolves without throwing

---

### TC-009: removeLabel throws SpecRunnerError on 422 response

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `GitHubApiClient` is configured with a mock HTTP handler returning 422 for `DELETE .../labels/{label}`
**WHEN** `removeLabel(owner, repo, issueNumber, label)` is called
**THEN** the promise rejects with `SpecRunnerError` having code `GITHUB_API_ERROR`

---

### TC-010: removeApprovalLabel not called when postRejectComment throws

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** the orchestrator is run with one invalid-body approved issue, and `postRejectComment` is mocked to reject with an error
**WHEN** `runInboxOrchestrator` executes
**THEN** `removeApprovalLabel` is not called, and `summary.errors` contains 1 entry

---

### TC-011: listIssueComments is called for unlinked approved issues before planInbox

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `approvedIssues` contains an issue whose number is not present in any existing job's `issueNumber`
**WHEN** `runInboxOrchestrator` runs the collection phase
**THEN** `listIssueComments` is called for that issue and its comments are available in `commentsByIssue` before `planInbox` is invoked

---

### TC-012: listIssueComments failure for unlinked approved issue is non-fatal

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `listIssueComments` is mocked to throw for an unlinked approved issue
**WHEN** `runInboxOrchestrator` runs the collection phase
**THEN** a warn message is written to stderr and the orchestrator continues without propagating the exception

---

### TC-013: Linked issues are not re-fetched in the dedup comment fetch path

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-03

**GIVEN** an approved issue is already linked to an existing job (present in `linkedIssueNumbers`)
**WHEN** `runInboxOrchestrator` runs the collection phase for dedup
**THEN** `listIssueComments` is not called for that issue via the unlinked-approved fetch path

---

### TC-014: planStarts without commentsByIssue produces RejectAction (backward compat)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `planStarts` is called with an invalid-body issue, an empty `linkedIssueNumbers` set, an approve limit, and `commentsByIssue` set to `undefined`
**WHEN** `planStarts` runs
**THEN** `rejects` contains 1 `RejectAction` for the issue and `starts` is empty

---

### TC-015: planInbox wires commentsByIssue to planStarts enabling dedup

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `planInbox` input includes a `commentsByIssue` map containing a `kind="reject"` notification for an unlinked invalid-body issue
**WHEN** `planInbox` is called
**THEN** no `RejectAction` is produced for that issue (dedup is applied via the wired map)

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 7
should: 7
could: 1
blocked_reasons: []
```

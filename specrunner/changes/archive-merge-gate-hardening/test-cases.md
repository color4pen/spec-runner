# Test Cases: archive-merge-gate-hardening

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 17
- **Manual**: 2
- **Priority**: must: 13, should: 6, could: 0

---

### TC-001: BLOCKED while checks pending does not escalate on first observation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A transient BLOCKED merge state MUST NOT short-circuit the CI wait loop > Scenario: BLOCKED while checks pending does not escalate on first observation

---

### TC-002: BLOCKED while checks pending → wait, then merge after checks pass

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A transient BLOCKED merge state MUST NOT short-circuit the CI wait loop > Scenario: BLOCKED while checks pending → wait, then merge after checks pass

---

### TC-003: checks success but PR still BLOCKED → branch-protection escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A persistent BLOCKED state after checks resolve MUST escalate as branch protection > Scenario: checks success but still BLOCKED → branch-protection escalation

---

### TC-004: no checks (grace exhausted) but PR still BLOCKED → branch-protection escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A persistent BLOCKED state after checks resolve MUST escalate as branch protection > Scenario: no checks (grace exhausted) but still BLOCKED → branch-protection escalation

---

### TC-005: mergeable UNKNOWN with green checks proceeds to the merge endpoint

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The pre-merge mergeable gate MUST be removed and final merge authority delegated to the merge endpoint > Scenario: mergeable UNKNOWN proceeds to the merge endpoint

---

### TC-006: no extra getPullRequest poll solely for the mergeable gate after loop breaks

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The pre-merge mergeable gate MUST be removed and final merge authority delegated to the merge endpoint > Scenario: no pre-merge mergeable poll is issued

---

### TC-007: 409 conflict response from merge endpoint → conflict-flavored escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A merge endpoint failure MUST escalate with a cause-distinguished message > Scenario: 409 conflict → conflict-flavored escalation

---

### TC-008: failed required status check from merge endpoint → checks-failed escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A merge endpoint failure MUST escalate with a cause-distinguished message > Scenario: failed required status check → checks-failed escalation

---

### TC-009: unclassified merge failure → generic branch-protection escalation with resume command

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: A merge endpoint failure MUST escalate with a cause-distinguished message > Scenario: other merge failure → generic escalation

---

### TC-010: DIRTY mergeStateStatus → conflict escalation, mergePullRequest not called (unchanged)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Conflict detection MUST remain fail-closed before and during merge > Scenario: DIRTY mergeStateStatus → conflict escalation (unchanged)

---

### TC-011: mergeable CONFLICTING → conflict escalation, mergePullRequest not called (unchanged)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Conflict detection MUST remain fail-closed before and during merge > Scenario: mergeable CONFLICTING → conflict escalation (unchanged)

---

### TC-012: classifyMergeFailure routes "conflict" substring to conflict bucket

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** a merge result message that contains the substring `"conflict"` (e.g. `"Merge conflict detected"`)
**WHEN** `classifyMergeFailure(message)` is called
**THEN** it returns `"conflict"`

---

### TC-013: classifyMergeFailure routes "required status check … has failed" to checks-failed bucket

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** a merge result message containing both `"required status check"` and `"has failed"` (e.g. `'required status check "ci/build" has failed'`)
**WHEN** `classifyMergeFailure(message)` is called
**THEN** it returns `"checks-failed"`

---

### TC-014: classifyMergeFailure returns "other" for messages that match no known pattern

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** a merge result message that contains neither `"conflict"` nor the `"required status check … has failed"` pattern (e.g. `"repository rule violations found"`)
**WHEN** `classifyMergeFailure(message)` is called
**THEN** it returns `"other"`

---

### TC-015: no production references to deleted checkMergeableForMerge symbols after T-04

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `checkMergeableForMerge`, `MERGEABLE_RETRY_COUNT`, `MERGEABLE_RETRY_DELAY_MS`, and `CheckMergeableResult` are removed from `src/core/finish/pr-status.ts`
**WHEN** `grep` is run over `src/` for each of the removed identifiers AND `bun run typecheck` is executed
**THEN** grep finds zero matches in production files and typecheck exits with code 0

---

### TC-016: fetchPrViewWithRetry tests pass unchanged after pr-status.ts cleanup

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05b, design.md > D3

**GIVEN** the `checkMergeableForMerge` describe block and its imports are removed from `pr-status.test.ts`
**WHEN** the remaining `fetchPrViewWithRetry` describe block is executed via `bun test`
**THEN** all `fetchPrViewWithRetry` tests pass without any modifications to them

---

### TC-017: merge endpoint 405 "not mergeable" is classified transient and retried to success

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05c (adapter regression: TC-PM-016)

**GIVEN** `mergePullRequest` receives an HTTP 405 response with body `"not mergeable"` on the first attempt
**WHEN** `retryWithBackoff` retries via `isMergeTransientFailure` and the subsequent attempt returns HTTP 200
**THEN** the final merge result is `{ merged: true }` and the adapter-level test TC-PM-016 passes without modification

---

### TC-018: merge endpoint 405 "required status check … is expected" is classified transient and retried to success

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05c (adapter regression: TC-PM-018 / TC-PM-021)

**GIVEN** `mergePullRequest` receives an HTTP 405 response with body containing `"required status check … is expected"` on the first attempt
**WHEN** `retryWithBackoff` retries via `isMergeTransientFailure` and the subsequent attempt returns HTTP 200
**THEN** the final merge result is `{ merged: true }` and the adapter-level tests TC-PM-018 / TC-PM-021 pass without modification

---

### TC-019: typecheck, test suite, and build all succeed after all changes applied

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** all production and test changes from T-01 through T-05 are applied
**WHEN** `bun run typecheck`, `bun test`, and `bun run build` are executed in sequence
**THEN** all three commands exit with code 0 and no type errors, test failures, or build errors are reported

---

## Result

```yaml
result: completed
total: 19
automated: 17
manual: 2
must: 13
should: 6
could: 0
blocked_reasons: []
```

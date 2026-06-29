# Spec: archive-merge-gate-hardening

## Requirements

### Requirement: A transient BLOCKED merge state MUST NOT short-circuit the CI wait loop

The `job archive --with-merge` CI wait loop (Step 4 of `runMergeThenArchive`) SHALL NOT
treat `mergeStateStatus === "BLOCKED"` as an immediate, permanent failure. While the
archive commit's required checks are still resolving, a `BLOCKED` state is a transient
condition and the loop MUST continue polling check status rather than escalating.

Concretely, when the PR's `mergeStateStatus` is `BLOCKED`, the loop SHALL fall through to
check-status polling. If the check rollup is `pending`, the loop MUST keep waiting (bounded
by the existing wait deadline). If the check rollup is `failure`, the existing check-failure
escalation MUST fire. The loop MUST NOT raise a branch-protection escalation merely because
`BLOCKED` was observed while checks were still pending.

#### Scenario: BLOCKED while checks pending → wait, then merge after checks pass

**Given** `job archive --with-merge` has pushed the archive commit and the PR head reflects it
**And** the first poll returns `mergeStateStatus = "BLOCKED"` with the check rollup `pending`
**When** the wait loop polls again and the PR returns `mergeStateStatus = "CLEAN"` with the check rollup `success`
**Then** no branch-protection escalation is raised during the pending poll
**And** the loop proceeds to call `mergePullRequest`

#### Scenario: BLOCKED while checks pending does not escalate on first observation

**Given** the wait loop observes `mergeStateStatus = "BLOCKED"` and a `pending` check rollup
**When** the iteration completes
**Then** the loop sleeps and re-polls instead of returning an escalation

---

### Requirement: A persistent BLOCKED state after checks resolve MUST escalate as branch protection

When the check rollup resolves to `success` (or to `none` after the no-checks grace period is
exhausted) but the PR's `mergeStateStatus` is still `BLOCKED`, the wait loop SHALL raise a
branch-protection escalation instead of proceeding to merge. This covers branch-protection
requirements that are not expressed as commit checks (for example, a missing required review).
The escalation MUST NOT proceed to `mergePullRequest` and MUST NOT run post-merge cleanup.

#### Scenario: checks success but still BLOCKED → branch-protection escalation

**Given** the wait loop observes a `success` check rollup
**And** the same poll reports `mergeStateStatus = "BLOCKED"`
**When** the loop evaluates whether to merge
**Then** it returns exitCode 1 with a branch-protection escalation
**And** `mergePullRequest` is not called
**And** post-merge cleanup is not called

#### Scenario: no checks (grace exhausted) but still BLOCKED → branch-protection escalation

**Given** the check rollup stays `none` until the no-checks grace period is exhausted
**And** the poll reports `mergeStateStatus = "BLOCKED"`
**When** the grace period elapses
**Then** the loop returns exitCode 1 with a branch-protection escalation
**And** `mergePullRequest` is not called

---

### Requirement: The pre-merge mergeable gate MUST be removed and final merge authority delegated to the merge endpoint

The archive merge path SHALL NOT call a pre-merge `mergeable` gate before invoking
`mergePullRequest`. After the CI wait loop breaks on green checks, `runMergeThenArchive` MUST
call `mergePullRequest` directly. A `mergeable` value of `UNKNOWN` (GitHub's still-computing
null state) MUST NOT block the merge path, because the synchronous merge endpoint together
with the existing transient-failure retry classifier is the authoritative arbiter of
mergeability.

#### Scenario: mergeable UNKNOWN proceeds to the merge endpoint

**Given** the CI wait loop has broken on a `success` check rollup
**And** the PR's `mergeable` is `UNKNOWN`
**When** `runMergeThenArchive` reaches the merge step
**Then** it calls `mergePullRequest` without any prior mergeable-gate escalation

#### Scenario: no pre-merge mergeable poll is issued

**Given** the CI wait loop has broken on green checks
**When** `runMergeThenArchive` performs the merge step
**Then** it does not issue an additional `getPullRequest` call solely to gate on `mergeable` before merging

---

### Requirement: A merge endpoint failure MUST escalate with a cause-distinguished message

When `mergePullRequest` returns `{ merged: false }` after exhausting its transient-failure
retries, `runMergeThenArchive` SHALL escalate with a message that distinguishes the cause:
a merge conflict (409), a failed required status check ("required status check ... has
failed"), and any other failure each map to a distinct escalation `failedStep`/recommended
action. Every such escalation MUST include a resume command that re-runs the archive merge.

#### Scenario: 409 conflict → conflict-flavored escalation

**Given** `mergePullRequest` returns `{ merged: false }` with a message indicating a merge conflict
**When** `runMergeThenArchive` handles the failed result
**Then** it returns exitCode 1 with a conflict escalation that recommends rebasing onto the base branch
**And** post-merge cleanup is not called

#### Scenario: failed required status check → checks-failed escalation

**Given** `mergePullRequest` returns `{ merged: false }` with a message indicating a required status check has failed
**When** `runMergeThenArchive` handles the failed result
**Then** it returns exitCode 1 with an escalation that recommends fixing the failing checks

#### Scenario: other merge failure → generic escalation

**Given** `mergePullRequest` returns `{ merged: false }` with an unclassified message
**When** `runMergeThenArchive` handles the failed result
**Then** it returns exitCode 1 with a branch-protection escalation that includes a resume command

---

### Requirement: Conflict detection MUST remain fail-closed before and during merge

Removing the pre-merge mergeable gate SHALL NOT weaken conflict safety. The wait loop MUST
continue to escalate when it observes `mergeStateStatus === "DIRTY"` or
`mergeable === "CONFLICTING"`, and the merge endpoint's 409 conflict response MUST result in
a non-merged escalation. A conflicting PR MUST never be merged by the archive merge path.

#### Scenario: DIRTY mergeStateStatus → conflict escalation (unchanged)

**Given** the wait loop observes `mergeStateStatus = "DIRTY"`
**When** the iteration evaluates conflict state
**Then** it returns exitCode 1 with a conflict escalation and does not call `mergePullRequest`

#### Scenario: mergeable CONFLICTING → conflict escalation (unchanged)

**Given** the wait loop observes `mergeable = "CONFLICTING"`
**When** the iteration evaluates conflict state
**Then** it returns exitCode 1 with a conflict escalation and does not call `mergePullRequest`

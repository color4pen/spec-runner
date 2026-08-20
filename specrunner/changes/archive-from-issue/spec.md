# Spec: awaiting-archive checkpoint の issue 起点取り込み

## Requirements

### Requirement: awaiting-archive checkpoint verification policy

The system SHALL provide a checkpoint verification policy that accepts a checkpoint only when
`state.status === "awaiting-archive"` and `state.pullRequest.number` is present. The policy MUST NOT
impose resume-only preconditions (resumePoint resolution, pipeline descriptor resolution, or the
resume-step reads() precheck). The generic integrity layer (journal / counter / profile / request.md /
identity) and the existing awaiting-resume policy MUST remain unchanged.

#### Scenario: awaiting-archive checkpoint with PR number is accepted

**Given** a self-consistent checkpoint whose state.status is "awaiting-archive" and whose
state.pullRequest.number is set
**When** verifyCheckpoint runs with the awaiting-archive policy
**Then** verification succeeds and returns a VerifiedCheckpoint

#### Scenario: awaiting-resume checkpoint is rejected by the awaiting-archive policy

**Given** a checkpoint whose state.status is "awaiting-resume"
**When** verifyCheckpoint runs with the awaiting-archive policy
**Then** it throws checkpointNotAttachableError with reason "not-quiescent"

#### Scenario: running checkpoint is rejected by the awaiting-archive policy

**Given** a checkpoint whose state.status is "running"
**When** verifyCheckpoint runs with the awaiting-archive policy
**Then** it throws checkpointNotAttachableError with reason "not-quiescent"

#### Scenario: awaiting-archive checkpoint missing PR number is rejected

**Given** a checkpoint whose state.status is "awaiting-archive" but whose state.pullRequest.number is absent
**When** verifyCheckpoint runs with the awaiting-archive policy
**Then** it throws checkpointNotAttachableError indicating the missing PR number

### Requirement: job attach accepts both quiescent statuses and emits a status-specific hint

`job attach --branch <branch>` SHALL select the verification policy by the checkpoint status:
awaiting-resume checkpoints MUST attach with the resume checks, awaiting-archive checkpoints MUST attach
with the awaiting-archive checks, and any other status MUST be rejected as not-quiescent. On success the
command MUST print a next-step hint that matches the status: awaiting-resume points to
`job resume <slug>`, awaiting-archive points to `job archive <slug> --with-merge`.

#### Scenario: attaching an awaiting-archive checkpoint succeeds with the archive hint

**Given** a branch whose checkpoint is awaiting-archive with a PR number
**When** the operator runs `job attach --branch <branch>`
**Then** the worktree and local state are materialized and the printed hint references
`job archive <slug> --with-merge`

#### Scenario: attaching an awaiting-resume checkpoint still succeeds with the resume hint

**Given** a branch whose checkpoint is awaiting-resume
**When** the operator runs `job attach --branch <branch>`
**Then** attach succeeds and the printed hint references `job resume <slug>`

#### Scenario: attaching a non-quiescent checkpoint is rejected

**Given** a branch whose checkpoint status is neither awaiting-resume nor awaiting-archive
**When** the operator runs `job attach --branch <branch>`
**Then** attach fails with checkpointNotAttachableError reason "not-quiescent"

### Requirement: completed-marker jobId resolution

The system SHALL resolve the jobId for issue-initiated archive from the issue's `kind="completed"`
notification marker. It MUST ignore `kind="escalation"` markers. When multiple completed markers exist
the most-recently-created one MUST be selected. When no completed marker exists the system MUST raise a
typed ARCHIVE_FROM_ISSUE_NO_MARKER error.

#### Scenario: newest completed marker selects the jobId

**Given** an issue with two completed markers carrying different jobIds and different createdAt values
**When** resolveCompletedJobId runs
**Then** it returns the jobId from the marker with the latest createdAt

#### Scenario: escalation markers are ignored

**Given** an issue that has escalation markers but no completed marker
**When** resolveCompletedJobId runs
**Then** it throws ARCHIVE_FROM_ISSUE_NO_MARKER

#### Scenario: no marker present is a typed error

**Given** an issue whose comments contain no specrunner notification markers
**When** resolveCompletedJobId runs
**Then** it throws ARCHIVE_FROM_ISSUE_NO_MARKER

### Requirement: closing-PR branch locator with four-field identity match

The system SHALL locate the archive target branch by enumerating the issue's closing pull request
references (GraphQL `closedByPullRequestsReferences`, exposing number and headRefName), fetching each
candidate's checkpoint, and confirming identity via a four-field match: `state.jobId === jobId`,
`state.issueNumber === issueNumber`, `state.branch === headRefName`, and
`state.pullRequest.number === PR.number`. Exactly one confirmed candidate MUST be returned. Zero closing
PRs MUST raise ARCHIVE_FROM_ISSUE_NO_PR. Zero or multiple confirmed candidates MUST raise
ARCHIVE_FROM_ISSUE_UNCONFIRMED. Candidates that mismatch any field or whose checkpoint is unreadable MUST
be skipped without blocking a valid match.

#### Scenario: unique four-field match resolves the branch

**Given** an issue with one closing PR whose head branch checkpoint matches jobId, issueNumber,
headRefName, and PR number
**When** resolveArchiveBranchFromIssue runs
**Then** it returns that branch, its slug, and its checkpoint OID

#### Scenario: zero closing PRs is a typed error

**Given** an issue with no closing pull request references
**When** resolveArchiveBranchFromIssue runs
**Then** it throws ARCHIVE_FROM_ISSUE_NO_PR

#### Scenario: multiple confirmed candidates is a typed error

**Given** an issue with two closing PRs that both satisfy the four-field match
**When** resolveArchiveBranchFromIssue runs
**Then** it throws ARCHIVE_FROM_ISSUE_UNCONFIRMED

#### Scenario: a candidate whose PR number mismatches the checkpoint is skipped

**Given** an issue with one closing PR whose checkpoint matches jobId / issueNumber / headRefName but
whose state.pullRequest.number differs from the PR number
**When** resolveArchiveBranchFromIssue runs
**Then** that candidate is skipped and, no candidate confirming, it throws ARCHIVE_FROM_ISSUE_UNCONFIRMED

### Requirement: job archive --from-issue CLI contract

`job archive` SHALL accept a `--from-issue <n>` flag that is mutually exclusive with the slug positional.
Supplying both, or neither, MUST exit with code 2. When `--from-issue` is used, the `--with-merge` and
`--merge-wait-ms` options MUST be carried through to the underlying archive execution.

#### Scenario: slug and --from-issue together exit 2

**Given** the invocation `job archive my-slug --from-issue 5`
**When** the command handler runs
**Then** it exits with code 2 and reports the mutual-exclusion error

#### Scenario: neither slug nor --from-issue exits 2

**Given** the invocation `job archive` with no slug and no --from-issue
**When** the command handler runs
**Then** it exits with code 2

#### Scenario: --with-merge is carried through the from-issue path

**Given** the invocation `job archive --from-issue 5 --with-merge`
**When** the command routes to the issue-initiated archive path
**Then** the resulting archive execution runs the merge-then-archive flow (withMerge = true)

### Requirement: local short-circuit for issue-initiated archive

When issue-initiated archive resolves a jobId whose local state already exists, the system SHALL run the
existing archive execution directly for that job's slug and MUST NOT perform branch resolution or rebind.

#### Scenario: existing local state skips rebind

**Given** `job archive --from-issue <n>` where loadStateByJobId returns local state for the resolved jobId
**When** runArchiveFromIssue executes
**Then** the closing-PR locator and rebind are not invoked and archive runs for the local job's slug

### Requirement: issue-initiated archive rebind connects to the existing archive orchestrator unchanged

When no local state exists, the system SHALL rebind the confirmed branch using the awaiting-archive policy
and `setupWorkspace(attachCheckpoint)` to materialize the worktree and local state, then run the existing
archive execution for the verified slug. The archive orchestrator logic MUST remain unchanged.

#### Scenario: rebind then archive for a remote awaiting-archive job

**Given** `job archive --from-issue <n> --with-merge` where no local state exists and the closing-PR
locator confirms a branch
**When** runArchiveFromIssue executes
**Then** the checkpoint is verified with the awaiting-archive policy, the workspace is materialized, and
archive runs with --with-merge for the verified slug

### Requirement: issue-initiated resume remains awaiting-resume only

`job resume --from-issue` SHALL continue to accept only awaiting-resume checkpoints. An awaiting-archive
checkpoint reached via resume MUST be rejected, and the escalation-marker + linkedBranches locator MUST be
unchanged.

#### Scenario: resume rejects an awaiting-archive checkpoint

**Given** a checkpoint whose state.status is "awaiting-archive"
**When** the resume rebind verifies it with the resume policy
**Then** verification throws checkpointNotAttachableError reason "not-quiescent"

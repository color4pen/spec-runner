# Spec: job resume --from-issue

## Requirements

### Requirement: locate a resumable job from an issue number via marker and Development links

`job resume --from-issue <n>` SHALL locate the target job from the issue number alone,
without reading the issue body. The system MUST derive the full jobId from an escalation
marker in the issue comments, enumerate candidate branches from the issue's GitHub
Development links (`linkedBranches` and `closedByPullRequestsReferences`), and confirm the
target by checkpoint identity.

#### Scenario: linked branch form resolves through the full chain

**Given** an issue whose latest escalation comment carries the marker for jobId `J`
**And** the issue has a Development linked branch `B` whose published checkpoint has
`state.jobId === J`, `state.issueNumber === n`, and `state.branch === B`
**And** no local job state exists for jobId `J`
**When** `job resume --from-issue n` runs
**Then** the branch `B` is confirmed, its checkpoint is rebound via the attach-resume policy,
and the run merges into the normal resume for the resolved slug

#### Scenario: linked PR head form resolves through the full chain

**Given** an issue whose linked branch was converted into a PR, so the Development link is
exposed only via `closedByPullRequestsReferences` with head branch `B`
**And** `B`'s published checkpoint has `state.jobId === J`, `state.issueNumber === n`,
and `state.branch === B` matching the marker jobId `J`
**When** `job resume --from-issue n` runs
**Then** `B` is enumerated as a candidate, confirmed by identity, rebound, and resumed

### Requirement: the issue body MUST NOT be read on the resume-from-issue path

The resolution path SHALL read only issue comments (for the escalation marker) and the
issue's Development links (resolved by issue number via GraphQL). It MUST NOT fetch the
issue body (`getIssue`), and MUST NOT reverse-engineer the branch from a naming convention.

#### Scenario: getIssue is never called during resolution

**Given** a valid resumable issue with an escalation marker and a matching linked-branch checkpoint
**When** `job resume --from-issue n` resolves and rebinds the target
**Then** the GitHub client's `getIssue` (which returns the issue body) is not called at any
point on the resolution path

### Requirement: the latest escalation marker wins when multiple are present

When several issue comments carry escalation markers, the system SHALL select the jobId from
the marker whose comment has the most recent creation time.

#### Scenario: newest escalation comment selects the jobId

**Given** an issue with two escalation-marker comments, an older one for jobId `J1` and a newer
one for jobId `J2`
**When** the resolver scans the comments
**Then** the selected jobId is `J2` (the newer comment's marker)

### Requirement: confirm the target only by matching all three checkpoint identity fields

A candidate branch SHALL be confirmed only when its checkpoint satisfies all three identity
checks: `state.jobId === marker jobId`, `state.issueNumber === requested issue number`, and
`state.branch === candidate branch name`. Any mismatch MUST cause the candidate to be rejected.
Exactly one confirmed candidate is required to proceed.

#### Scenario: issueNumber mismatch is rejected fail-closed

**Given** the only candidate branch's checkpoint has `state.jobId === J` and `state.branch`
matching, but `state.issueNumber` differs from the requested issue number
**When** `job resume --from-issue n` runs
**Then** the command stops fail-closed with an error stating the identity mismatch, and no
rebind or resume is performed

#### Scenario: jobId mismatch is rejected fail-closed

**Given** the only candidate branch's checkpoint has a matching `state.issueNumber` and
`state.branch`, but `state.jobId` differs from the marker jobId
**When** `job resume --from-issue n` runs
**Then** the command stops fail-closed with an error stating the identity mismatch, and no
rebind or resume is performed

#### Scenario: multiple simultaneously-confirmed candidates are rejected fail-closed

**Given** two candidate branches whose checkpoints both satisfy all three identity checks
**When** `job resume --from-issue n` runs
**Then** the command stops fail-closed with an error stating the ambiguity, and no rebind or
resume is performed

### Requirement: absent escalation marker stops with zero side effects

When no issue comment carries an escalation marker, the system SHALL stop with an explicit
error indicating there is no resumable escalation, and MUST NOT create any local state,
worktree, or perform any rebind.

#### Scenario: no marker present

**Given** an issue whose comments contain no escalation marker
**When** `job resume --from-issue n` runs
**Then** the command stops with an explicit "no resumable escalation" error and performs no
side effects

### Requirement: absent Development links stop fail-closed and guide to manual attach

When the issue has zero Development-link candidate branches (link absent), the system SHALL
stop fail-closed and MUST guide the operator to the manual `job attach --branch <branch>` →
`job resume` path. This preserves the Development link as an optional index while the
checkpoint remains the source of truth.

#### Scenario: zero linked branches guides to job attach

**Given** an issue whose escalation marker yields a jobId but which has no `linkedBranches`
and no `closedByPullRequestsReferences`
**And** no local job state exists for that jobId
**When** `job resume --from-issue n` runs
**Then** the command stops fail-closed with an error whose guidance references
`job attach --branch <branch>`

### Requirement: local job state for the marker jobId skips rebind and resumes directly

When local job state already exists for the jobId derived from the marker, the system SHALL
skip Development-link enumeration, identity confirmation, and rebind, and MUST merge directly
into the normal resume for that job's slug (idempotent re-entry).

#### Scenario: existing local state short-circuits to resume

**Given** an issue whose latest escalation marker yields jobId `J`
**And** local job state for jobId `J` is present in this checkout
**When** `job resume --from-issue n` runs
**Then** no Development-link lookup, identity confirmation, or rebind is performed, and the
run proceeds into the normal resume for the resolved slug

### Requirement: confirmed branch is rebound via the attach-resume policy then resumed

For a confirmed candidate branch, the system SHALL perform the rebind using the existing
attach-resume verification policy (generic integrity check → policy check → materialization)
and then merge into the normal resume. Rebind verification failures MUST propagate through
the existing error path unchanged.

#### Scenario: rebind verification failure propagates unchanged

**Given** a confirmed candidate branch whose checkpoint fails the attach-resume policy
(e.g. status is not `awaiting-resume`)
**When** `job resume --from-issue n` attempts the rebind
**Then** the existing attach verification error is propagated unchanged and the run stops

### Requirement: --from-issue is exclusive with the positional slug and orthogonal to --prompt/--detach

Passing both a positional `<slug>` and `--from-issue` SHALL be a usage error. `--from-issue`
MUST be combinable with `--prompt` and `--detach`, and MUST NOT change the behavior of the
other resume flags (`--from` / `--apply-canon` / `--adopt-commits` / `--force`).

#### Scenario: positional slug and --from-issue together is a usage error

**Given** the invocation `job resume some-slug --from-issue 5`
**When** the command is dispatched
**Then** it exits with an argument-usage error and performs no resume

#### Scenario: --from-issue combines with --detach

**Given** the invocation `job resume --from-issue 5 --detach` from a resumable issue
**When** the command runs and is not a detached child
**Then** the parent resolves the target slug and detaches, without performing the rebind or
resume itself

### Requirement: usage text and guide reflect the --from-issue contract

The `job resume` usage text and the CLI built-in operator guide SHALL document the
`--from-issue` contract: the locator resolution rules (marker → Development links → checkpoint
identity), that rebind is included, the exclusivity with the positional slug, and the
`job attach --branch` guidance when links are absent.

#### Scenario: usage text documents --from-issue

**Given** the `job resume` usage/help text
**When** it is rendered
**Then** it includes the `--from-issue` option describing locator resolution, included rebind,
positional exclusivity, and the `job attach --branch` fallback

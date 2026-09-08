# Spec: job 境界での成果公開

## Requirements

### Requirement: local step completion preserves revisions without publication

Local normal steps, fixer iterations, parallel review rounds, and verification SHALL preserve existing staging checks, commits, journals, OID ledgers, exclusions, and revision bindings without pushing the feature branch.

#### Scenario: steps accumulate locally

**Given** a local job runs multiple successful steps
**When** each step, round, or verification finalizes
**Then** its inspected revision is committed and recorded locally, and no push occurs between them

#### Scenario: unsafe output is not adopted

**Given** output is excluded, out of scope, or exceeds a staging guard
**When** commit-only finalization runs
**Then** existing exclusion and fail-closed rules apply and publication suppression does not adopt the output

### Requirement: publication is independent from commit creation

Publication MUST compare remote and local revisions even when no new diff exists, and MUST verify every outgoing commit against the synthesized-commit ledger.

#### Scenario: no-diff retry

**Given** a ledgered local commit remains unpublished after a failed push and no file changed afterward
**When** publication is retried
**Then** the unpublished range is pushed instead of being skipped for lack of a new commit

#### Scenario: multiple commits are batched

**Given** multiple inspected step commits accumulated locally
**When** a publication boundary is reached
**Then** the complete verified range is published while each commit identity remains intact

#### Scenario: unknown commit fails closed

**Given** an outgoing commit is absent from the ledger
**When** publication runs without explicit operator adoption
**Then** it rejects the range without pushing or silently adopting that commit

### Requirement: PR processing follows successful result publication

For a PR-producing job, the pipeline MUST publish verified results before invoking the PR API and SHALL publish the persisted PR and final-state records afterward.

#### Scenario: first PR creation

**Given** required verification and review passed and no PR exists
**When** PR processing starts
**Then** result publication succeeds before create-PR, and PR metadata plus awaiting-archive are committed and published afterward

#### Scenario: existing PR retry

**Given** an open PR exists and validated commits are unpublished
**When** PR processing is retried
**Then** results are published, the existing PR is reused, and no duplicate PR is created

#### Scenario: pre-PR publication fails

**Given** results are committed but their push fails
**When** the pipeline reaches PR creation
**Then** no PR API is called, success is not reported, and a local retryable pre-PR failure remains

#### Scenario: post-PR publication fails

**Given** result publication and the PR API succeeded
**When** final-record push fails
**Then** success is not reported and the saved PR identity and local commits permit an idempotent retry

### Requirement: normal completion without PR publishes the branch

A GitHub-disabled job or profile without PR creation SHALL publish its validated results and final checkpoint to the remote feature branch without creating a PR.

#### Scenario: GitHub-disabled completion

**Given** GitHub integration is disabled
**When** the selected profile completes
**Then** results and final records reach the remote branch and no PR API is called

#### Scenario: no-PR profile completion

**Given** the profile has no pr-create step
**When** it reaches awaiting-archive
**Then** its accumulated results and final checkpoint are published

### Requirement: halt publication is an explicit stable job policy

Config SHALL expose boolean `pipeline.publishCheckpointOnHalt` defaulting to true, new jobs MUST store it as `checkpointPublication.publishOnHalt`, and legacy jobs without it SHALL resolve to true.

#### Scenario: configured policy is stored

**Given** effective config selects true or false
**When** a job is created
**Then** that exact value is stored in its branch-borne state

#### Scenario: config changes later

**Given** a job stored a policy and config later changes
**When** it is resumed, reopened, or attached
**Then** the stored job policy remains authoritative

#### Scenario: legacy policy

**Given** valid legacy state lacks checkpointPublication
**When** policy is resolved
**Then** publication on controlled halt is enabled

#### Scenario: effective value is visible

**Given** the option is set or omitted
**When** config effective is shown as text or JSON
**Then** its resolved value and source/default are displayed

### Requirement: controlled halts save safely and publish conditionally

Every controlled awaiting-resume transition, including the pre-pipeline fidelity gate, MUST first persist a quiescent local checkpoint and SHALL publish only its established safe scope when the stored policy is enabled.

#### Scenario: enabled halt supports remote resume

**Given** halt publication is enabled
**When** a halt checkpoint push succeeds
**Then** another checkout can attach/resume and remote-ready guidance is emitted only after success

#### Scenario: disabled halt supports local resume

**Given** halt publication is disabled
**When** a controlled halt occurs
**Then** state is saved without push, same-worktree resume remains possible, and remote recovery is not claimed

#### Scenario: gate halt follows policy

**Given** the fidelity gate halts before pipeline execution
**When** its awaiting-resume state is saved
**Then** the same enabled/disabled publication policy is applied

#### Scenario: halt push failure

**Given** publication is enabled and safe checkpoint commit succeeded
**When** push fails
**Then** local retryability remains and neither publication success nor remote readiness is reported

#### Scenario: residual output is not swept in

**Given** a halted step leaves uninspected or excluded worktree changes
**When** checkpoint is committed and published
**Then** only established managed checkpoint paths are staged

### Requirement: abrupt termination remains local-only

Signal, forced termination, and runner loss SHALL retain current local persistence and MUST NOT gain automatic publication; documentation SHALL distinguish them from controlled halts.

#### Scenario: signal stop

**Given** unpublished local commits exist
**When** a termination signal is handled
**Then** interruption state is saved locally without controlled-halt push

#### Scenario: ephemeral runner guidance

**Given** an operator reads Actions recovery guidance
**When** sudden loss is compared with controlled halt
**Then** it explains that unpublished results may be lost with the runner

### Requirement: failures are phase-specific and retryable

The CLI MUST distinguish pre-PR push, PR API, post-PR push, and halt-checkpoint push failures and MUST preserve local state without reporting published completion.

#### Scenario: API failure differs from push failure

**Given** pre-PR publication succeeded but the PR API failed
**When** the command reports the result
**Then** it identifies the API phase and retains the published branch for retry

#### Scenario: retry with no new files

**Given** any publication phase failed after committing all records
**When** a supported retry runs without new file changes
**Then** it retries the unpublished range

### Requirement: archive and managed runtime contracts remain intact

Archive MUST confirm record publication before archived transition or cleanup, and this change MUST NOT suppress managed-runtime remote handoff.

#### Scenario: archive push failure

**Given** archive record push fails
**When** archive orchestration returns
**Then** the job is not marked archived and successful cleanup does not remove results

#### Scenario: managed runtime

**Given** a managed-runtime job runs
**When** step and terminal handoffs occur
**Then** its existing publication responsibilities are unchanged

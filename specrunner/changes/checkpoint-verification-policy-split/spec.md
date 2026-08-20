# Spec: checkpoint 検証の分離 — generic integrity と use-case policy の二層化

## Requirements

### Requirement: verifyCheckpoint shall accept an optional verification policy

`verifyCheckpoint` SHALL accept an optional second argument of type `CheckpointVerificationPolicy`
that defaults to `attachResumePolicy`. When no policy is supplied, behavior is identical to the
current implementation.

#### Scenario: existing callers work without supplying a policy

**Given** `orchestrator.ts` calls `verifyCheckpoint({ slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo, checkpointOid })`
**When** no policy argument is passed
**Then** `verifyCheckpoint` uses `attachResumePolicy` as default and returns a `VerifiedCheckpoint` for a valid awaiting-resume checkpoint

#### Scenario: a custom policy can be injected at call site

**Given** a caller supplies a custom `CheckpointVerificationPolicy` as the second argument
**When** `verifyCheckpoint` runs
**Then** it calls `policy.verify(ctx)` with `{ state, slug, treeFiles }` instead of the built-in resume checks

---

### Requirement: generic integrity verification shall be independent of use-case policy

`verifyCheckpoint` MUST execute generic integrity checks (journal / projection integrity,
counter reversal, profile self-consistency, request.md presence, identity) before invoking the
supplied policy. These checks MUST fire regardless of which policy is passed.

#### Scenario: generic checks fire even when a permissive policy is supplied

**Given** a checkpoint whose `state.status` is `"awaiting-archive"` (not `"awaiting-resume"`)
  and which is otherwise structurally intact
**When** `verifyCheckpoint` is called with a stub policy whose `verify()` does nothing (never throws)
**Then** the checkpoint passes generic integrity and identity checks, and `verifyCheckpoint` returns a `VerifiedCheckpoint`

#### Scenario: integrity failure rejects before policy is evaluated

**Given** a checkpoint whose `events.jsonl` is corrupted (journal-corrupted)
**When** `verifyCheckpoint` is called with any policy
**Then** `verifyCheckpoint` throws `CHECKPOINT_NOT_ATTACHABLE` with reason `journal-corrupted`
  before `policy.verify()` is ever called

---

### Requirement: resume-specific checks shall live exclusively in attachResumePolicy

`attachResumePolicy.verify()` MUST implement the three resume-specific checks:
status guard, resume point resolution, and resume step reads() input verification.
These checks MUST NOT appear in the generic integrity layer.

#### Scenario: status not awaiting-resume is rejected by attachResumePolicy

**Given** a structurally intact checkpoint with `state.status === "awaiting-archive"`
**When** `attachResumePolicy.verify({ state, slug, treeFiles })` is called directly
**Then** it throws `CHECKPOINT_NOT_ATTACHABLE` with reason `not-quiescent`

#### Scenario: resume point unresolvable is rejected by attachResumePolicy

**Given** a checkpoint with `state.status === "awaiting-resume"` but an unresolvable `resumePoint`
  (e.g., references a step not present in the pipeline descriptor)
**When** `attachResumePolicy.verify({ state, slug, treeFiles })` is called
**Then** it throws `CHECKPOINT_NOT_ATTACHABLE` with reason `resume-step-unresolvable`

#### Scenario: required reads() input missing is rejected by attachResumePolicy

**Given** a valid awaiting-resume checkpoint whose resume step's `reads()` requires a file
  that is absent from `treeFiles`
**When** `attachResumePolicy.verify({ state, slug, treeFiles })` is called
**Then** it throws `CHECKPOINT_NOT_ATTACHABLE` with reason `resume-input-missing`

---

### Requirement: attach-resume behavior shall be preserved end-to-end

`job attach --branch` MUST continue to reject any checkpoint that is not in `awaiting-resume`
status, and MUST continue to accept and materialize a valid `awaiting-resume` checkpoint.
Error codes, error messages, and success output SHALL be unchanged.

#### Scenario: awaiting-archive checkpoint is rejected (end-to-end)

**Given** a branch whose checkpoint `state.status` is `"awaiting-archive"`
**When** `runAttachVerification` is called for that branch
**Then** it throws `CHECKPOINT_NOT_ATTACHABLE` with reason `not-quiescent`

#### Scenario: valid awaiting-resume checkpoint is accepted (end-to-end)

**Given** a branch whose checkpoint is a structurally intact `awaiting-resume` job
**When** `runAttachVerification` is called for that branch
**Then** it returns a `VerifiedCheckpoint` with the correct `slug`, `jobId`, `branch`, and `checkpointOid`

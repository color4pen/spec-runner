# Spec: pipeline-owned evidence authorship enforcement

## Requirements

### Requirement: Sequential per-node commit shall exclude pipeline-managed journal paths

The sequential per-node commit (`commitAndPush`) SHALL stage all changes **except** the
pipeline-managed journal paths for the slug (`events.jsonl`, `state.json`, `usage.json`), so that an
agent code commit never contains journal changes. The pipeline SHALL commit the journal separately in
a pipeline-managed journal commit that stages only those pipeline-managed paths.

#### Scenario: agent code commit excludes the journal

**Given** a sequential agent step that writes source code
**When** the pipeline creates the per-node commit for the step
**Then** the resulting commit's tree contains the source changes
**And** the commit's tree contains no change to `events.jsonl`, `state.json`, or `usage.json`.

#### Scenario: the pipeline still publishes the journal per node

**Given** a completed sequential agent step
**When** the pipeline finalizes the node
**Then** a pipeline-managed commit stages only the pipeline-managed journal paths
**And** the journal is pushed to the feature branch on origin.

### Requirement: The pipeline shall maintain a pipeline-authored evidence anchor

The pipeline SHALL maintain, from its own journal writes, a content digest of the journal bytes it
authored (`events.jsonl` and `state.json`). This anchor SHALL be held in-process during a run and
SHALL be published to a durable origin ref that the agent cannot write and that survives a local
process crash. The durable ref value SHALL be derived from the in-process anchor, not from a re-read
of on-disk bytes.

#### Scenario: anchor updates on every pipeline persist

**Given** a running job
**When** the pipeline persists the journal (any persist, including transition history and terminal
transitions)
**Then** the in-process anchor for that journal reflects the exact bytes the pipeline authored.

#### Scenario: durable anchor is agent-unreachable and crash-surviving

**Given** the pipeline has published the durable evidence ref for the feature branch
**When** the agent attempts to alter the durable ref
**Then** the agent has no push path to origin and cannot change it
**And** after a local process crash the ref remains readable for resume/attach.

### Requirement: The pipeline shall verify per-node journal authorship after the agent commit

For a sequential step on the local runtime, after the agent code commit and before recording step
success, the pipeline SHALL verify that (a) the agent commit's tree changes none of the
pipeline-managed journal paths, and (b) the on-disk worktree journal matches the in-process anchor as
of the last pipeline write before the agent ran. A verification that cannot be evaluated SHALL be
treated as a violation (fail-closed).

#### Scenario: Edit/Write tamper is detected (T1)

**Given** an agent that modified `events.jsonl` or `state.json` via Edit/Write during the step
**When** per-node verification runs after the agent commit
**Then** the on-disk journal does not match the anchor
**And** the pipeline detects a forgery.

#### Scenario: Bash tamper is detected (T2)

**Given** an agent that modified the journal via a Bash command during the step
**When** per-node verification runs
**Then** the pipeline detects a forgery.

#### Scenario: git-plumbing tree swap is detected (T3)

**Given** an agent that placed a tampered journal into the commit's tree via `git add`/plumbing
**When** per-node verification inspects the committed tree of the agent commit
**Then** the agent commit is found to change a pipeline-managed journal path
**And** the pipeline detects a forgery.

#### Scenario: coordinated events+state tamper is detected (T5)

**Given** an agent that altered `events.jsonl` and `state.json` consistently with each other
**When** per-node verification runs
**Then** both files diverge from the pipeline-authored anchor
**And** the pipeline detects a forgery.

### Requirement: Resume shall verify on-disk journal authenticity before folding

On resume, before the on-disk journal is folded into the resumed state, the pipeline SHALL verify the
on-disk worktree journal against the durable evidence anchor. On mismatch it SHALL restore the journal
from the durable (agent-unreachable) origin source and then halt. A clean journal SHALL resume
normally.

#### Scenario: crash-then-resume tamper is detected, restored, and halted (T4)

**Given** a journal tampered during a step, after which the process crashed without running per-node
verification
**When** the job is resumed and resume-load verification compares the on-disk journal to the durable
anchor
**Then** the mismatch is detected
**And** the on-disk journal is restored from the durable origin source
**And** the resume halts (escalation) rather than folding the tampered bytes.

#### Scenario: clean resume proceeds

**Given** a job whose on-disk journal matches the durable anchor
**When** the job is resumed
**Then** resume-load verification passes and the job resumes without halting.

### Requirement: Attach shall verify checkpoint journal authenticity

`verifyCheckpoint` SHALL add an authenticity predicate: the checkpoint tree journal SHALL match the
durable evidence anchor for the branch, in addition to the existing self-consistency checks. A
mismatch SHALL reject the attach with a checkpoint-not-attachable authenticity error and SHALL NOT
create any local state. An authentic checkpoint SHALL attach as before.

#### Scenario: tampered checkpoint is rejected

**Given** a checkpoint whose tree journal does not match the durable evidence anchor
**When** attach verification runs
**Then** attach is rejected with an authenticity error
**And** no worktree, sidecar, or job state is created.

#### Scenario: authentic checkpoint attaches

**Given** a checkpoint whose tree journal matches the durable evidence anchor and passes
self-consistency
**When** attach verification runs
**Then** the checkpoint is accepted and attach proceeds.

### Requirement: On any authenticity violation the pipeline shall restore trusted bytes then halt

On any detected authenticity violation the pipeline SHALL restore the journal to trusted bytes before
halting, and SHALL NOT persist, commit, push, or attach the tampered bytes. For the per-node path the
restore source SHALL be the in-process pipeline-authored anchor; for the resume/attach paths it SHALL
be the durable origin anchor. When trusted bytes cannot be obtained, the pipeline SHALL halt without
adopting the tampered bytes (fail-closed).

#### Scenario: per-node restore precedes halt

**Given** a detected per-node forgery
**When** the pipeline halts the step
**Then** it first restores the worktree journal from the in-process anchor
**And** it does not persist the step as a success or push the tampered journal.

#### Scenario: checkpoint publish never carries tampered bytes

**Given** a tampered on-disk journal at a terminal transition (checkpoint / finalize)
**When** `commitFinalState` publishes the checkpoint
**Then** it restores the journal from the in-process anchor before staging/committing
**And** the origin feature-branch journal and the durable ref are mutually consistent.

### Requirement: Legitimate pipeline journal writes shall not be treated as violations

The pipeline's own legitimate journal writes (per-step persist, transition-history append, terminal
checkpoint/finalize) SHALL NOT be treated as authenticity violations on the continue, resume, or
attach happy paths.

#### Scenario: continued execution does not halt (T6)

**Given** a normally executing job whose journal is written only by the pipeline
**When** each per-node verification runs
**Then** no verification reports a forgery and the job continues.

#### Scenario: managed and no-worktree runtimes are unaffected

**Given** a managed-runtime job (or a `--no-worktree` local job without the required git primitives)
**When** the pipeline runs
**Then** the local per-node/resume/attach authenticity gates are structurally skipped
**And** the job's observable behavior is unchanged from before this change.

### Requirement: Existing pipeline, commit, resume, attach, and archive behaviors shall be preserved

Existing behavior-preservation tests for the pipeline, `commit-push`, resume, attach,
`verify-checkpoint`, and archive SHALL remain green without modification, except for additions that
express the newly-added authenticity behavior. `typecheck && test` SHALL be green.

#### Scenario: behavior-preservation suite stays green (T8)

**Given** the existing test suite
**When** this change is applied
**Then** existing behavior-preservation tests pass unmodified (aside from added authenticity
expectations)
**And** `typecheck` and `test` both succeed.

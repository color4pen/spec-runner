# Spec: pipeline-owned evidence journal の authorship 強制

## Requirements

### Requirement: agent の per-node commit shall not carry the pipeline journal

sequential per-node commit（`commitAndPush`）SHALL exclude the pipeline-managed paths
(`events.jsonl`, `state.json`, `usage.json`) from staging, so that the agent code commit
carries no journal change. The pipeline SHALL commit the persisted journal in a separate
pipeline-managed commit (staging only the pipeline-managed paths). The existing
agent self-commit (HEAD-advance) handling SHALL be preserved.

#### Scenario: agent code commit excludes the journal

**Given** a sequential agent step whose agent writes source files and the pipeline has persisted the step-started journal
**When** the per-node commit runs
**Then** the agent code commit's tree contains no change to `events.jsonl`, `state.json`, or `usage.json`, and the pipeline journal is carried by a separate pipeline-authored commit

#### Scenario: round journal is swept after the coordinator commit

**Given** a parallel review round has committed its declared outputs (which already exclude the pipeline-managed paths)
**When** the coordinator finishes `commitRound`
**Then** the pipeline emits one journal-only commit before the terminal `commitFinalState` so the round's journal bytes reach origin

### Requirement: the pipeline shall maintain an agent-unreachable, crash-surviving anchor of the journal it authored

The pipeline SHALL maintain an **in-process anchor** = the content digest of the full
journal bytes (`events.jsonl` + `state.json`) it has authored, updated from the bytes it
writes (never re-read from the agent-writable disk except a single seed). On a new process
that finds an existing journal, the pipeline SHALL seed the anchor by reading the on-disk
journal once **before** writing any delta. The pipeline SHALL maintain a **durable anchor**
as a git blob referenced by `refs/specrunner/evidence/<branch>` and SHALL push it to origin
at checkpoint (`commitFinalState`). The durable anchor SHALL reflect the in-process anchor
(pipeline-authored bytes only), never a re-read of on-disk at push time.

#### Scenario: the in-process anchor tracks authored bytes without re-reading disk

**Given** the pipeline persists the journal during continuous execution
**When** the anchor is queried
**Then** it equals the digest of the exact bytes the pipeline wrote, computed from in-memory accumulation (not from reading back the file)

#### Scenario: a resumed process seeds the anchor from disk once before writing

**Given** a new process resumes a job whose on-disk journal already exists and was validated authentic
**When** the pipeline performs its first journal mutation
**Then** it reads the on-disk journal once to seed the anchor before appending any delta, and subsequent appends keep the anchor reflecting the full bytes

#### Scenario: the durable anchor is pushed to origin at checkpoint

**Given** a job reaches a terminal transition (`awaiting-resume` or `awaiting-archive`) on a branch
**When** `commitFinalState` runs
**Then** the digest blob at `refs/specrunner/evidence/<branch>` is updated to the in-process anchor digest and pushed to origin

### Requirement: per-node authorship shall be verified against the in-process anchor (committed tree and on-disk)

After the per-node agent commit and commit-OID capture, and before the success persist,
the pipeline SHALL verify that (a) the agent's commit(s) for this step introduce no change
to the pipeline-managed journal paths (empty two-OID diff over `headBeforeStep..HEAD`), and
(b) the on-disk journal digest equals the in-process anchor digest. Any mismatch SHALL be
treated as forgery: the pipeline SHALL restore the anchor's pipeline-authored bytes to disk
and then halt (`awaiting-resume`) without persisting or advancing the tampered bytes.

#### Scenario: an Edit/Write tamper of the journal is detected, restored, and halted (T1)

**Given** an agent that modifies `events.jsonl` or `state.json` via Edit/Write during a node
**When** the per-node authorship verification runs
**Then** the on-disk digest mismatches the in-process anchor, the trusted bytes are restored to disk, and the step halts to `awaiting-resume`

#### Scenario: a Bash tamper of the journal is detected, restored, and halted (T2)

**Given** an agent that modifies the journal via Bash during a node
**When** the per-node authorship verification runs
**Then** the tamper is detected, the trusted bytes are restored, and the step halts

#### Scenario: a git-plumbing tamper committed into the tree is detected by the committed-tree tooth (T3)

**Given** an agent that uses `git add`/plumbing to place a tampered journal into the node commit's tree
**When** the per-node authorship verification runs
**Then** the `headBeforeStep..HEAD` diff over the pipeline-managed paths is non-empty and the step halts, even if the worktree on-disk journal matches the anchor

#### Scenario: coordinated tamper of both files is detected (T5)

**Given** an agent that edits `events.jsonl` and `state.json` consistently with each other
**When** the per-node authorship verification runs
**Then** the combined on-disk digest still mismatches the in-process anchor and the step halts

### Requirement: resume shall verify on-disk authenticity against the durable origin anchor before running

`ResumeCommand.prepare` SHALL, after resolving the job state and before the
`running`-transition persist, verify that the on-disk journal digest equals the durable
origin anchor (`refs/specrunner/evidence/<branch>`). On mismatch it SHALL restore the on-disk
journal from the origin checkpoint journal and halt (fail the prepare) rather than proceed.
If the durable anchor read is unavailable (e.g. offline), the verification SHALL fail closed.

#### Scenario: a pre-verification crash tamper is caught at resume load (T4)

**Given** a job with a prior durable checkpoint anchor, whose journal was tampered during a resumed node and whose process crashed before the per-node verification
**When** the job is resumed again
**Then** the on-disk journal digest mismatches the origin anchor, the on-disk journal is restored from the origin checkpoint, and the resume halts (fail-closed), so the pre-verification crash is not a laundering path

#### Scenario: an intentional awaiting-resume checkpoint resumes without a false halt (T6)

**Given** a job that stopped at an intentional `awaiting-resume` (escalation / exhaustion / guard-halt) whose `commitFinalState` pushed the checkpoint and anchor
**When** the job is resumed
**Then** the on-disk journal digest equals the origin anchor and resume proceeds without halting

### Requirement: attach shall verify checkpoint authenticity in addition to self-consistency

`verifyCheckpoint` SHALL add an authenticity predicate: the checkpoint tree's journal digest
(`computeJournalDigest(eventsJsonl, stateJson)`) SHALL equal the durable origin anchor digest.
On mismatch the checkpoint SHALL be rejected (`checkpointNotAttachableError`). The existing
self-consistency predicates (fold / counter / profile / identity) SHALL remain unchanged.

#### Scenario: a checkpoint whose journal does not match the anchor is not attachable

**Given** a checkpoint whose tree journal digest differs from `refs/specrunner/evidence/<branch>`
**When** `verifyCheckpoint` runs
**Then** it throws `checkpointNotAttachableError` for the authenticity violation

#### Scenario: an authentic checkpoint attaches (self-consistency plus authenticity)

**Given** an `awaiting-resume` checkpoint whose tree journal digest equals the origin anchor
**When** `verifyCheckpoint` runs
**Then** the authenticity predicate passes and attach proceeds as before

### Requirement: verification shall be fail-closed and shall not false-positive on legitimate pipeline writes

Each verification SHALL treat an undecidable outcome (anchor read unavailable, diff
unavailable, on-disk read failure) as tamper and halt. The absent-anchor rule SHALL be
unified across per-node / resume / attach: both anchors absent AND on-disk journal empty →
skip; both absent AND on-disk present → tamper (except the pre-branch/pre-feature `ref`-absent
skip, which is safe because the in-scope agent cannot make the origin ref absent);
in-process absent but durable present → use durable. Legitimate pipeline persist/checkpoint
writes SHALL NOT be treated as violations during continuous execution, intentional-resume,
or attach.

#### Scenario: continuous execution and intentional resume/attach do not halt (T6)

**Given** the pipeline's own persist/checkpoint writes during continuous execution, an intentional-resume, or an attach
**When** the authorship verifications run
**Then** no violation is raised and no halt occurs (the crash-recovery-window halt of requirement D8 is excluded from this false-positive prohibition)

### Requirement: existing pipeline / commit-push / resume / attach / archive behavior shall be preserved

The behavior-preservation tests for the existing pipeline, `commit-push`, resume, attach,
`verify-checkpoint`, and archive SHALL remain green without modification, except additions
that express the new authenticity behavior (authorship exclusion, anchor verification).
`typecheck` and `test` SHALL be green.

#### Scenario: authorship-separation is asserted for the sequential per-node commit (T7)

**Given** a sequential per-node commit
**When** the commit is inspected
**Then** it excludes `events.jsonl`, `state.json`, and `usage.json`, and the agent code commit contains no journal change

#### Scenario: the suite stays green with only authenticity-related additions (T8)

**Given** the existing behavior-preservation suites
**When** the test suite runs after this change
**Then** they pass without modification except the additions expressing the new authenticity expectations, and `typecheck && test` is green

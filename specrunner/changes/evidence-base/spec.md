# Spec: Evidence Base for bite-evidence

## Requirements

### Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base

The bite-evidence gate SHALL establish the red result by running the materialized test
files on the **Evidence Base** — the immutable job base tree (the base-branch tree at job
start) overlaid with the materialized test files' candidate-time content — and MUST NOT
check out the latest `test-materialize` commit as the base tree. The Evidence Base tree
MUST NOT contain any implementation produced during the job, regardless of how many times
`test-materialize` ran or in what order relative to `implementer`.

#### Scenario: Re-run shape earns assurance instead of deferring

**Given** a job whose state has an `implementer` commit that started before the latest
`test-materialize` commit (the re-run shape #991 routed to `strategy-deferred`)
**And** the materialized tests fail on the Evidence Base and pass at the branch HEAD
**When** the bite-evidence gate runs
**Then** the verdict is `passed` (not `strategy-deferred`)
**And** each record has `baseResult: "red"` and `candidateResult: "green"`.

#### Scenario: Job base is identical on first run and on resume

**Given** two job states that share the same first `synthesizedCommits` entry
**And** one state additionally has extra `test-materialize` / `implementer` runs and
operator commits appended to the ledger (a resumed / re-run state)
**When** the Evidence Base reference is resolved for each state
**Then** both resolve to the same job base tree (the first parent of the first
synthesized commit).

### Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits

The bite-evidence gate SHALL define the green candidate as the branch HEAD (the
provenance-approved reachable tree of pipeline-synthesized plus operator-adopted commits)
and MUST NOT define it as the latest `implementer` run's `commitOid`. A commit adopted via
`resume --adopt-commits` that is reachable from HEAD SHALL be included in the candidate
that the green result is measured against.

#### Scenario: Adopted operator commit is included in the candidate

**Given** a job whose branch HEAD reaches an operator commit adopted via `--adopt-commits`
that was created after the latest `implementer` commit
**When** the bite-evidence gate resolves the green candidate
**Then** the candidate is the HEAD OID (which reaches the adopted operator commit), not the
`implementer` run's `commitOid`.

### Requirement: The chronology-based contamination machinery SHALL be removed

The system SHALL remove the startedAt-order contamination detection
(`detectBaseImplementationContamination`), the gate's contamination short-circuit (step 3.5),
and the archive floor's `baseline unbuildable` precondition (P2.5). The archive floor's
base-red MUST be re-established on the Evidence Base so that a re-run shape can achieve the
`biteEvidence` dimension instead of being fail-closed to absent.

#### Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape

**Given** an archive-floor evaluation for a re-run-shape job under a `biteEvidence: required` floor
**When** achieved assurance is derived
**Then** the base-red check runs on the Evidence Base (job base tree + candidate test overlay)
**And** no `baseline unbuildable` diagnostic is produced
**And** `biteEvidence` is achieved when the tests are red on the Evidence Base and green at the archive HEAD.

#### Scenario: Archive floor is fail-closed when the Evidence Base reference is absent

**Given** an archive-floor evaluation for a job state with an empty or absent `synthesizedCommits` ledger
**And** the floor policy requires `biteEvidence`
**When** achieved assurance is derived
**Then** the `biteEvidence` dimension is absent (fail-closed, a diagnostic is recorded)
**And** `deriveAchievedAssurance` does not throw.

### Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts

The bite-evidence gate SHALL keep returning `strategy-deferred` for non-forward request
types, unset `scopedTestCommand`, unavailable (managed) runtime, absent job-base reference
(`resolveEvidenceBaseRev` returning null), absent HEAD OID (`captureHeadSha` returning
null), and empty materialized-test selection; SHALL keep returning `failed` on a tamper
mismatch; SHALL keep `FORWARD_TYPES` equal to `{bug-fix, new-feature}`; and MUST never throw
(an unexpected error resolves to `strategy-deferred`).

#### Scenario: Non-forward type still defers

**Given** a job whose `request.type` is not in `FORWARD_TYPES`
**When** the bite-evidence gate runs
**Then** the verdict is `strategy-deferred` and no records are produced.

#### Scenario: Tamper mismatch still fails

**Given** a job whose `test-cases.md` hash does not match the frozen hash
**When** the bite-evidence gate runs
**Then** the verdict is `failed` with a tamper reason and no records are produced.

#### Scenario: Unavailable runtime still defers

**Given** a runtime that cannot run scoped tests on a synthesized tree (e.g. managed runtime,
or `scopedTestCommand` unset)
**When** the bite-evidence gate runs
**Then** the verdict is `strategy-deferred`.

#### Scenario: Absent HEAD OID defers

**Given** a forward-type job with a valid Evidence Base reference
**And** `captureHeadSha` returns null (e.g. the working tree has no commits reachable as HEAD)
**When** the bite-evidence gate runs
**Then** the verdict is `strategy-deferred` and no records are produced.

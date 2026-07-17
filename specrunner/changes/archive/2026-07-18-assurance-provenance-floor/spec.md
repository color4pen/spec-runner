# Spec: minimumAssurance floor を「達成 provenance」で判定する

## Requirements

### Requirement: the archive floor gate shall evaluate achieved provenance, not declared assurance

During `job archive --with-merge`, when `archive.minimumAssurance` is configured
with a non-empty `protectedPaths` AND a changed file matches those paths, the gate
SHALL evaluate `satisfiesFloor(achievedAssurance, floor)` where `achievedAssurance`
is derived from provenance the job mechanically achieved against the final PR HEAD
(the pushed `archiveSha`), NOT from the job's declared profile assurance
(`getProfile(state).assurance`). The functions `satisfiesFloor`, `getProfile`, and
`STANDARD_PROFILE` SHALL remain unchanged; only the assurance object passed to
`satisfiesFloor` changes from declared to achieved. This supersedes the
declaration-based evaluation established by the prior assurance-floor change.

#### Scenario: custom verification.commands repo fails closed on a required floor (anti-regression)

**Given** a repo whose `runTestsAtCommit` returns `unavailable` because custom `verification.commands` are configured
**And** `archive.minimumAssurance` constrains `biteEvidence: required` on a protected path
**And** the PR touches a file matching that protected path
**When** the archive floor gate runs
**Then** the achieved `biteEvidence` is absent (base-red re-measure is unavailable), the floor is not satisfied, and the merge is blocked with `exitCode 1` and `mergePullRequest` is not called

#### Scenario: a profile-absent (legacy) job is not authorized by declaration

**Given** a job with no `profile` (so `getProfile` returns `STANDARD_PROFILE`)
**And** `archive.minimumAssurance` constrains `biteEvidence: required` on a protected path the PR touches
**And** no achieved base-red / freeze provenance is establishable
**When** the archive floor gate runs
**Then** the merge is blocked with `exitCode 1` (the declared strongest profile does not authorize; achievement is required)

#### Scenario: an achieved job passes the floor and merges

**Given** a job whose materialized test files are all base-red at `baseOid` and byte-unchanged (frozen) from `baseOid` to the final HEAD, with `baseOid` and the final HEAD OID both resolvable
**And** `archive.minimumAssurance` constrains `testDerivation: frozen, biteEvidence: required` on a protected path the PR touches
**When** the archive floor gate runs
**Then** the achieved assurance carries `testDerivation: frozen` and `biteEvidence: required`, the floor is satisfied, and the merge proceeds (`exitCode 0`, `mergePullRequest` called)

### Requirement: achieved biteEvidence shall require freeze plus out-of-loop base-red

The achieved `biteEvidence` dimension SHALL be `required` only when ALL hold:
(a) `resolveBaseCandidateOids(state).baseOid` is resolvable AND the final HEAD OID
is defined; (b) the materialized test files (from `listCommitChangedFiles(baseOid)`
filtered by `isExcludedPath`) are byte-unchanged between `baseOid` and the final HEAD
(the two-OID path diff is empty); (c) those test files, when run at `baseOid`, are ALL
red (fail). If any prerequisite is unmet — including a non-empty two-OID diff, an
`unavailable` runtime result, zero materialized test files, or any test green at
`baseOid` — the achieved `biteEvidence` SHALL be absent. green@HEAD SHALL NOT be
re-run by the floor gate (it is enforced by the existing CI-wait gate).

#### Scenario: a tampered (modified) test file fails the freeze tooth

**Given** the materialized test files are all base-red at `baseOid`
**And** at least one materialized test file differs (non-empty two-OID diff) between `baseOid` and the final HEAD
**When** the achieved assurance is derived
**Then** the achieved `biteEvidence` and `testDerivation` are absent and a `biteEvidence: required` / `testDerivation: frozen` floor is blocked (`exitCode 1`)

#### Scenario: a hollow test (base-green) fails the base-red tooth

**Given** a materialized test file that passes (green) when run at `baseOid`
**When** the achieved assurance is derived
**Then** the achieved `biteEvidence` is absent and a `biteEvidence: required` floor is blocked (`exitCode 1`)

### Requirement: unestablished provenance shall fail closed (no fail-open)

When any provenance needed for a constrained floor dimension cannot be established —
final HEAD OID undefined, `baseOid` absent, `listCommitChangedFiles` unavailable, the
two-OID diff unavailable, `runTestsAtCommit` unavailable, or zero materialized test
files — the corresponding achieved field SHALL be absent (weak) and, if the floor
constrains that field, the merge SHALL be blocked fail-closed (`exitCode 1`,
`mergePullRequest` not called). An `unavailable` result SHALL NOT be treated as a
safe degradation that authorizes merge.

#### Scenario: each unavailable path fails closed against a constrained floor

**Given** `archive.minimumAssurance` constrains `biteEvidence: required` on a protected path the PR touches
**And** exactly one of: final HEAD OID undefined; `baseOid` absent; `listCommitChangedFiles` unavailable; two-OID diff unavailable; `runTestsAtCommit` unavailable; zero materialized test files
**When** the achieved assurance is derived
**Then** the achieved `biteEvidence` is absent and the merge is blocked with `exitCode 1`

### Requirement: achieved testDerivation and specReview shall be derived from mechanical facts

The achieved `testDerivation` SHALL be `frozen` when `baseOid` is resolvable AND the
materialized test files are frozen (empty two-OID diff), else absent. The achieved
`specReview` SHALL be `required` when the job executed a spec-review step
(`state.steps["spec-review"]` non-empty), else absent.

#### Scenario: spec-review executed yields achieved specReview required

**Given** a job whose `state.steps` contains a non-empty `spec-review` run list
**When** the achieved assurance is derived
**Then** the achieved `specReview` is `required`

#### Scenario: no spec-review run yields absent specReview

**Given** a job whose `state.steps` has no `spec-review` entry
**When** the achieved assurance is derived
**Then** the achieved `specReview` is absent and a `specReview: required` floor is blocked

### Requirement: a two-OID path freeze primitive shall exist on the runtime seam

The `RuntimeStrategy` port SHALL expose a method that reports which of the given paths
changed between two commit OIDs, returning the existing `ChangedFilesResult`
discriminated union and following the same never-throws / `unavailable` contract as
`listCommitChangedFiles`. The local runtime SHALL implement it via
`git diff --name-only <baseOid> <headOid> -- <paths>`; the managed runtime SHALL
always return `unavailable`.

#### Scenario: unchanged paths return an empty success

**Given** the given paths are identical between `baseOid` and `headOid` in the local runtime
**When** the two-OID diff primitive is called with those paths
**Then** it returns `{ kind: "success", files: [] }`

#### Scenario: changed paths return them in a success result

**Given** at least one of the given paths differs between `baseOid` and `headOid`
**When** the two-OID diff primitive is called
**Then** it returns `{ kind: "success", files: [...changed paths] }`

#### Scenario: managed runtime returns unavailable

**Given** the managed runtime (no local worktree)
**When** the two-OID diff primitive is called
**Then** it returns `{ kind: "unavailable", reason: ... }`

### Requirement: BiteEvidenceRecord shall be bindable to the final HEAD and remain backward compatible

`BiteEvidenceRecord` SHALL accept optional `baseOid`, `candidateOid`, and `testHash`
string fields, and the in-loop bite gate SHALL populate `baseOid` / `candidateOid`
when it generates records (and `testHash` when the runtime can digest artifacts).
State validation SHALL enforce these fields as strings when present and SHALL accept
records that omit them (legacy format). The per-file `testId` SHALL be retained.

#### Scenario: a full record round-trips through state validation

**Given** a `BiteEvidenceRecord` with `baseOid`, `candidateOid`, and `testHash` set to strings
**When** the state containing it is validated and persisted/reloaded
**Then** validation passes, enforces the string types, and the record round-trips intact

#### Scenario: a legacy record without the new fields remains valid

**Given** a `BiteEvidenceRecord` with only `testId`, `strategy`, `baseResult`, `candidateResult`, `verified`
**When** the state containing it is validated
**Then** validation passes (the new fields are optional)

### Requirement: existing gates and unit contracts shall be preserved

The protected-paths gate (Step 3.5), the truncated-file-list fail-closed path, the
verify-checkpoint profile digest check, and the `satisfiesFloor` / `getProfile` /
in-loop bite gate unit tests SHALL remain green without modification, except the
prior floor test that froze declaration-based authorization (TC-011), which SHALL be
inverted to expect fail-closed, plus new achieved / fail-closed cases.

#### Scenario: the protected-paths gate and truncated fail-closed are unchanged

**Given** the existing Step 3.5 protected-paths tests and the minimumAssurance truncated-list test
**When** the test suite runs after this change
**Then** they pass without modification

# Spec: assurance の構造化と archive 時 minimumAssurance floor の強制

## Requirements

### Requirement: ProfileAssurance shall expose typed floor-comparable fields with a lattice

`ProfileAssurance` SHALL expose three typed optional fields — `testDerivation`
(`"coupled" | "frozen"`), `biteEvidence` (`"optional" | "required"`), and
`specReview` (`"omitted" | "required"`) — while retaining a string index
signature for backward compatibility. Each field SHALL have a defined total
order (lattice): `coupled < frozen`, `optional < required`, `omitted < required`.
A pure function `satisfiesFloor(assurance, floor)` SHALL return whether the
assurance meets every field constrained by the floor.

#### Scenario: floor is satisfied when every constrained field meets or exceeds its rank

**Given** an assurance `{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }`
**And** a floor `{ testDerivation: "frozen", biteEvidence: "required" }`
**When** `satisfiesFloor(assurance, floor)` is evaluated
**Then** it returns `true` (constrained fields meet the floor; `specReview` is unconstrained)

#### Scenario: floor is violated when a constrained field is below its rank

**Given** an assurance `{ testDerivation: "coupled", biteEvidence: "required", specReview: "required" }`
**And** a floor `{ testDerivation: "frozen" }`
**When** `satisfiesFloor(assurance, floor)` is evaluated
**Then** it returns `false` (`coupled` is below the required `frozen`)

#### Scenario: absent or unknown assurance field fails closed against a constraining floor

**Given** an assurance value that does not present the field the floor constrains (e.g. `{}` or an unrecognized value)
**And** a floor that constrains that field (e.g. `{ biteEvidence: "required" }`)
**When** `satisfiesFloor(assurance, floor)` is evaluated
**Then** it returns `false` (the assurance cannot prove the floor is met → fail-closed)

#### Scenario: an empty floor is satisfied by any assurance

**Given** any assurance value
**And** a floor `{}` that constrains no field
**When** `satisfiesFloor(assurance, floor)` is evaluated
**Then** it returns `true`

### Requirement: STANDARD_PROFILE shall carry the strongest assurance and remain self-consistent

`STANDARD_PROFILE.assurance` SHALL equal the strongest lattice value
`{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }`,
and `STANDARD_PROFILE.policyDigest` SHALL equal
`computePolicyDigest(STANDARD_PROFILE)` (self-consistency preserved by
recomputing the digest at module load).

#### Scenario: standard profile self-consistency holds after structuring assurance

**Given** the `STANDARD_PROFILE` constant
**When** `computePolicyDigest(STANDARD_PROFILE)` is compared to `STANDARD_PROFILE.policyDigest`
**Then** they are equal

#### Scenario: standard assurance satisfies any floor

**Given** `STANDARD_PROFILE.assurance`
**And** any floor expressible from the lattice fields
**When** `satisfiesFloor(STANDARD_PROFILE.assurance, floor)` is evaluated
**Then** it returns `true`

### Requirement: R1-format checkpoints shall remain attachable after assurance is structured

A checkpoint whose stored profile records `assurance: {}` (the R1 format) SHALL
pass verify-checkpoint's digest self-consistency check unchanged, because the
check compares the stored profile against its own body — not against the
`STANDARD_PROFILE` constant.

#### Scenario: an R1 profile with assurance:{} passes attach digest verification

**Given** a checkpoint whose stored `profile` has `assurance: {}` and a `policyDigest` computed from that same body
**When** `verifyCheckpoint` runs the profile self-consistency check
**Then** the check passes and the checkpoint is attachable (no `profile-inconsistent` error)

### Requirement: ArchiveConfig shall accept a minimumAssurance floor definition

`ArchiveConfig` SHALL accept an optional `minimumAssurance` object with a
required `protectedPaths` glob array (validated like the existing
`archive.protectedPaths`) and optional `testDerivation` / `biteEvidence` /
`specReview` level fields. Invalid level values or a non-array `protectedPaths`
SHALL be rejected by config validation.

#### Scenario: a well-formed minimumAssurance config parses

**Given** a config with `archive.minimumAssurance = { protectedPaths: ["architecture/**"], testDerivation: "frozen", biteEvidence: "required" }`
**When** config validation runs
**Then** the config is accepted and the values are available to the archive command

#### Scenario: an invalid level value is rejected

**Given** a config with `archive.minimumAssurance = { protectedPaths: ["architecture/**"], biteEvidence: "sometimes" }`
**When** config validation runs
**Then** validation fails with an error identifying the invalid field

### Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed

During `job archive --with-merge`, when `archive.minimumAssurance` is configured
with a non-empty `protectedPaths`, the gate SHALL fetch the PR's changed files
and, if any changed file matches `minimumAssurance.protectedPaths` AND the job's
effective profile assurance does not satisfy the floor, block the merge with a
fail-closed escalation (`exitCode 1`, same shape as the existing protected-paths
gate). If no changed file matches, or the effective assurance satisfies the
floor, the merge SHALL proceed. When `minimumAssurance` is absent, the gate
SHALL do nothing.

#### Scenario: sub-floor profile touching a protected path is blocked

**Given** a job whose effective profile assurance is below the configured floor
**And** the PR changes a file matching `minimumAssurance.protectedPaths`
**When** the archive merge gate runs
**Then** the merge is blocked with a fail-closed escalation and `exitCode 1`, and no merge or cleanup occurs

#### Scenario: standard profile touching a protected path passes the floor

**Given** a job whose effective profile is the standard profile (strongest assurance)
**And** the PR changes a file matching `minimumAssurance.protectedPaths`
**When** the archive merge gate runs
**Then** the floor is satisfied and the merge proceeds

#### Scenario: a change that touches no protected path passes even below floor

**Given** a job whose effective profile assurance is below the configured floor
**And** the PR changes no file matching `minimumAssurance.protectedPaths`
**When** the archive merge gate runs
**Then** the floor does not apply and the merge proceeds

#### Scenario: absent minimumAssurance config is a no-op

**Given** a config with no `archive.minimumAssurance`
**When** the archive merge gate runs
**Then** the floor gate does nothing and existing archive behavior is preserved

#### Scenario: a truncated changed-file list fails closed

**Given** `archive.minimumAssurance.protectedPaths` is configured
**And** the PR's changed-file list is truncated by the GitHub API cap
**When** the floor gate evaluates the changed files
**Then** the merge is blocked with a fail-closed escalation (matching cannot be performed on incomplete data)

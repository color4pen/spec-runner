# Spec: spec-review fixer routing

## Requirements

### Requirement: spec-review shall route fixable findings on spec-fixer-writable canon files to spec-fixer regardless of severity

The spec-review verdict derivation SHALL treat the spec-review round's effective fixer as
`spec-fixer`. When a finding has `resolution: "fixable"` and its `file` is a protected canon path
that spec-fixer is declared to write (`spec.md` or `design.md`), the derived verdict MUST be
`needs-fix` irrespective of the finding's severity (including `medium` and `low`), so the existing
`spec-review needs-fix → spec-fixer` transition is reached.

#### Scenario: medium fixable finding on spec.md routes to spec-fixer

**Given** a spec-review step result with `ok: true` and a single finding with
`severity: "medium"`, `resolution: "fixable"`, and `file` = `specrunner/changes/<slug>/spec.md`
**When** the spec-review verdict is derived
**Then** the verdict is `needs-fix`
**And** the standard transition table routes `spec-review` on `needs-fix` to `spec-fixer`

#### Scenario: low fixable finding on design.md routes to spec-fixer

**Given** a spec-review step result with `ok: true` and a single finding with
`severity: "low"`, `resolution: "fixable"`, and `file` = `specrunner/changes/<slug>/design.md`
**When** the spec-review verdict is derived
**Then** the verdict is `needs-fix`

### Requirement: spec-review shall escalate fixable findings on canon files spec-fixer cannot write

When a spec-review finding has `resolution: "fixable"` and its `file` is a protected canon path
that spec-fixer is NOT declared to write (`request.md`, `tasks.md`, `test-cases.md`, or the
fact-check attestation), the derived verdict SHALL be `escalation`, and the step completion MUST
set an `escalationReason` carrying the `CANON_FINDING_ESCALATION` code and the offending file path.

#### Scenario: fixable finding on request.md escalates with reason

**Given** a spec-review step result with `ok: true` and a single finding with
`resolution: "fixable"` and `file` = `specrunner/changes/<slug>/request.md`
**When** the spec-review step completion is derived
**Then** the verdict is `escalation`
**And** `escalationReason` is set and contains `CANON_FINDING_ESCALATION`
**And** `escalationReason` contains the path `specrunner/changes/<slug>/request.md`

#### Scenario: escalation-and-routable coexistence prefers escalation

**Given** a spec-review step result with `ok: true` containing both a fixable finding on
`request.md` (unroutable) and a fixable finding on `spec.md` (routable)
**When** the spec-review verdict is derived
**Then** the verdict is `escalation`
**And** escalationReason is set and contains `CANON_FINDING_ESCALATION` (referencing the
unroutable `request.md` finding)

### Requirement: spec-review verdict derivation and escalationReason computation shall reference the same effective fixer resolver

The escalationReason computation in step completion SHALL use the same effective fixer resolver
that was used to derive the spec-review verdict. For a spec-review step the resolver MUST be the
spec-review-specific resolver (always `spec-fixer`), so that a canon finding classified as
routable by verdict derivation is never reported as an unroutable canon escalation, and vice versa.

#### Scenario: routable spec.md finding yields no escalation reason

**Given** a spec-review step result with `ok: true` and a fixable finding on
`specrunner/changes/<slug>/spec.md`
**When** the step completion is derived
**Then** the verdict is `needs-fix`
**And** `escalationReason` is not set

#### Scenario: unroutable request.md finding yields a canon escalation reason under the same resolver

**Given** a spec-review step result with `ok: true` and a fixable finding on
`specrunner/changes/<slug>/request.md`
**When** the step completion is derived
**Then** the verdict is `escalation`
**And** `escalationReason` is set with `CANON_FINDING_ESCALATION`

### Requirement: spec-review shall preserve existing non-canon verdict behavior

For findings that are NOT on a protected canon path, the spec-review verdict derivation MUST
preserve the prior behavior: `ok: false`, vacuous check (`evidence.checked === 0`), and any
`decision-needed` finding SHALL yield `escalation`; a `critical` or `high` severity finding SHALL
yield `needs-fix`; otherwise the verdict SHALL be `approved`.

#### Scenario: medium fixable finding on a non-canon file approves

**Given** a spec-review step result with `ok: true` and a single finding with
`severity: "medium"`, `resolution: "fixable"`, and `file` = `src/example.ts`
**When** the spec-review verdict is derived
**Then** the verdict is `approved`

#### Scenario: decision-needed finding escalates

**Given** a spec-review step result with `ok: true` and a finding with `resolution: "decision-needed"`
**When** the spec-review verdict is derived
**Then** the verdict is `escalation`

### Requirement: the spec-review→spec-fixer loop shall remain bounded by the existing exhaustion limit

The change SHALL NOT introduce any new transition edge or loop path. Repeated `needs-fix` verdicts
from spec-review MUST remain bounded by the existing `spec-review` loop exhaustion limit, halting
with `error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` and `status = awaiting-resume` at `maxIterations`.

#### Scenario: repeated needs-fix exhausts at the existing limit

**Given** a pipeline whose spec-review step returns `needs-fix` on every iteration via a fixable
canon finding on `spec.md`
**When** the pipeline runs the spec-review / spec-fixer loop to its `maxIterations` bound
**Then** the job halts with `error.code = SPEC_REVIEW_RETRIES_EXHAUSTED`
**And** no non-`spec-review` retry-exhaustion error code is produced

### Requirement: other judge, conformance, regression-gate, and request-review verdict derivation shall be unchanged

The effective fixer resolver and verdict derivation for judge (code-review), conformance,
regression-gate, and request-review steps SHALL remain unchanged. Only the spec-review step's
verdict derivation and its escalationReason resolver selection are modified.

#### Scenario: code-review canon escalation still uses the judge resolver

**Given** a code-review (judge) step result with `ok: true` and a fixable finding on a protected
canon path that code-fixer cannot write
**When** the step completion is derived
**Then** the verdict is `escalation`
**And** the escalationReason is computed using the judge effective fixer resolver (unchanged behavior)

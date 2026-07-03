# Spec: spec-exempt design contract

## Requirements

### Requirement: Request type declares spec requirement as a declarative attribute

`type-config` SHALL expose, per request type, a declarative boolean attribute that
states whether the type requires a behavior spec. The `chore` type SHALL be
spec-exempt (not required); `new-feature`, `spec-change`, `bug-fix`, and
`refactoring` SHALL be spec-required. Unknown or legacy types SHALL default to
spec-required (fail-closed). The determination MUST come from the request type
fixed at request-creation time, and MUST NOT depend on any agent runtime judgment.

#### Scenario: chore is spec-exempt

**Given** a request whose type is `chore`
**When** the spec-requirement attribute for the type is queried
**Then** the type is reported as spec-exempt (not required)

#### Scenario: spec-required types are unchanged

**Given** a request whose type is `new-feature`, `spec-change`, `bug-fix`, or `refactoring`
**When** the spec-requirement attribute for the type is queried
**Then** the type is reported as spec-required

#### Scenario: unknown type falls back to spec-required

**Given** a request whose type is not a known type
**When** the spec-requirement attribute for the type is queried
**Then** the type is reported as spec-required (fail-closed)

### Requirement: Design step omits the spec.md output contract for spec-exempt types

The design step's produced output contracts SHALL be built such that, when the
request type is spec-exempt, the `spec.md` produced contract is not created and
therefore the contract gate MUST NOT halt on `spec.md`. When the request type is
spec-required, the `spec.md` produced contract SHALL be retained exactly as before,
including the scaffold-equality check that halts when the agent leaves the template
unmodified. The exemption MUST be applied in the shared contract-building layer so
that the local and managed runtime output-validation code paths remain unchanged and
produce the same result.

#### Scenario: spec-exempt design generates zero requirements without halting

**Given** a `chore` request whose design produces `design.md` and `tasks.md` but no behavior spec
**When** the design step's output contract gate runs
**Then** no `spec.md` produced contract is evaluated and the step does not halt with `STEP_OUTPUT_MISSING`

#### Scenario: spec-required design still halts on an unmodified scaffold

**Given** a `bug-fix` request whose `spec.md` is left equal to the pre-placed scaffold template
**When** the design step's output contract gate runs
**Then** a `spec.md` produced-contract violation is detected and the step halts as before

#### Scenario: local and managed agree on the exemption

**Given** the design output contracts built for a spec-exempt request and for a spec-required request
**When** the local runtime and the managed runtime validate those contracts against identical file content
**Then** both runtimes report the same set of violations

### Requirement: Spec-exempt spec.md carries an explicit, machine-recognizable exemption note

For a spec-exempt request type, the `spec.md` placed in the change folder before the
design step SHALL contain an explicit note stating that the change has no behavior
spec because its type is spec-exempt, and SHALL contain a stable machine-recognizable
exemption marker. The note MUST be non-empty and self-contained so that, when
committed, `spec.md` records a meaningful exemption declaration rather than an
unmodified template. For spec-required types, the pre-placed `spec.md` scaffold SHALL
remain the requirement-writing template as before.

#### Scenario: exempt note replaces the requirement template for spec-exempt types

**Given** the design step is about to run for a `chore` request
**When** the change folder output templates are computed
**Then** the `spec.md` template content is the exemption note containing the exemption marker, not the requirement-writing scaffold

#### Scenario: spec-required types keep the requirement template

**Given** the design step is about to run for a `spec-change` or `new-feature` request
**When** the change folder output templates are computed
**Then** the `spec.md` template content is the requirement-writing scaffold as before

### Requirement: Downstream review treats an exempt spec.md as vacuously satisfied

The spec-review and conformance steps SHALL treat a `spec.md` that carries the
exemption marker as vacuously satisfied: they MUST NOT report findings that a
spec-exempt `spec.md` is missing Requirements or Scenarios, and MUST NOT fabricate
findings solely because the exempt `spec.md` contains zero Requirements. The
exemption marker used by these steps MUST be the same marker written into the exempt
note, sourced from a single shared definition.

#### Scenario: spec-review does not fabricate findings for an exempt spec.md

**Given** a `spec.md` that carries the exemption marker
**When** the spec-review step reviews the change folder
**Then** it does not raise a finding about missing Requirements or Scenarios for that `spec.md`

#### Scenario: conformance treats an exempt spec.md as conforming

**Given** a `spec.md` that carries the exemption marker
**When** the conformance step evaluates the implementation against `spec.md`
**Then** it treats the `spec.md` conformance item as satisfied without fabricating a non-conformity

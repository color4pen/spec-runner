# Spec: spec-fixer tasks.md writable

## Requirements

### Requirement: spec-fixer SHALL declare tasks.md in its canon write-set

The spec-fixer step SHALL include `specrunner/changes/<slug>/tasks.md` in the set of
canon files it is allowed to write. Because spec-fixer runs in scoped commit mode
(outside `GUARDED_WRITE_STEPS`), its `writes()` declaration MUST simultaneously serve
three roles that MUST stay mutually consistent: the session-level write permission
(agent workspace tool guard), the scoped-commit staging boundary, and the drift-guard's
single source of truth for the D5 map.

#### Scenario: writes() exposes tasks.md alongside spec.md and design.md

**Given** a job with slug `<slug>`
**When** `SpecFixerStep.writes(state, deps)` is evaluated
**Then** the returned paths include `specrunner/changes/<slug>/tasks.md`,
`specrunner/changes/<slug>/spec.md`, and `specrunner/changes/<slug>/design.md`

#### Scenario: the D5 canon-write-scope map grants spec-fixer tasks.md

**Given** `buildCanonWriteScope(state, deps)` for slug `<slug>`
**When** the `spec-fixer` entry of `writableByFixer` is read
**Then** it contains `specrunner/changes/<slug>/tasks.md`, `spec.md`, and `design.md`,
and does NOT contain `request.md`, `test-cases.md`, or the request-review attestation

### Requirement: spec-review SHALL route fixable tasks.md findings to spec-fixer regardless of severity

Because tasks.md becomes a spec-fixer-writable canon file, a fixable spec-review finding
whose `file` is tasks.md SHALL derive a `needs-fix` verdict (severity-independent) and the
transition table SHALL route spec-review `needs-fix` to spec-fixer, so the finding converges
inside the spec round instead of halting the operator.

#### Scenario: medium fixable finding on tasks.md yields needs-fix

**Given** a spec-review result with `ok: true` and a single finding
`{ severity: "medium", resolution: "fixable", file: "specrunner/changes/<slug>/tasks.md" }`
**When** `deriveSpecReviewVerdict` is evaluated with the canon write scope
**Then** the verdict is `needs-fix` and no `escalationReason` is set

#### Scenario: spec-review needs-fix reaches spec-fixer in the transition table

**Given** the standard transition table
**When** a row with `step = spec-review` and `on = needs-fix` is looked up
**Then** the row targets `spec-fixer`

### Requirement: spec-review SHALL keep escalating fixable findings on canon files spec-fixer cannot write

The write-boundary change is limited to tasks.md. Fixable spec-review findings on
`request.md`, `test-cases.md`, or the request-review attestation SHALL still derive an
`escalation` verdict, and the step completion SHALL set an `escalationReason` containing
the `CANON_FINDING_ESCALATION` code for those unroutable canon findings.

#### Scenario: fixable finding on test-cases.md escalates with reason

**Given** a spec-review result with `ok: true` and a single finding
`{ severity: "medium", resolution: "fixable", file: "specrunner/changes/<slug>/test-cases.md" }`
**When** step completion is derived for the spec-review step
**Then** the verdict is `escalation` and `escalationReason` contains `CANON_FINDING_ESCALATION`
and references `test-cases.md`

#### Scenario: fixable finding on request.md escalates with reason

**Given** a spec-review result with `ok: true` and a single fixable finding on
`specrunner/changes/<slug>/request.md`
**When** step completion is derived for the spec-review step
**Then** the verdict is `escalation` and `escalationReason` contains `CANON_FINDING_ESCALATION`

### Requirement: conformance routing of tasks.md findings SHALL follow the expanded write-set

The conformance path resolves the effective fixer from `finding.fixTarget`. With tasks.md
now spec-fixer-writable, a fixable conformance finding on tasks.md that declares
`fixTarget: spec-fixer` SHALL derive `needs-fix:spec-fixer` rather than escalation. Findings
on tasks.md with `fixTarget: code-fixer` (code-fixer writes no canon) SHALL still escalate,
and findings with `fixTarget: implementer` SHALL still derive `needs-fix:implementer`.

#### Scenario: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer

**Given** a conformance result with `ok: true` and a finding
`{ severity: "high", resolution: "fixable", file: "specrunner/changes/<slug>/tasks.md", fixTarget: "spec-fixer" }`
**When** `deriveConformanceVerdict` is evaluated with the canon write scope
**Then** the verdict is `needs-fix:spec-fixer`

#### Scenario: conformance tasks.md finding with fixTarget code-fixer still escalates

**Given** a conformance result with `ok: true` and a finding
`{ severity: "high", resolution: "fixable", file: "specrunner/changes/<slug>/tasks.md", fixTarget: "code-fixer" }`
**When** `deriveConformanceVerdict` is evaluated with the canon write scope
**Then** the verdict is `escalation`

### Requirement: the write-set declaration SHALL remain drift-guarded across its synchronization points

The drift-guard MUST continue to verify that each fixer's `writes() ∩ protectedCanonPaths`
equals the corresponding D5 map entry. After tasks.md is added to both `writes()` and the D5
map for spec-fixer, the drift-guard SHALL remain green, proving the two declarations agree.

#### Scenario: drift-guard confirms spec-fixer writes() equals its D5 map entry

**Given** `buildCanonWriteScope(state, deps)` and `SpecFixerStep.writes(state, deps)`
**When** the drift-guard intersects the declared writes with the protected canon paths
**Then** the resulting set equals the `spec-fixer` entry of `writableByFixer`
(`{spec.md, design.md, tasks.md}`)

### Requirement: the spec-fixer prompt SHALL name tasks.md as a fixable target

Both spec-fixer prompt entries — the conformance-triggered user message and the shared
system prompt write-set contract — SHALL name tasks.md as an artifact the agent may fix, so
the agent does not decline a tasks.md finding on the belief that tasks.md is out of scope.

#### Scenario: conformance-entry message names tasks.md

**Given** the conformance-triggered spec-fixer initial message
**When** the fix instruction is read
**Then** it names `tasks.md` alongside `spec.md` and `design.md` as fixable artifacts

#### Scenario: system prompt write-set names tasks.md

**Given** the spec-fixer system prompt
**When** the write-set / contract section is read
**Then** it lists `tasks.md` among the writable artifacts

# Spec: approved 経路の code-fixer no-op を escalate しない

## Requirements

### Requirement: no-op override SHALL be suppressed when the code-fixer is triggered by code-review's approved findings-routing path

The executor SHALL suppress the code-fixer no-op verdict override (introduced in #734)
when the code-fixer entry was triggered by code-review's findings-routing path — that is,
when code-review's latest verdict is `approved` with at least one `fixable` finding,
code-review is the active reviewer, and the entry is not conformance-triggered. In that
case a completion with zero source-file changes MUST retain the `approved` verdict rather
than being overridden to `needs-fix`.

The override behavior for all other triggering paths (needs-fix reviewers, conformance,
regression-gate, custom-reviewer coordinator) MUST remain as in #734.

#### Scenario: approved + low-only fixable no-op proceeds instead of escalating

**Given** code-review's latest run has verdict `approved` with a single finding of `resolution: "fixable"` and `severity: "low"`, and code-review is the active reviewer, and no conformance run has occurred
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles` returns only pipeline artifacts (files under `specrunner/changes/` / `.specrunner/`)
**Then** the recorded code-fixer verdict is `approved` (the no-op override is suppressed) and the pipeline advances to the next step rather than halting

#### Scenario: needs-fix no-op still escalates (#734 preserved)

**Given** code-review's latest run has verdict `needs-fix` (a high/critical finding), and code-review is the active reviewer
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles` returns no source-file changes
**Then** the recorded code-fixer verdict is overridden to `needs-fix` and the pipeline escalates

#### Scenario: source-file change in the approved path is unchanged

**Given** code-review's latest run has verdict `approved` with a `fixable` finding, and code-review is the active reviewer
**When** the code-fixer completes and `listChangedFiles` returns a source file (e.g. `src/foo.ts`) in addition to pipeline artifacts
**Then** the recorded verdict remains `approved` (no override applied — identical to prior behavior) and downstream routing is governed by the existing, unchanged transition table

#### Scenario: conformance-triggered no-op still escalates even when code-review last approved with fixable findings

**Given** code-review's latest run has verdict `approved` with a `fixable` finding, and conformance later ran with verdict `needs-fix:code-fixer` (more recent than code-review) and has findings
**When** the code-fixer completes with `completionReason: "success"` and no source-file changes
**Then** the recorded verdict is overridden to `needs-fix` (the conformance-triggered entry is not exempt) and the pipeline escalates

#### Scenario: regression-gate-triggered no-op still escalates

**Given** a composed pipeline where regression-gate's latest verdict is `needs-fix` and regression-gate is the active reviewer (code-review having previously approved)
**When** the code-fixer completes with `completionReason: "success"` and no source-file changes
**Then** the recorded verdict is overridden to `needs-fix` and the pipeline escalates (regression-gate no-op behavior unchanged)

---

### Requirement: reviewer-chain SHALL expose a pure predicate identifying the code-review approved findings-routing fixer entry

`src/core/pipeline/reviewer-chain.ts` SHALL export a pure function
`codeReviewFindingsRoutingActive(state)` that returns `true` if and only if all of the
following hold: (1) the entry is not conformance-triggered
(`getConformanceFixContext(state, code-fixer)` is `null`); (2) code-review's latest run
verdict is `approved` and its findings contain at least one `fixable` finding; and (3)
code-review is the active reviewer (`resolveActiveReviewer(state, deriveImplFixerChain(state))`
returns the code-review step). The function MUST have no side effects and no I/O.

#### Scenario: code-review approved with fixable findings and active

**Given** `state.steps["code-review"]` latest verdict `approved` with a `fixable` finding, no other reviewer or conformance run
**When** `codeReviewFindingsRoutingActive(state)` is evaluated
**Then** it returns `true`

#### Scenario: code-review approved with no fixable findings

**Given** `state.steps["code-review"]` latest verdict `approved` with an empty findings array
**When** `codeReviewFindingsRoutingActive(state)` is evaluated
**Then** it returns `false`

#### Scenario: code-review needs-fix

**Given** `state.steps["code-review"]` latest verdict `needs-fix`
**When** `codeReviewFindingsRoutingActive(state)` is evaluated
**Then** it returns `false`

#### Scenario: conformance-triggered entry is excluded

**Given** `state.steps["code-review"]` latest verdict `approved` with a `fixable` finding, and conformance latest verdict `needs-fix:code-fixer` more recent than code-review with findings
**When** `codeReviewFindingsRoutingActive(state)` is evaluated
**Then** it returns `false`

#### Scenario: a later reviewer (regression-gate) is active

**Given** `state.steps["code-review"]` latest verdict `approved` with a `fixable` finding, and regression-gate ran afterward (making regression-gate the active reviewer)
**When** `codeReviewFindingsRoutingActive(state)` is evaluated
**Then** it returns `false`

---

### Requirement: detectNoOp SHALL accept a findingsRoutingApproved flag and remain generic

`detectNoOp` in `src/core/step/no-op-detect.ts` SHALL accept an optional
`findingsRoutingApproved` boolean in its params (defaulting to `false`). When source-file
changes are zero and `findingsRoutingApproved` is `true`, `detectNoOp` MUST return
`undefined` (no override) and emit a diagnostic to stderr; when it is `false`, it MUST
return `"needs-fix"` as before. `detectNoOp` MUST NOT depend on reviewer-chain routing
logic directly — the flag is computed by the caller.

#### Scenario: flag true suppresses override

**Given** a step with `noOpDetect: true` completes with `completionReason: "success"` and `listChangedFiles` returns only pipeline artifacts, and `findingsRoutingApproved` is `true`
**When** `detectNoOp` is evaluated
**Then** it returns `undefined` (no override)

#### Scenario: flag false or omitted preserves #734 override

**Given** a step with `noOpDetect: true` completes with no source-file changes and `findingsRoutingApproved` is `false` (or omitted)
**When** `detectNoOp` is evaluated
**Then** it returns `"needs-fix"`

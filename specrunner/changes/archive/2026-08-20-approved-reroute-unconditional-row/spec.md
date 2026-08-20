# Spec: approved 温存 reroute の修正

## Requirements

### Requirement: T-03 reroute shall target only the unconditional approved row and exclude only the budget-exhausted fixer

When T-03 fires (spec-review approved, paired fixer budget exhausted), the pipeline SHALL
find the clean transition by requiring `t.when === undefined` (unconditional row) and
excluding only `budgetSkippedFixer` (the specific exhausted fixer), `"end"`, and `"escalate"`.
It MUST NOT exclude all steps that appear in `loopFixerPairs` values.

#### Scenario: spec-review approved with spec-fixer budget exhausted routes to implementer

**Given** spec-review has run 2 needs-fix rounds (spec-fixer budget = maxIterations = 2)
**When** spec-review returns approved with ≥ 1 routable fixable finding, selecting the guarded `spec-review → spec-fixer` row, and spec-fixer budget is exhausted
**Then** T-03 fires, cleanTransition resolves to the unconditional `spec-review → implementer` row, the pipeline emits `pipeline:fixer:budget-skipped` with `step=spec-review, fixer=spec-fixer`, appends a warning history entry with omitted finding count and "proceeding to implementer" text, and proceeds to implementer without halting

### Requirement: T-03 shall not halt with SPEC_REVIEW_RETRIES_EXHAUSTED when a valid unconditional approved row exists

The pipeline MUST NOT emit `SPEC_REVIEW_RETRIES_EXHAUSTED` when T-03 successfully finds an unconditional approved row to reroute to.

#### Scenario: no SPEC_REVIEW_RETRIES_EXHAUSTED when reroute succeeds

**Given** T-03 fires for spec-review with spec-fixer budget exhausted
**When** an unconditional `spec-review → implementer` transition exists
**Then** the final job status is NOT `awaiting-resume` and `error.code` is NOT `SPEC_REVIEW_RETRIES_EXHAUSTED`

### Requirement: T-03 reroute for code-review (existing behavior) shall remain unchanged

The cleanTransition fix MUST NOT break the existing code-review T-03 path. The code-review approved + code-fixer budget exhausted scenario SHALL continue to reroute to conformance exactly as before.

#### Scenario: code-review approved with code-fixer budget exhausted still routes to conformance

**Given** code-review has exhausted code-fixer budget and returns approved with fixable findings
**When** T-03 fires for code-review
**Then** cleanTransition resolves to the unconditional `code-review → conformance` row and the pipeline proceeds to conformance (existing TC-001 behavior unchanged)

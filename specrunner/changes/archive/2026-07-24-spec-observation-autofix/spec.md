# Spec: spec フェーズの observation auto-fix

## Requirements

### Requirement: spec-review shall approve when only low/medium routable canon fixable findings remain

`deriveSpecReviewVerdict` SHALL return `approved` when the routable canon fixable findings
(findings with `resolution: "fixable"` on a spec-fixer-writable canon path — `spec.md`,
`design.md`, `tasks.md`) are all of `low` or `medium` severity and no other finding forces a
non-approved verdict. The findings MUST still be recorded in the step result. When the routable
canon fixable findings include a `critical` or `high` severity finding, the verdict MUST remain
`needs-fix` (re-review round). The unroutable-canon (`escalation`), `decision-needed`
(`escalation`), `ok: false` (`escalation`), and vacuous-check (`evidence.checked === 0` →
`escalation`) rules MUST be unchanged.

#### Scenario: medium fixable finding on spec.md approves

**Given** a spec-review result with `ok: true` and a single finding
`severity: "medium"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md`
**When** the spec-review verdict is derived
**Then** the verdict is `approved`

#### Scenario: low fixable finding on design.md approves

**Given** a spec-review result with `ok: true` and a single finding
`severity: "low"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/design.md`
**When** the spec-review verdict is derived
**Then** the verdict is `approved`

#### Scenario: high fixable finding on spec.md remains needs-fix

**Given** a spec-review result with `ok: true` and a single finding
`severity: "high"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md`
**When** the spec-review verdict is derived
**Then** the verdict is `needs-fix`

#### Scenario: critical fixable finding on spec.md remains needs-fix

**Given** a spec-review result with `ok: true` and a single finding
`severity: "critical"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md`
**When** the spec-review verdict is derived
**Then** the verdict is `needs-fix`

#### Scenario: unroutable request.md fixable finding still escalates

**Given** a spec-review result with `ok: true` and a single finding
`resolution: "fixable"`, `file` = `specrunner/changes/<slug>/request.md`
**When** the spec-review step completion is derived
**Then** the verdict is `escalation`
**And** `escalationReason` is set and contains `CANON_FINDING_ESCALATION` and the `request.md` path

### Requirement: spec-review approval with routable fixable findings shall route to spec-fixer

When spec-review produces verdict `approved` and its latest run has at least one routable canon
fixable finding, the standard transition table SHALL route `spec-review` on `approved` to
`spec-fixer` (observation pass), instead of directly to `test-case-gen`. When no routable canon
fixable finding is present, spec-review on `approved` MUST route directly to `test-case-gen`.

#### Scenario: approved with routable fixable routes to spec-fixer

**Given** a spec-review latest run with verdict `approved` and a `medium` fixable finding on
`spec.md`
**When** the standard transition table resolves the next step for `spec-review` on `approved`
**Then** the next step is `spec-fixer`

#### Scenario: approved with no routable fixable routes to test-case-gen

**Given** a spec-review latest run with verdict `approved` and no routable canon fixable finding
(e.g. a single `medium` fixable finding on a non-canon file, or no findings)
**When** the standard transition table resolves the next step for `spec-review` on `approved`
**Then** the next step is `test-case-gen`

### Requirement: spec-fixer following a spec-review approval shall forward to test-case-gen without re-review

When spec-fixer completes with `approved` AND it was entered from a spec-review `approved` verdict
(observation pass) AND it was NOT triggered by a conformance `needs-fix:spec-fixer` verdict, the
standard transition table SHALL route `spec-fixer` on `approved` to `test-case-gen` — the
spec-review step MUST NOT be re-executed for that pass.

#### Scenario: observation-pass spec-fixer forwards to test-case-gen

**Given** a job whose latest spec-review run has verdict `approved`, whose spec-fixer has just
completed with `approved`, and where conformance has not produced a `needs-fix:spec-fixer` verdict
newer than the latest spec-review run
**When** the standard transition table resolves the next step for `spec-fixer` on `approved`
**Then** the next step is `test-case-gen`
**And** the spec-review step is not re-run for that pass

### Requirement: needs-fix and conformance-triggered spec-fixer shall return to spec-review

The observation-pass forward MUST be limited to the case where the immediately preceding spec-phase
decision was a spec-review `approved`. A spec-fixer entered from a spec-review `needs-fix` verdict
SHALL return to `spec-review` for re-review. A spec-fixer entered from a conformance
`needs-fix:spec-fixer` verdict SHALL return to `spec-review` for reverification. Neither path MAY
forward directly to `test-case-gen`.

#### Scenario: needs-fix spec-fixer returns to spec-review

**Given** a job whose latest spec-review run has verdict `needs-fix` and whose spec-fixer has just
completed with `approved`
**When** the standard transition table resolves the next step for `spec-fixer` on `approved`
**Then** the next step is `spec-review`

#### Scenario: conformance-triggered spec-fixer returns to spec-review

**Given** a job whose latest conformance run has verdict `needs-fix:spec-fixer` (newer than the
latest spec-review run) and whose spec-fixer has just completed with `approved`
**When** the standard transition table resolves the next step for `spec-fixer` on `approved`
**Then** the next step is `spec-review` (not `test-case-gen`)

### Requirement: spec-review fixable findings shall be verified by the regression-gate ledger

The findings ledger consumed by the regression-gate SHALL include the fixable findings produced by
spec-review runs (in addition to the impl reviewer chain). Spec-review fixable findings on
spec-fixer-writable canon paths (`spec.md`, `design.md`, `tasks.md`) MUST be retained in the ledger
(they MUST NOT be dropped by the code-fixer-based unroutable-canon exclusion). The regression-gate
MUST NOT be skipped when the only ledger entries originate from spec-review.

#### Scenario: consumed spec-review fixable finding appears in the regression-gate ledger

**Given** a job with a spec-review run carrying a `medium` fixable finding on `spec.md` and a
reviewer configuration where the regression-gate is present
**When** the regression-gate builds its findings ledger from state
**Then** the ledger contains the `spec.md` fixable finding

#### Scenario: regression-gate not skipped for spec-review-only ledger

**Given** a job whose only fixable ledger entries come from spec-review runs (empty impl reviewer
chain ledger)
**When** the regression-gate `skipWhen` computes the ledger
**Then** the gate is not skipped

### Requirement: the observation pass shall not consume the spec-review loop budget

The observation-pass execution of spec-fixer SHALL NOT increment the spec-review loop iteration
count. An observation pass MUST execute spec-review exactly once (the same as a clean approval),
routing spec-review → spec-fixer → test-case-gen without re-entering spec-review.

#### Scenario: observation pass runs spec-review once

**Given** a pipeline where spec-review approves with a routable `medium` fixable finding and
spec-fixer approves
**When** the pipeline runs the spec phase to test-case-gen
**Then** spec-review is executed exactly once
**And** the pipeline reaches `test-case-gen` without re-entering `spec-review`

### Requirement: impl-side observation auto-fix and other verdict derivations shall be unchanged

The impl-side observation auto-fix (code-review / custom reviewers via `deriveJudgeVerdict` and
`buildReviewerChainTransitions` / `buildParallelReviewerTransitions`), `deriveConformanceVerdict`,
`deriveRegressionGateVerdict`, `deriveRequestReviewVerdict`, the spec-review prompt (whole-set
enumeration discipline and finding-recency detection), the spec-fixer write-set, and the FAST
pipeline transitions SHALL all remain unchanged.

#### Scenario: code-review verdict derivation unchanged

**Given** a code-review (judge) step result with `ok: true` and a `medium` fixable finding on a
non-canon file
**When** the judge verdict is derived
**Then** the verdict is `approved` (unchanged `deriveJudgeVerdict` behavior)

#### Scenario: FAST transitions unchanged

**Given** the FAST pipeline transition table
**When** its rows are inspected
**Then** it contains no `spec-review` / `spec-fixer` / `test-case-gen` rows (unchanged)

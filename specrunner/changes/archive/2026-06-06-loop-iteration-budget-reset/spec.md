# Spec: loop iteration budget reset

## Requirements

### Requirement: Fixer-pair loop budget resets per convergence episode

`Pipeline` SHALL treat the iteration budget of a loop step that has a dedicated fixer (an entry in `loopFixerPairs`, i.e. spec-review / verification / code-review) as scoped to a single convergence episode.

When such a gate step is about to be entered and the immediately preceding step is **not** its paired fixer (per `loopFixerPairs`), the Pipeline SHALL reset the budget for that episode by setting both:

- the gate's iteration counter (`loopIters[gate]`) to 0, and
- the paired fixer's iteration counter (`fixerIters[loopFixerPairs[gate]]`) to 0,

before any exhaustion check reads those counters. When the immediately preceding step **is** the paired fixer, the Pipeline SHALL NOT reset either counter, so the episode's iterations continue to accumulate.

The reset MUST occur within a single `runInternal` execution; it changes only the in-memory budget counters and SHALL NOT alter persisted attempt numbering (`StepRun.attempt`, derived from step-result array length) or resume behavior.

#### Scenario: re-entry via implementer gets a fresh verification budget (observed-bug regression)

**Given** `maxIterations = 2` and `loopFixerPairs` maps `verification → build-fixer`
**And** an earlier verification episode already ran build-fixer to its maximum (`fixerIters[build-fixer]` reached 2 and `loopIters[verification]` reached 3 before passing)
**When** the pipeline re-enters verification from implementer (via `conformance(needs-fix) → implementer → verification`) and verification fails with a fixable error
**Then** verification SHALL run starting at iteration 1 (fresh budget)
**And** build-fixer SHALL be invoked (the fixer entry-guard SHALL NOT block it)
**And** the pipeline SHALL NOT escalate before build-fixer runs

#### Scenario: continuation through the paired fixer keeps counting within an episode

**Given** `maxIterations = 2` and `loopFixerPairs` maps `verification → build-fixer`
**And** verification is entered for a fresh episode and returns `failed`
**When** the cycle proceeds `verification → build-fixer → verification` repeatedly within the same episode
**Then** the verification iteration counter SHALL continue to increment across the fixer round trips (not reset)
**And** when the counter reaches `maxIterations` without the fixer bypass condition, the pipeline SHALL escalate (single-episode exhaustion preserved)

#### Scenario: spec-review and code-review reset identically on non-fixer re-entry

**Given** `loopFixerPairs` maps `spec-review → spec-fixer` and `code-review → code-fixer`
**When** such a gate is entered from a step that is not its paired fixer (e.g. `verification(passed) → code-review` on a re-run, or `design → spec-review`)
**Then** that gate's iteration counter and its paired fixer's counter SHALL both start the new episode at a fresh budget

### Requirement: Loops without a dedicated fixer retain a lifetime budget

A loop step that has no entry in `loopFixerPairs` (conformance) SHALL retain a run-lifetime iteration counter that is never reset. Because such a loop re-executes the whole phase via the creator step (conformance `needs-fix` routes through implementer) and is always reached from an upstream gate, its predecessor cannot distinguish a fresh episode from a continuation. The lifetime counter SHALL bound the number of phase re-executions to `maxIterations`, guaranteeing termination.

#### Scenario: conformance exhausts after maxIterations even while other gates pass (termination regression)

**Given** `maxIterations = 2` and `loopFixerPairs` has no entry for conformance
**And** verification and code-review pass on every pass through the impl phase
**And** conformance returns `needs-fix` on every attempt
**When** the pipeline loops `conformance(needs-fix) → implementer → verification(passed) → code-review(approved) → conformance …`
**Then** conformance's iteration counter SHALL accumulate across passes (not reset by the fixer-pair episode reset)
**And** after `maxIterations` conformance attempts the pipeline SHALL escalate with conformance exhaustion (no infinite loop)

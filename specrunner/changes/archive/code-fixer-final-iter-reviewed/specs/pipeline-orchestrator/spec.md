# Delta Spec: pipeline-orchestrator

## MODIFIED Requirements

### Requirement: Pipeline Enforces Loop Guard via maxIterations

以下を既存 Requirement に追加する:

---

`Pipeline` SHALL accept an additional constructor parameter `loopFixerPairs: Record<string, string>` that maps review step names to their paired fixer step names. The default value SHALL be `{}` (no pairs defined).

`Pipeline.runInternal` SHALL maintain a `fixerIters: Map<string, number>` counter parallel to `loopIters`. The counter SHALL be incremented each time a fixer step (a value in `loopFixerPairs`) is entered, before the step executes.

#### Exhaustion bypass for fixer's final iteration

When the next step is a loop step AND `loopIters[nextStep] >= maxIterations`, the pipeline SHALL check whether the exhaustion can be bypassed:

- **Bypass condition**: The immediately preceding step (the step that just completed) is the paired fixer for `nextStep` (per `loopFixerPairs`), AND `fixerIters[pairedFixer] >= maxIterations`.
- **When bypass condition is met**: The exhaustion check is skipped, and the review step executes one additional time (the "final-fix review").
- **When bypass condition is NOT met**: The pipeline escalates with `resumePoint.exhaustionPhase = "review-exhausted"` (conventional exhaustion).

This guarantees that the fixer's final iteration output is reviewed exactly once before any escalation decision.

#### Fixer exhaustion gate

When the next step is a fixer step (a value in `loopFixerPairs`) AND `fixerIters[nextStep] >= maxIterations`, the pipeline SHALL escalate immediately. The fixer SHALL NOT be re-entered. The escalation SHALL set `resumePoint.exhaustionPhase = "review-after-final-fix"` and use the paired review step's error shape from `LOOP_ERROR_CODES`.

#### Maximum review iterations

The maximum number of review iterations for a loop step with a paired fixer is `maxIterations + 1`. The `+1` iteration is exclusively the "final-fix review" (triggered only by the bypass condition). Loop steps without a paired fixer retain the existing maximum of `maxIterations`.

#### `ResumePoint.exhaustionPhase`

The `ResumePoint` interface SHALL include an optional field:

```typescript
exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
```

- `"review-after-final-fix"`: The fixer ran to its maximum iterations, the subsequent review did not approve, and the pipeline escalated.
- `"review-exhausted"`: The review exhausted at `maxIterations` without the fixer bypass condition being met (conventional exhaustion path).

The field is optional for backward compatibility with existing state files.

#### `loopFixerPairs` standard configuration

The standard pipeline (`run.ts`) SHALL pass:

```typescript
loopFixerPairs: {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
}
```

---

#### Scenario: fixer final iter output is reviewed before escalation (code-review)

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `code-review → code-fixer`
- **AND** code-review returns `needs-fix` for iterations 1 and 2
- **AND** code-fixer runs after each needs-fix (2 total fixer runs)
- **WHEN** code-fixer iteration 2 completes and transitions to code-review
- **THEN** code-review iteration 3 (the bypass) SHALL execute
- **AND** if iteration 3 returns `approved`, the pipeline continues to pr-create
- **AND** `state.steps["code-review"]` has 3 entries

#### Scenario: bypass review rejects → fixer gate escalation

- **GIVEN** same setup as above (maxIterations = 2, code-fixer runs 2 times)
- **WHEN** code-review iteration 3 (bypass) returns `needs-fix`
- **AND** the transition table routes to code-fixer
- **THEN** the fixer gate detects `fixerIters["code-fixer"] >= 2`
- **AND** pipeline escalates with `resumePoint.exhaustionPhase === "review-after-final-fix"`
- **AND** error.code is `CODE_REVIEW_RETRIES_EXHAUSTED`

#### Scenario: loop step without paired fixer exhausts at maxIterations (regression guard)

- **GIVEN** a loop step that has no entry in `loopFixerPairs` keys
- **WHEN** that step reaches `maxIterations`
- **THEN** pipeline escalates immediately without bypass
- **AND** `resumePoint.exhaustionPhase === "review-exhausted"`

#### Scenario: spec-review ↔ spec-fixer bypass operates identically

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `spec-review → spec-fixer`
- **AND** spec-review returns `needs-fix` for iterations 1 and 2
- **WHEN** spec-fixer iteration 2 completes
- **THEN** spec-review iteration 3 (bypass) SHALL execute

#### Scenario: verification ↔ build-fixer bypass operates identically

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `verification → build-fixer`
- **AND** verification returns `failed` for iterations 1 and 2
- **WHEN** build-fixer iteration 2 completes
- **THEN** verification iteration 3 (bypass) SHALL execute

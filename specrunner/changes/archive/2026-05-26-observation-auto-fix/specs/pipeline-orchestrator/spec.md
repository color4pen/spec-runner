# pipeline-orchestrator Specification (delta)

## Requirements

### Requirement: Verdict union includes `approved-with-fixes`

`Verdict` union (`src/state/schema.ts`) SHALL include the literal value `"approved-with-fixes"` in addition to the existing 7 literals. This verdict indicates that a review step approved the change but identified fixable observations that should be automatically resolved before proceeding.

#### Scenario: Verdict union accepts `approved-with-fixes`

- **WHEN** TypeScript compiles a switch statement that exhaustively handles the `Verdict` union
- **THEN** the compilation succeeds when all 8 literals (`approved`, `approved-with-fixes`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error`) are covered
- **AND** the compilation fails when any of the 8 literals is omitted

### Requirement: code-review `approved-with-fixes` verdict routes to code-fixer

The transition table SHALL include a row `code-review --approved-with-fixes→ code-fixer`. This row routes code-review output to the code-fixer step when the review is approved but contains fixable findings (`Fix: yes` in the Findings table).

#### Scenario: code-review approved-with-fixes routes to code-fixer

- **GIVEN** `code-review` returns verdict `approved-with-fixes`
- **WHEN** the transition table is consulted
- **THEN** the next step is `code-fixer`

#### Scenario: code-review approved (without fixes) routes to delta-spec-validation unchanged

- **GIVEN** `code-review` returns verdict `approved` (no fixable findings)
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation` (existing behavior preserved)

### Requirement: code-fixer exit routes based on prior review verdict

The code-fixer `approved` exit SHALL be split into two conditional transitions:

1. `code-fixer --approved→ delta-spec-validation` (when: the latest `code-review` step result has verdict `approved-with-fixes`)
2. `code-fixer --approved→ code-review` (fallback, no `when` — preserves existing needs-fix loop)

The conditional row MUST precede the fallback row in the transition table (first-match via `Array.find`).

The `when` predicate SHALL inspect `state.steps["code-review"]` and check the `outcome.verdict` of the last entry.

#### Scenario: code-fixer after approved-with-fixes routes to delta-spec-validation

- **GIVEN** the latest `code-review` step result has verdict `approved-with-fixes`
- **AND** `code-fixer` completes successfully (verdict `approved`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation` (skipping re-review)

#### Scenario: code-fixer after needs-fix routes to code-review (existing loop)

- **GIVEN** the latest `code-review` step result has verdict `needs-fix`
- **AND** `code-fixer` completes successfully (verdict `approved`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `code-review` (existing loop preserved)

#### Scenario: code-fixer error routes to escalate regardless of prior verdict

- **GIVEN** `code-fixer` fails (verdict `error`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `escalate` (existing behavior, unchanged)

### Requirement: `determineVerdict()` is abolished — agent verdict is adopted directly

`code-review.ts` の `parseResult()` SHALL adopt the agent's verdict directly without CLI-side score recalculation. The `determineVerdict()` function (which computes CLI verdict from score table and severity counts and takes the stricter of CLI and agent verdicts) SHALL be removed.

The new verdict logic SHALL be:

1. `agentVerdict === "escalation"` → `"escalation"`
2. `agentVerdict === "approved"` AND fixable finding count > 0 → `"approved-with-fixes"`
3. `agentVerdict === "approved"` AND fixable finding count === 0 → `"approved"`
4. `agentVerdict === "needs-fix"` → `"needs-fix"`
5. `agentVerdict === null` → `"escalation"`

`parseReviewScores()` and `parseFindingSeverityCounts()` SHALL NOT be called from `parseResult()`.

#### Scenario: agent verdict approved is adopted without score override

- **GIVEN** agent outputs verdict `approved` with a total score of 6.5 (below the old 7.0 threshold)
- **AND** no fixable findings exist
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `approved` (not overridden to `needs-fix`)

#### Scenario: agent verdict approved with fixable findings yields approved-with-fixes

- **GIVEN** agent outputs verdict `approved`
- **AND** the Findings table contains at least one finding with `Fix: yes`
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `approved-with-fixes`

#### Scenario: agent verdict needs-fix is adopted regardless of fix column

- **GIVEN** agent outputs verdict `needs-fix`
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `needs-fix` (fixable finding count is not consulted)

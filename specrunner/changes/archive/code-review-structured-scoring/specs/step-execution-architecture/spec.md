## ADDED Requirements

### Requirement: ParsedStepResult supports structured review scores

`ParsedStepResult` in `src/core/step/types.ts` SHALL have an optional `scores` field for steps that produce structured scoring output:

```ts
export interface ParsedStepResult {
  verdict: Verdict | null;
  findingsPath: string | null;
  fileContent?: string | null;
  scores?: ReviewScores & { criticalCount: number; highCount: number };
}
```

The `scores` field SHALL be set only by `CodeReviewStep.parseResult()`. All other step implementations SHALL omit this field (existing behavior unchanged).

The `ReviewScores` interface SHALL be defined in `src/core/parser/review-scores.ts`:

```ts
export interface ReviewScores {
  categories: Record<string, { score: number; weight: number }>;
  total: number;
}
```

The `FindingSeverityCounts` interface SHALL be defined in `src/core/parser/review-findings.ts`:

```ts
export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
```

#### Scenario: ParsedStepResult with scores

- **GIVEN** a `CodeReviewStep.parseResult()` call on content with a valid Scores table
- **WHEN** the result is returned
- **THEN** `result.scores` contains `categories`, `total`, `criticalCount`, and `highCount`
- **AND** `result.verdict` is determined by CLI verdict logic (not agent self-report alone)

#### Scenario: ParsedStepResult without scores (other steps)

- **GIVEN** any step other than CodeReviewStep (e.g., SpecReviewStep, VerificationStep)
- **WHEN** `parseResult()` is called
- **THEN** `result.scores` is `undefined`
- **AND** existing behavior is unchanged

## MODIFIED Requirements

### Requirement: CodeReviewStep parseResult determines verdict structurally

`CodeReviewStep.parseResult()` SHALL perform structured verdict determination when a Scores table is present in the review-feedback content:

1. Parse the Scores table via `parseReviewScores(content)` to extract category scores and total
2. Parse the Findings table via `parseFindingSeverityCounts(content)` to extract CRITICAL and HIGH counts
3. If both parses succeed, compute CLI verdict:
   - `total >= 7.0 AND criticalCount === 0 AND highCount === 0` → `"approved"`
   - Otherwise → `"needs-fix"`
4. Reconcile with agent's self-reported verdict using "strictest wins" rule:
   - Agent `"escalation"` → always `"escalation"` (CLI does not override escalation)
   - Either side `"needs-fix"` → `"needs-fix"`
   - Both `"approved"` → `"approved"`
5. If Scores table is absent, fall back to existing `parseReviewVerdict()` behavior (backward compatible)

#### Scenario: CLI overrides agent's approved when score is below threshold

- **GIVEN** review-feedback content with `- **verdict**: approved` and Scores table showing total = 5.5
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"needs-fix"` (CLI override)

#### Scenario: Agent's needs-fix is preserved even when CLI would approve

- **GIVEN** review-feedback content with `- **verdict**: needs-fix` and Scores table showing total = 8.0, CRITICAL = 0, HIGH = 0
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"needs-fix"` (agent's stricter judgment preserved)

#### Scenario: Escalation is never overridden

- **GIVEN** review-feedback content with `- **verdict**: escalation` and Scores table showing total = 9.0
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"escalation"`

#### Scenario: CRITICAL findings force needs-fix regardless of score

- **GIVEN** review-feedback content with Scores table showing total = 8.5 and Findings containing 1 CRITICAL finding
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"needs-fix"`

#### Scenario: HIGH findings force needs-fix regardless of score

- **GIVEN** review-feedback content with Scores table showing total = 7.5 and Findings containing 2 HIGH findings
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"needs-fix"`

#### Scenario: Fallback when Scores table is absent

- **GIVEN** review-feedback content with `- **verdict**: approved` but no `## Scores` section
- **WHEN** `CodeReviewStep.parseResult(content, deps)` is called
- **THEN** `result.verdict` is `"approved"` (existing parseReviewVerdict behavior)
- **AND** `result.scores` is `undefined`

### Requirement: Code-review agent output format includes Scores table

The code-review agent system prompt SHALL instruct the agent to include a Scores section in its review-feedback output. The Scores section SHALL appear alongside the existing Findings table and verdict line. The existing output format (verdict line, Findings table, Summary) SHALL remain unchanged.

#### Scenario: Code-review agent outputs Scores table

- **GIVEN** a code-review session runs to completion
- **WHEN** the review-feedback-NNN.md file is written
- **THEN** it contains a `## Scores` section with a Category/Score/Weight table
- **AND** it contains a `- **total**: <number>` line after the table
- **AND** the existing `- **verdict**: <value>`, `## Findings`, and `## Summary` sections are present

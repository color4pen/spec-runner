# agent-output-contract Specification (delta)

## Requirements

### Requirement: Findings Format table SHALL include `Fix` column

The Findings table produced by review-side agents SHALL include a `Fix` column as a mandatory column. The `Fix` column indicates whether the code-fixer step should automatically resolve the finding. The mandatory columns SHALL be: `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix`, `Fix`. The `Fix` column values are `yes` (this finding should be fixed by the code-fixer in the current PR) or `no` (pre-existing issue, intentional design decision, or separate scope; code-fixer SHALL ignore). The reviewer agent determines the `Fix` value for each finding based on context (whether the issue was introduced by the current change, whether it requires design changes, etc.).

#### Scenario: Finding with Fix: yes is targeted by code-fixer

- **GIVEN** a review-feedback file contains a finding with `Fix: yes`
- **WHEN** code-fixer reads the review feedback
- **THEN** code-fixer includes that finding in its fix targets

#### Scenario: Finding with Fix: no is ignored by code-fixer

- **GIVEN** a review-feedback file contains a finding with `Fix: no`
- **WHEN** code-fixer reads the review feedback
- **THEN** code-fixer does not attempt to fix that finding

#### Scenario: Backward compatibility — missing Fix column yields zero fixable count

- **GIVEN** a review-feedback file produced by a legacy reviewer that has no `Fix` column in the Findings table
- **WHEN** `parseFixableFindings()` is called on the file content
- **THEN** the function returns 0
- **AND** the verdict is `approved` (not `approved-with-fixes`)

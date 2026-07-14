# Spec: added-turn 削減の仕上げ

## Requirements

### Requirement: addedTurns SHALL round-trip losslessly through the event journal

The system SHALL persist `addedTurns` (`{ reportRetry, postWork, outputRepair }`) in the
`StepAttemptRecord.outcome` written to the append-only event journal, and SHALL restore it
via `fold`. A `StepRun` carrying `addedTurns` MUST reappear with an equal `addedTurns` after
`stepRunToRecord` → append → `fold`. A legacy record that lacks `addedTurns` MUST fold without
error, yielding `outcome.addedTurns === undefined` (backward compatible).

#### Scenario: addedTurns survives write → fold round-trip

**Given** a `StepRun` whose `outcome.addedTurns` is `{ reportRetry: 2, postWork: 1, outputRepair: 3 }`
**When** it is converted with `stepRunToRecord`, appended to `events.jsonl`, and read back with `fold`
**Then** the reconstructed step's `outcome.addedTurns` deep-equals `{ reportRetry: 2, postWork: 1, outputRepair: 3 }`

#### Scenario: legacy record without addedTurns folds to undefined

**Given** a `step-attempt` journal line whose `outcome` object has no `addedTurns` key
**When** `fold` parses the journal content
**Then** `fold` does not throw and the reconstructed step's `outcome.addedTurns` is `undefined`

### Requirement: The local adapter SHALL count consumed post-work turns and return consistent addedTurns on every path

The ClaudeCodeRunner SHALL increment `addedTurns.postWork` for every post-work turn it consumes,
including turns whose follow-up query fails. Every `run()` return path MUST carry an `addedTurns`
value. The invariant `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` MUST
hold on every returned result.

#### Scenario: failed post-work turn is counted

**Given** the main work turn succeeds and a single `postWorkPrompts` entry is configured
**And** the post-work follow-up turn yields a non-success (non-transient) result
**When** `run()` returns with `completionReason === "error"`
**Then** the returned `addedTurns.postWork` is `1`

#### Scenario: invariant holds on the returned result

**Given** any `run()` outcome that returns `addedTurns` and `followUpAttempts`
**When** the result is inspected
**Then** `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`

### Requirement: code-review SHALL NOT run an unconditional post-work self-check turn

The `CodeReviewStep` MUST NOT declare `followUpPrompt` or `getFollowUpPrompt`, so no unconditional
post-work turn is scheduled after a successful review turn. Output format (Markdown table with the
required 7-column header) SHALL remain guaranteed by the existing content-format outputContract.
Routing verdicts SHALL be derived from structured `report_result` findings, never from the
review-feedback `.md` file.

#### Scenario: code-review declares no follow-up prompt

**Given** the `CodeReviewStep` definition
**When** its `followUpPrompt` and `getFollowUpPrompt` members are inspected
**Then** both are `undefined`

#### Scenario: format-compliant review-feedback triggers no post-work or repair turn

**Given** a review-feedback file that satisfies both content-format checks (separator row and 7-column header)
**When** the content-format checks of `CodeReviewStep.outputContracts` are evaluated against it
**Then** no check fails, so no follow-up repair turn is scheduled

#### Scenario: malformed review-feedback still triggers a repair turn

**Given** a review-feedback file whose table is malformed (missing separator row or header)
**When** the content-format checks of `CodeReviewStep.outputContracts` are evaluated against it
**Then** at least one check fails, so a follow-up repair turn is scheduled (existing content-format behavior preserved)

#### Scenario: routing verdict is derived from structured findings, not the .md

**Given** structured findings containing a critical or high severity finding with `ok === true`
**When** the judge verdict is derived from those findings
**Then** the verdict is `needs-fix`, independently of any review-feedback `.md` content (the `.md` is not a routing input)

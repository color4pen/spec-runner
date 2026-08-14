# Spec: severity と fixability の分離 — LOW も fixable なら直す

## Requirements

### Requirement: Fixer routing targets all fixable findings regardless of severity

`selectFixerTargetFindings` SHALL return every finding whose `resolution` is `"fixable"`
regardless of its `severity`. It MUST NOT drop `"low"` severity findings. The routing layer
(this function) remains the single authoritative point where fixer targets are selected.

#### Scenario: LOW fixable finding is included in the fixer target set

**Given** a findings array containing a `low` + `fixable` finding, a `high` + `fixable` finding,
and a `medium` + `fixable` finding
**When** `selectFixerTargetFindings` is called
**Then** the result contains the LOW, HIGH, and MEDIUM fixable findings

#### Scenario: only-LOW input still routes the LOW findings

**Given** a findings array containing only `low` + `fixable` findings
**When** `selectFixerTargetFindings` is called
**Then** the result contains those LOW findings (it is not empty)

#### Scenario: non-fixable findings are still excluded

**Given** a findings array containing a `low` + `decision-needed` finding
**When** `selectFixerTargetFindings` is called
**Then** the `decision-needed` finding is not in the result

### Requirement: Code-fixer instructions treat every routed finding as a mandatory fix regardless of severity

The code-fixer step message SHALL instruct the agent to fix every finding presented to it as a
mandatory fix, regardless of severity, and MUST NOT tier, omit, or condition findings by severity
(no "LOW is ignored" / "MEDIUM only if ..." wording). This applies to every message branch
(conformance, coordinator-aggregated, coordinator-fallback, standard-embedded, standard-fallback).
Existing write-scope guards (no new features, no design/spec changes) MUST be preserved.

#### Scenario: LOW fixable finding appears in the code-fixer prompt

**Given** the standard code-fixer entry with an embedded findings set containing a `medium` and a
`low` fixable finding
**When** the code-fixer `buildMessage` produces the prompt
**Then** both the MEDIUM and the LOW finding (including their `[LOW]` label, title, file, and
rationale) appear in the prompt

#### Scenario: message states findings are fixed regardless of severity

**Given** any non-continuation code-fixer message branch with at least one routed finding
**When** `buildMessage` produces the prompt
**Then** the prompt instructs fixing all listed findings regardless of severity and does not
contain a severity-tiered instruction that omits LOW

### Requirement: Fixer prompts contain no severity-based re-filter

The code-fixer and spec-fixer system prompts SHALL NOT re-filter or de-prioritize findings by
severity. The routing layer (`selectFixerTargetFindings`) is the single authority for which
findings reach the fixer.

#### Scenario: code-fixer system prompt does not instruct ignoring LOW findings

**Given** the assembled `CODE_FIXER_SYSTEM_PROMPT`
**When** its text is inspected
**Then** it contains no instruction to ignore or skip findings based on `low` severity

### Requirement: Critical/high fixable findings retain the fix-plus-re-review path

`deriveJudgeVerdict` SHALL return `needs-fix` when any `critical` or `high` fixable finding is
present (ok=true, no decision-needed). This path (fix followed by a re-review round) MUST remain
unchanged by this change.

#### Scenario: high fixable finding yields needs-fix

**Given** a findings array containing a `high` + `fixable` finding and ok=true
**When** `deriveJudgeVerdict` is called
**Then** the verdict is `needs-fix`

### Requirement: Low/medium fixable findings are fixed without re-review

`deriveJudgeVerdict` and `deriveSpecReviewVerdict` SHALL return `approved` when the only fixable
findings are `low` or `medium` severity (observation auto-fix path). After the fixer applies these
findings and produces a change, the pipeline MUST route the approved code-fixer completion forward
(to the next step) and MUST NOT re-run the reviewer.

#### Scenario: low/medium fixable yields approved verdict

**Given** a findings array containing a `medium` + `fixable` and a `low` + `fixable` finding and
ok=true
**When** `deriveJudgeVerdict` is called
**Then** the verdict is `approved`

#### Scenario: code-fixer that applied an approved-path fix proceeds without re-review

**Given** code-review returned `approved` with fixable findings and the code-fixer then changed a
source file (approved findings-routing path)
**When** the code-fixer completes with verdict `approved`
**Then** the pipeline transitions forward to the next step (no reviewer re-run)

### Requirement: Regression-gate verifies the entire findings ledger

The regression-gate SHALL verify every entry of the findings ledger — all severities, including
entries that were previously treated as intentionally-unfixed low-severity — against the final
code. No ledger entry is excluded from verification on the basis of its severity. Any remaining
`fixable` regression MUST yield `needs-fix`.

#### Scenario: a low-severity ledger entry that regressed yields needs-fix

**Given** the regression-gate agent reports a `fixable` regression whose fingerprint matches a
`low` severity ledger entry, ok=true, no decision-needed
**When** the regression-gate verdict is derived
**Then** the verdict is `needs-fix` (the low ledger entry is not excluded from verification)

### Requirement: A code-fixer no-op on a routed target is not silently accepted

When the code-fixer run had routed target findings and produces no evidence of work — no change to
a source file and no change to a routed finding-named path — the pipeline SHALL override the
verdict to `needs-fix`. This override MUST apply even on the approved findings-routing path; the
run MUST NOT be treated as a legitimate approved completion solely because the reviewer verdict was
approved.

#### Scenario: approved findings-routing no-op is escalated

**Given** code-review returned `approved` with a fixable finding and the code-fixer changed only
pipeline-artifact files (no source file, no finding-named path)
**When** no-op detection runs after the code-fixer completes
**Then** the verdict is overridden to `needs-fix`

#### Scenario: a finding-named document change still counts as work

**Given** a routed finding names a change-folder document and the code-fixer modified exactly that
document
**When** no-op detection runs
**Then** the verdict is not overridden (the finding-target-path exemption counts the change as work)

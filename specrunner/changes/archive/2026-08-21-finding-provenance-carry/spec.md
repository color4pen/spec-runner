# Spec: regression-gate finding provenance carry

## Requirements

### Requirement: The regression-gate ledger SHALL carry a machine-assigned provenance ref for every entry

Every finding presented to the regression-gate in the findings ledger SHALL be
annotated with a machine-assigned provenance ref that is deterministically derived
from the finding's stable identity (file, line, title of the originating reviewer
finding). The ref MUST be visible to the regression-gate agent so it can be echoed
back, and MUST be independent of any text the LLM later regenerates (title / rationale
paraphrase).

#### Scenario: Ledger block shows a provenance ref per entry

**Given** a regression-gate step whose merged ledger contains at least one fixable finding
**When** the step builds its user message (buildMessage)
**Then** each ledger entry rendered in the message includes its provenance ref alongside the finding's file, line, and title

#### Scenario: The same originating fingerprint yields the same ref

**Given** two reviewer steps (e.g. code-review and spec-review) report findings with the identical fingerprint (same file, line, title)
**When** the provenance ref is computed for each
**Then** both resolve to the same provenance ref value

### Requirement: The regression-gate SHALL echo the provenance ref on each re-reported finding

When the regression-gate re-reports a ledger finding as a regression, it SHALL include
the originating ledger entry's provenance ref verbatim on the reported finding. The
`report_result` typed schema MUST accept this ref as an additive, optional field so that
existing finding consumers are unaffected.

#### Scenario: A re-reported regression carries its ledger ref

**Given** the gate verifies a ledger finding and determines it has regressed
**When** the gate reports the finding via report_result and the finding is parsed and persisted
**Then** the persisted finding retains the same provenance ref that was shown for that entry in the ledger block

#### Scenario: Non-gate steps are unaffected by the additive field

**Given** a spec-review or code-review step that does not populate a provenance ref
**When** its findings are parsed and persisted
**Then** the findings parse and persist exactly as before (the absent ref is treated identically to pre-existing behavior)

### Requirement: `--wontfix` SHALL resolve a gate finding to its origin via provenance ref, not regenerated prose

The resolution of `job resume --wontfix <index>` to a source-step finding SHALL be
performed by matching the gate finding's carried provenance ref against a machine-built
provenance index, and MUST NOT depend on the LLM-regenerated title or rationale of the
gate finding.

#### Scenario: Paraphrased-title regression resolves successfully

**Given** the regression-gate re-reported a ledger finding with a paraphrased title (differing from the originating reviewer finding's title) but carrying the correct provenance ref
**When** the operator runs `job resume --wontfix <index>` targeting that gate finding with a reason
**Then** the resolution succeeds and produces a DispositionDecisionRecord whose `step` is the originating reviewer step and whose `findingKey` is computed from that step's actual finding

### Requirement: `--wontfix` provenance resolution SHALL cover every ledger-contributing step, including spec-review

The provenance index used to resolve `--wontfix` SHALL be built from all steps that
contribute to the regression-gate ledger — the implementation reviewer chain AND
spec-review — so that a spec-review-origin finding can be resolved to its origin.

#### Scenario: spec-review-origin finding is disposed against its origin step

**Given** a ledger finding originating from spec-review that the gate re-reported (with the correct provenance ref)
**When** the operator runs `job resume --wontfix <index>` targeting that gate finding with a reason
**Then** the resolution succeeds and the DispositionDecisionRecord's `step` is the spec-review step

### Requirement: Unresolvable provenance SHALL fail all-or-nothing with exit code 2

If any selected `--wontfix` index refers to a gate finding whose provenance ref is
absent or does not resolve to any ledger-contributing step, the entire `--wontfix`
operation SHALL fail, produce zero disposition records, and exit with code 2. Invalid
indices (out of range, non-integer, duplicate, empty element) MUST continue to fail the
same way.

#### Scenario: Missing or unknown ref rejects the whole operation

**Given** a selected gate finding whose provenance ref is absent or matches no ledger-contributing step
**When** the operator runs `job resume --wontfix <index>`
**Then** the operation returns an error, writes no disposition records, and the resume exits with code 2

### Requirement: The persisted decisions format SHALL remain backward compatible

The change SHALL be additive to the finding schema only. The persisted `decisions`
field format MUST be unchanged: existing OptionDecisionRecord and DispositionDecisionRecord
values continue to read and match as before, and the machine respect of disposed findings
(ledger exclusion, fixer-input exclusion, approved+fixable routing guard) MUST continue to
function under the new resolution mechanism.

#### Scenario: Disposed finding is excluded from the regression-gate ledger

**Given** a DispositionDecisionRecord recorded for a source-step finding via the new resolution path
**When** the regression-gate ledger is recomputed
**Then** the disposed finding is excluded from the ledger (its source step + findingKey matches the disposition)

#### Scenario: Disposed finding does not trigger the approved+fixable fixer route

**Given** a reviewer whose only remaining fixable finding has been disposed via wontfix
**When** the reviewer-chain transition guard evaluates the reviewer's latest run
**Then** the approved+fixable route to code-fixer is NOT taken for that disposed finding

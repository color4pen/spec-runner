# Tasks: Decision Options Ledger

## T-01: Extend finding and decision ledger types

- [x] Add `DecisionOption` and optional `Finding.options` to `src/kernel/report-result.ts`.
- [x] Add `DecisionRecord` and optional `decisions?: DecisionRecord[]` to `src/state/schema.ts`.
- [x] Ensure existing state construction and validation treat absent `decisions` as an empty ledger without requiring migration.

**Acceptance Criteria**:
- TypeScript accepts findings with options and legacy findings without options.
- Legacy state files without `decisions` remain valid.

## T-02: Enforce options on new judge report tool input

- [x] Update judge, code-review, request-review, and conformance report tool schemas in `src/core/step/report-tool.ts` to include `options` on findings.
- [x] Update `parseFindings` in `src/core/port/report-result.ts` so new `decision-needed` findings require at least two valid options.
- [x] Keep persisted-state compatibility by not making historical tool-result reads reject missing `options`.
- [x] Add tests covering valid decision options, missing options, one option, and malformed option fields.

**Acceptance Criteria**:
- New optionless `decision-needed` report tool input is rejected by parser/schema tests.
- Fixable findings do not require options.
- Old-format persisted tool results remain readable.

## T-03: Update prompt and template guidance

- [x] Update `src/prompts/judge-rules.ts` so `DECISION_NEEDED_DEFINITION` requires at least two options and says non-optionable issues are `fixable`.
- [x] Update JSON examples in judge prompts and any step-output templates that describe finding shape.
- [x] Adjust prompt coverage tests to assert the options requirement appears in all judge prompts.

**Acceptance Criteria**:
- Prompt tests prove all judge prompts include the shared options rule.
- No prompt describes `decision-needed` as valid without alternatives.

## T-04: Implement decision key and filtering helpers

- [x] Add a pure helper module such as `src/core/decision/decision-ledger.ts`.
- [x] Implement normalized finding key generation from `step`, `file`, optional `line`, `title`, and `rationale`.
- [x] Implement `filterUndecidedFindings(step, findings, decisions)` and related tests.
- [x] Cover exact match, whitespace/case normalization, different rationale, different file, and absent ledger.

**Acceptance Criteria**:
- Decided matching findings are filtered.
- Non-matching or new decision-needed findings remain.
- Helper tests document the matching contract.

## T-05: Render open decisions in escalation notifications

- [x] Update `src/core/notify/issue-notifier.ts` to extract latest open `decision-needed` findings for `state.resumePoint.step`.
- [x] Filter out findings already represented in `state.decisions`.
- [x] Render numbered findings and numbered options in `buildEscalationComment`.
- [x] Include a concrete `/resume N=M` example, covering multiple findings when present.
- [x] Add notification tests for one finding, multiple findings, already-decided suppression, and no-options graceful behavior for legacy data.

**Acceptance Criteria**:
- Escalation comments include decision options and selection instructions.
- Already-decided findings are not rendered as open decisions.
- Existing marker, step, reason, diff URL, and base resume command behavior remains intact.

## T-06: Parse resume decision selections

- [x] Add a pure parser that returns structured `N=M` selections plus prose prompt.
- [x] Preserve existing `/resume` prose behavior when there are no selection tokens.
- [x] Reject malformed decision-token input for jobs with open decisions rather than silently treating it as prose.
- [x] Add inbox planner tests for `/resume`, `/resume prose`, `/resume 1=2 2=1 prose`, duplicate finding numbers, zero/negative values, and malformed tokens.

**Acceptance Criteria**:
- `/resume 1=2 2=1 note` parses into two selections and `note`.
- Existing prose-only resume tests still pass.
- Malformed structured selection input does not create a normal resume action.

## T-07: Record selections in state before resuming

- [x] Extend resume action flow so selected options are resolved against the latest open decision list.
- [x] Validate that every open decision has exactly one valid option selection.
- [x] Append `DecisionRecord` entries to `JobState.decisions` before the job transitions back to running.
- [x] Preserve the prose supplement as the existing one-shot `resumePrompt`.
- [x] Add tests proving valid selections are recorded and invalid or partial selections leave the job awaiting resume.

**Acceptance Criteria**:
- A valid `/resume 1=2 2=1` comment creates one ledger entry per open decision.
- Recorded entries include finding key, finding snapshot, selected option snapshot, source, and timestamp.
- Prose still reaches `resumePrompt`.

## T-08: Honor decisions during verdict derivation

- [x] Update executor verdict handling to filter decided findings before calling judge/request-review/conformance verdict derivation.
- [x] Use the same filtered findings for `collectVerdictAffectingFindings` and finding reference verification.
- [x] Store the original unfiltered tool result in step outcome for auditability.
- [x] Add unit tests for normal judge, request-review, and conformance paths.

**Acceptance Criteria**:
- A repeated decided `decision-needed` finding does not cause escalation.
- An undecided `decision-needed` finding still causes escalation.
- Critical/high fixable findings still route to needs-fix.

## T-09: Integration and regression coverage

- [x] Add or update end-to-end pipeline/inbox tests for the full flow: decision-needed report, notification rendering, `/resume` selection, ledger persistence, and repeated finding suppression.
- [x] Add a compatibility fixture or test for old-format tool results without options.
- [x] Update test helpers that synthesize `decision-needed` findings so new reports include options where strict parsing applies.
- [x] Run `bun run typecheck` and `bun run test`.

**Acceptance Criteria**:
- All request acceptance criteria are covered by automated tests.
- `bun run typecheck && bun run test` is green.

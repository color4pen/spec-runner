# Design: Decision Options Ledger

## Context

Judge steps currently escalate `decision-needed` findings using free-form prose in a later `/resume` comment. The reported finding schema has `severity`, `resolution`, `file`, optional `line`, `title`, and `rationale`, but no structured alternatives. The inbox planner strips `/resume` and passes the remaining prose as `resumePrompt`; it does not parse selections. Verdict derivation treats any `decision-needed` finding as escalation, and state has no durable representation of human decisions.

This change makes `decision-needed` a structured contract: a reviewer must present at least two options, the escalation notification must render those options, `/resume` may choose among them, and accepted choices become a decision ledger that verdict derivation honors on subsequent judge runs.

## Goals / Non-Goals

**Goals**:

- Require `options: [{ label, consequence }]` with at least two entries for new `decision-needed` findings.
- Render decision-needed findings and numbered options in escalation notifications.
- Parse `/resume` decision selections while preserving remaining prose as `resumePrompt`.
- Persist selected decisions in job state.
- Exclude decided matching findings from verdict blocking and finding-reference verification.
- Preserve backward compatibility for already persisted old-format tool results and legacy state.
- Test the schema, notification, resume parsing, state recording, verdict filtering, legacy reads, and `typecheck && test`.

**Non-Goals**:

- No changes to the `observations` channel.
- No automatic resume-context injection beyond preserving existing `resumePrompt` behavior.
- No broad suppression after approval; only repeated matching `decision-needed` findings are suppressed.
- No source-code edits in this design step. Implementation is left to downstream agents.

## Decisions

**D1. Add first-class decision option fields to `Finding`, but enforce them only for new tool input**

`src/kernel/report-result.ts` should add:

- `DecisionOption { label: string; consequence: string }`
- `Finding.options?: DecisionOption[]`

The runtime report tool schemas in `src/core/step/report-tool.ts` should describe options on all judge-style tools, including conformance and request-review. Hand validation in `src/core/port/report-result.ts` should reject a new tool call when any `resolution: "decision-needed"` finding has fewer than two valid options. Each option requires non-empty `label` and `consequence`.

Rationale: Rejecting invalid new reports makes the rule mechanical and gives the existing report-tool retry path a chance to ask the agent for corrected input. Making `options` optional in the TypeScript type keeps legacy state and old persisted tool results readable.

Alternatives considered:

- Downgrade missing-option findings to `fixable`: avoids a hard failure but can silently change reviewer intent and route to a fixer without human awareness.
- Make `options` required on every `Finding`: simpler type, but breaks legacy state and fixable findings.

**D2. Keep old-format persisted results readable through a legacy parse mode**

The strict check should apply to current report tool calls. State loading and historical `StepRun.outcome.toolResult` reading must continue accepting older findings without `options`.

Implementation should avoid adding validation to `validateJobState` that rejects old tool results. If any utility is introduced to normalize historical findings, it should leave missing `options` as `undefined`.

Rationale: The acceptance criteria explicitly require old-format tool result compatibility while also requiring new schema enforcement.

Alternatives considered:

- One parser with an `allowLegacyDecisionOptions` boolean: viable if the call sites stay obvious. The important boundary is that adapter tool input is strict and state read is permissive.
- Migration that backfills placeholder options: misleading because historical reviewers did not present real choices.

**D3. Use a deterministic decision key derived from the finding identity**

Persist each decision with a `findingKey`, computed from normalized finding fields:

`step | file | line-or-empty | normalized-title | normalized-rationale`

Normalization should trim, collapse whitespace, and lowercase. The key should be computed by a pure helper, for example in `src/core/decision/decision-ledger.ts`.

Rationale: The request needs repeated reports of the same issue to stop re-escalating. Existing findings do not have stable IDs, so the most defensible match is a deterministic fingerprint over the current stable fields. Including `rationale` reduces false positives where a reviewer reuses a generic title for a different issue.

Alternatives considered:

- Match by array index in the escalation notification: useful for parsing the immediate `/resume`, but unstable across later reviewer runs.
- Match only by `file` and `title`: more tolerant but too likely to suppress unrelated issues.
- Add model-generated finding IDs: introduces another model-authored field and does not solve trust in stable identity.

**D4. Store a decision ledger on `JobState`**

Add optional `decisions?: DecisionRecord[]` to `JobState`, preserving backward compatibility when absent. A record should include:

- `id`: stable unique ID for the state record, e.g. `decision-<timestamp-or-counter>`
- `step`: step that produced the decision-needed finding
- `findingKey`: deterministic key from D3
- `finding`: snapshot of the selected finding title, file, line, rationale, severity, and options
- `selectedOption`: one-based option number plus option label/consequence snapshot
- `resumeComment`: raw `/resume` comment body or the parsed prose supplement when available
- `decidedAt`: ISO timestamp
- `source`: initially `"issue-comment"`

Rationale: A snapshot gives future agents and diagnostics enough context even if later findings mutate. Keeping the field optional avoids state migration requirements.

Alternatives considered:

- Store only selected IDs: smaller, but poor for auditing and future resume-context injection.
- Store decisions in a separate file: avoids `state.json` growth but adds another projection to keep synchronized for a small ledger.

**D5. Render decision-needed findings from the latest escalated step run**

`buildEscalationComment(state)` should append a `Decisions needed` section when the latest run for `state.resumePoint.step` has tool-result findings with `resolution: "decision-needed"` and valid options. The renderer must treat every finding field as untrusted plain text: escape or otherwise encode the title, file, line, rationale, option labels, and option consequences so they cannot introduce Markdown structure, HTML, mentions, or stray `/resume`-style instructions. Each undecided finding should be numbered by finding order, and each option should be numbered by option order:

```text
Decisions needed:
1. <title> (<file>:<line>)
   <rationale>
   1. <label> — Consequence: <consequence>
   2. <label> — Consequence: <consequence>

Reply with:
  /resume 1=2
```

For multiple findings, the command example should include all open decisions, e.g. `/resume 1=2 2=1`.

Rationale: Numbering by notification order makes human selection compact and matches the requested `/resume 1=2 2=1` style. Rendering only the latest escalated step keeps the comment relevant and bounded. Escaping model-controlled text prevents the comment body from being used as a secondary instruction channel or from spoofing the decision UI.

Alternatives considered:

- Render all historical decision-needed findings: noisy and may include already-decided items.
- Require labels in `/resume`: less error-prone to reordering, but harder to type and quote correctly.

**D6. Parse `/resume` selection tokens separately from prose**

Introduce a pure parser, for example `parseResumeDecisionInput(body)`, that returns:

- `selections: { findingNumber: number; optionNumber: number }[]`
- `resumePrompt: string | null`

Selection tokens use `N=M`, where `N` is the one-based rendered finding number and `M` is the one-based option number. Tokens may appear after `/resume` in any order and are removed from the prose supplement. Everything else remains in `resumePrompt` exactly as the existing parser would preserve after trimming.

Invalid selection tokens should not be silently accepted. `planResumes` can still produce a resume action with prose only when there are no `N=M` tokens; when malformed decision tokens are present for a job with open decisions, the implementation should leave the job awaiting resume and allow a later valid comment. It may log or surface a warning through the inbox path.

Rationale: This keeps the current prose behavior intact and adds structured choices without inventing a new command.

Alternatives considered:

- Use `/resume --decision 1:2`: more explicit but more syntax than the request example.
- Treat invalid tokens as prose: dangerous because a typo would resume without recording a required decision.

**D7. Apply selections against the same open decision list used for notification**

When a valid `/resume` comment is accepted, resolve each `findingNumber` against the latest open decision-needed findings for the job's resume step after filtering already-decided matches. Validate that every open decision has exactly one selection and that every selected option exists.

Persist records before resuming the job. The existing prose supplement continues into the runtime as `resumePrompt`.

Rationale: The numbering contract is local to the bot's last escalation comment. Recomputing the same open list from state avoids trusting comment text as source of truth.

Alternatives considered:

- Allow partial selection: keeps flexibility but can resume with unresolved decisions and immediately re-escalate.
- Persist decisions after the next step starts: risks losing the human decision if process startup fails.

**D8. Filter decided findings before verdict derivation and reference verification**

Add pure helpers:

- `isFindingDecided(step, finding, decisions)`
- `filterUndecidedFindings(step, findings, decisions)`

Executor verdict derivation should pass filtered findings into `deriveJudgeVerdict`, `deriveConformanceVerdict`, `deriveRequestReviewVerdict`, and `collectVerdictAffectingFindings` for reference verification. The original `toolResult.findings` should still be stored in the step outcome for auditability.

Rationale: The requirement says decided findings must not count as blocking. Filtering before both verdict derivation and ref verification ensures a decided finding cannot re-trigger escalation through the reference-check path.

Alternatives considered:

- Teach `deriveJudgeVerdict` about `JobState`: rejected because verdict helpers are currently pure and state-independent.
- Mutate the stored tool result to remove decided findings: loses audit trail.

**D9. Update judge prompts and templates to require options**

`DECISION_NEEDED_DEFINITION` and every JSON-shape example that includes findings should state that `resolution: "decision-needed"` requires `options` with at least two labeled alternatives and consequences. The rule should explicitly say: if a reviewer cannot write at least two viable options, it is not `decision-needed` and should be reported as `fixable` with the appropriate severity.

Rationale: Schema enforcement catches violations, while prompt discipline reduces retry churn and reviewer over-reporting.

Alternatives considered:

- Rely on schema only: correct but inefficient because agents learn only through invalid tool retries.

## Migration Plan

No migration is required. `JobState.decisions` is optional and missing means an empty ledger. `Finding.options` is optional at the type and persisted-state boundary. New report tool input becomes strict, while old state files and old tool-result records remain readable.

## Risks / Trade-offs

- [Risk] Deterministic key matching may miss a repeated issue if the reviewer rewrites the title or rationale. → Mitigation: normalize text, include stable file/line, and document that exact semantic suppression is limited to matching structured finding identity.
- [Risk] Deterministic key matching may suppress a different issue with identical file/title/rationale. → Mitigation: include rationale and step in the key; store full snapshots for audit.
- [Risk] Numbered selections can become stale if another escalation comment appears. → Mitigation: inbox already uses comments after the latest escalation marker; resolve numbering from current state at acceptance time.
- [Risk] Strict tool validation can increase report-result retries during rollout. → Mitigation: update tool descriptions and shared prompt fragments in the same change.
- [Risk] Partial or malformed `/resume` choices could accidentally resume. → Mitigation: parse structured tokens explicitly and require complete valid selections for all open decisions before state recording.

## Open Questions

None. The design chooses strict new-report validation, `/resume N=M` syntax, and deterministic matching by normalized finding identity.

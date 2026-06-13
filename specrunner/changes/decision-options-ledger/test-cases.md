# Test Cases: Decision Options Ledger

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 31
- **Manual**: 0
- **Priority**: must: 21, should: 10, could: 0

---

### TC-001: decision-needed without options is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: decision-needed findings SHALL include structured options > Scenario: decision-needed without options is invalid

---

### TC-002: decision-needed with two valid options is accepted

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: decision-needed findings SHALL include structured options > Scenario: decision-needed with two options is valid

---

### TC-003: old state with optionless decision-needed finding loads without error

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: legacy persisted findings SHALL remain readable > Scenario: old state with optionless decision-needed finding loads

---

### TC-004: escalation comment renders finding options numbered

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation notifications SHALL render open decision choices > Scenario: escalation comment lists options

---

### TC-005: /resume selections and prose are parsed together

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume comments SHALL accept structured selections and preserve prose > Scenario: selections and prose are parsed together

---

### TC-006: valid /resume selections are recorded as decision ledger entries

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: selected decisions SHALL be recorded before resume > Scenario: valid selections create ledger records

---

### TC-007: repeated decided finding does not escalate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: decided matching findings SHALL not block verdicts > Scenario: repeated decided finding does not escalate

---

### TC-008: changed decision-needed finding with different key still escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: undecided decision-needed findings SHALL still escalate > Scenario: changed decision-needed finding still escalates

---

### TC-009: judge prompts include options requirement and fixable fallback rule

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: prompt rules SHALL define decision-needed by options > Scenario: shared decision-needed definition mentions options

---

### TC-010: fixable finding without options is accepted

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a judge step calls `report_result`
**WHEN** a finding has `resolution: "fixable"` with severity `critical` and no `options` field
**THEN** the report tool input parses successfully and the finding is recorded without error

---

### TC-011: decision-needed with exactly one option is rejected

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a judge step calls `report_result`
**WHEN** a finding has `resolution: "decision-needed"` and exactly one `{ label, consequence }` option
**THEN** the parser rejects the input, reporting that fewer than two options were provided

---

### TC-012: decision-needed option with empty label is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D1

**GIVEN** a judge step calls `report_result`
**WHEN** a `decision-needed` finding includes two options but one has `label: ""`
**THEN** the parser rejects the input due to the invalid (empty) option field

---

### TC-013: decision-needed option with empty consequence is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D1

**GIVEN** a judge step calls `report_result`
**WHEN** a `decision-needed` finding includes two options but one has `consequence: ""`
**THEN** the parser rejects the input due to the invalid (empty) option field

---

### TC-014: finding key normalization matches across different casing and whitespace

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** `JobState.decisions` contains a record whose `findingKey` was derived from a finding with title `"Foo Bar"` and leading/trailing spaces in rationale
**WHEN** a later judge step reports the same finding with title `"foo bar"` and normalized rationale whitespace
**THEN** `isFindingDecided` returns true and the finding is filtered as decided

---

### TC-015: finding with different rationale is not matched as decided

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** `JobState.decisions` contains a record for a finding at `src/foo.ts` with a specific rationale
**WHEN** a later judge step reports the same file and title but with different rationale text
**THEN** `isFindingDecided` returns false and the finding is treated as a new undecided finding

---

### TC-016: finding with different file is not matched as decided

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** `JobState.decisions` contains a record for a finding at `src/alpha.ts`
**WHEN** a later judge step reports the same title and rationale but at `src/beta.ts`
**THEN** `isFindingDecided` returns false and the finding is treated as undecided

---

### TC-017: absent decisions field is treated as an empty ledger

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D4

**GIVEN** a `JobState` that has no `decisions` field (legacy or freshly created state)
**WHEN** `filterUndecidedFindings` is called with any `decision-needed` findings
**THEN** no findings are filtered and all findings remain undecided

---

### TC-018: multiple decision-needed findings all render with sequential numbering

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D5

**GIVEN** the latest escalated judge step reported two undecided `decision-needed` findings, each with valid options
**WHEN** the issue notifier builds the escalation comment
**THEN** both findings appear numbered 1 and 2, their options appear numbered within each finding, and the instruction example includes `/resume 1=? 2=?`

---

### TC-019: already-decided finding is not rendered as open in notification

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `JobState.decisions` has a record matching one of two `decision-needed` findings in the latest escalated step
**WHEN** the issue notifier builds the escalation comment
**THEN** only the one undecided finding appears in the `Decisions needed` section; the decided finding is absent

---

### TC-020: legacy decision-needed finding with no options renders without crash

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D5

**GIVEN** the latest escalated step contains an old-format `decision-needed` finding with no `options` field
**WHEN** the issue notifier builds the escalation comment
**THEN** the notification does not throw and omits the options section for that finding (no decision-needed section or safe fallback)

---

### TC-021: existing escalation notification fields are preserved when decision section is added

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a job is escalated with a `decision-needed` finding that has valid options
**WHEN** the issue notifier builds the escalation comment
**THEN** the comment still includes the escalation marker, step name, reason text, diff URL, and the base `/resume` command in addition to the new `Decisions needed` section

---

### TC-022: prose-only /resume with no N=M tokens preserves existing behavior

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D6

**GIVEN** a job in awaiting-resume state with no open decisions
**WHEN** a collaborator comments `/resume some prose text`
**THEN** `selections` is empty and `resumePrompt` equals `"some prose text"`

---

### TC-023: duplicate finding number in /resume tokens is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D6

**GIVEN** a job awaiting resume with two open decisions
**WHEN** a collaborator comments `/resume 1=2 1=1` (finding 1 appears twice)
**THEN** the parser rejects the input and the job remains awaiting resume

---

### TC-024: zero or negative N or M values in selection tokens are rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D6

**GIVEN** a job awaiting resume with one open decision
**WHEN** a collaborator comments `/resume 0=1` or `/resume 1=-1`
**THEN** the parser rejects the malformed token and the job remains awaiting resume

---

### TC-025: malformed selection token with open decisions leaves job awaiting

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D6

**GIVEN** a job awaiting resume with one open decision
**WHEN** a collaborator comments `/resume 1=` (token with missing option number)
**THEN** the inbox does not create a resume action; the job remains awaiting resume

---

### TC-026: partial selection (not all open decisions covered) leaves job awaiting

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria / design.md > D7

**GIVEN** a job awaiting resume with two open `decision-needed` findings
**WHEN** a collaborator comments `/resume 1=2` (only finding 1 is resolved)
**THEN** the job remains awaiting resume and no `DecisionRecord` entries are written to state

---

### TC-027: out-of-range option number is rejected

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria / design.md > D7

**GIVEN** a job awaiting resume with one finding that has exactly two options
**WHEN** a collaborator comments `/resume 1=5` (option 5 does not exist)
**THEN** the job remains awaiting resume and no ledger record is written

---

### TC-028: prose supplement reaches resumePrompt alongside valid selections

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** a job awaiting resume with one open decision
**WHEN** a collaborator comments `/resume 1=2 prefer lower scope`
**THEN** the ledger records the selection for finding 1 option 2
**AND** `resumePrompt` contains `"prefer lower scope"`

---

### TC-029: critical/high fixable findings still route to needs-fix despite decided findings

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** `JobState.decisions` contains a decided record for a prior `decision-needed` finding
**AND** the latest judge step reports a separate `fixable` finding with severity `critical`
**WHEN** verdict derivation runs after filtering decided findings
**THEN** the verdict is `needs-fix` — only the decided `decision-needed` finding is suppressed; the critical fixable finding still affects the verdict

---

### TC-030: escalation comment escapes model-controlled text in finding fields

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** a `decision-needed` finding whose title contains Markdown special characters (e.g. `**bold**`) or a literal `/resume` instruction
**WHEN** the issue notifier builds the escalation comment
**THEN** those characters are escaped or encoded so they cannot introduce Markdown structure, HTML, or spoof the `/resume` command syntax in the rendered comment

---

### TC-031: end-to-end pipeline: decision-needed → notification → /resume → ledger → suppression

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** a judge step escalates with a `decision-needed` finding (two options) and the escalation notification is rendered
**WHEN** a collaborator replies `/resume 1=2`, the ledger records the decision, and the next judge run reports the same finding
**THEN** the full pipeline produces: a notification with numbered options, a `DecisionRecord` in state, and a verdict that does not re-escalate on the matching finding

---

## Result

```yaml
result: completed
total: 31
automated: 31
manual: 0
must: 21
should: 10
could: 0
blocked_reasons: []
```

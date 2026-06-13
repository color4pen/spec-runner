# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Security / Test coverage | `specrunner/changes/decision-options-ledger/tasks.md:53` | The design now requires escaping or encoding all model-controlled finding text before rendering GitHub escalation comments, which addresses the prior Markdown-injection concern. However, the implementation checklist only asks for normal notification tests and does not require adversarial inputs such as Markdown lists, HTML, mentions, fake option numbering, or embedded `/resume` text. A downstream implementation could satisfy the task list while leaving the key security behavior untested. | Add notification test tasks/acceptance criteria with adversarial titles, rationales, option labels, and consequences, and assert they cannot create extra visible choices, mentions, HTML structure, or competing `/resume` instructions. |
| 2 | MEDIUM | Security / Auditability | `specrunner/changes/decision-options-ledger/design.md:77` | `DecisionRecord` captures the selected option and source type but not the GitHub comment id or deciding actor. Structured decisions alter future verdict routing, so the ledger should preserve which authorized principal made the decision and which comment supplied it for later audit or incident investigation. | Add `sourceCommentId` and `decidedBy` (or equivalent GitHub actor metadata available from the inbox comment) to the record shape, and extend resume recording tests to assert those fields are persisted when decisions come from issue comments. |

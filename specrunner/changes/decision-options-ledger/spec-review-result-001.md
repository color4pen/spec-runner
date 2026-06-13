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

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Security / Output encoding | `specrunner/changes/decision-options-ledger/design.md:97` | The escalation notification design renders model-controlled finding text (`title`, `rationale`, option `label`, and `consequence`) directly into a GitHub Markdown comment, while the same comment is the UI a human uses to choose `/resume N=M`. Without an explicit containment or escaping rule, a malicious or malformed finding can inject Markdown/HTML, fake additional numbered options, fake `/resume` instructions, or visually reshape the real choices. That can cause the ledger to record a different decision than the one the human intended. | Specify a safe rendering contract for all finding-derived text in escalation comments, such as Markdown/HTML escaping plus bounded indentation/blockquotes or code-style containment that cannot create executable-looking commands or extra option numbers. Add notification tests with adversarial titles/rationales/options containing Markdown lists, HTML comments/tags, and `/resume` text, and assert the canonical generated instruction remains visually and structurally distinct. |

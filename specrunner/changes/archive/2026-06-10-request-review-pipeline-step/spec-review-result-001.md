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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Security | spec.md | `resume SHALL re-copy the draft` requirement does not mention symlink rejection. The existing run path explicitly calls `rejectSymlink()` before copying; the analogous `recopyDraftToChangeFolder` helper should do the same. `tasks.md` T-10 says "symlink 拒否" but spec.md is the normative source. | Add a scenario: `Given the draft path is a symlink / When resume re-copies / Then the copy is rejected with SYMLINK_REJECTED`. |
| 2 | LOW | Completeness | design.md | `CommandInvocation.command` type (`"request-review" \| "request-generate" \| "job"`) cleanup is left as an Open Question. T-12 says "整理する" but gives no decision. Removing `"request-review"` from the union is safe (no code discriminates on it), but the spec and tasks leave the decision to the implementer. | Add a concrete decision in T-12: remove `"request-review"` from the union (no consumers discriminate on it; existing historical entries are read at runtime as `string`). |
| 3 | LOW | UX | design.md / tasks.md | `outputSpecReviewVerdict()` in `runner.ts` is called unconditionally after every pipeline run. When the pipeline escalates at request-review (before spec-review runs), this function silently no-ops. The user receives only the generic "Pipeline halted at step 'request-review'" message with no reference to the result file. | Not blocking. Consider adding `outputRequestReviewVerdict()` to `runner.ts` (similar pattern to `outputSpecReviewVerdict`) as a follow-up task or note in T-08/T-14. |

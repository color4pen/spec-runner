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
| 1 | LOW | Test coverage | tasks.md / spec.md | POST/PUT network error scenario is absent from T-08c. The requirement text in spec.md says "SHALL not retry … when a 5xx response is received **or a network error is thrown**", but TC-RC-013 and TC-RC-014 only exercise 5xx. If the implementer misses the catch-block guard in T-02, no test would catch it. | Add TC-RC-019: POST + fetch throws network error → single call, throws immediately; and TC-RC-020 for PUT. Adds 2 test cases to `github-client-request.test.ts`. |
| 2 | LOW | Test coverage | tasks.md | `searchOpenIssuesByLabel` cross-origin case is not listed in T-08h (TC-SO-001 through TC-SO-005), even though T-07 requires `validateSameOrigin` to be added to that loop. The five-method scope of D7 is not fully exercised by tests. | Add TC-SO-006: `searchOpenIssuesByLabel` page-1 Link header → cross-origin URL → throws GITHUB_API_ERROR, fetchFn called once. |
| 3 | LOW | Robustness | tasks.md (T-03) | The pseudocode in T-03 calls `resp.json()` on the 422 body without a `.catch()` guard. If GitHub returns a 422 with a non-JSON body (e.g., HTML error page), an unhandled TypeError propagates instead of GITHUB_API_ERROR. | Add `.catch(() => ({ message: "" }))` to the `resp.json()` call in the 422 branch, matching the defensive pattern already used in `mergePullRequest`'s `attemptMerge` (line 552 in current code). |
| 4 | LOW | Accuracy | request.md (background section) | `deleteRef（DELETE, 628行）` is referenced as a mutation at risk of duplication, but `deleteRef` does not exist in the current codebase (searched `src/` — no matches). Line 628 is in `listIssueComments`. The background section describes an older code state. | Informational only — no spec impact. D2 correctly says DELETE retains retry behavior, and the only DELETE in the live code (`removeLabel`) is idempotent. No change needed to design or tasks. |
| 5 | LOW | Spec clarity | tasks.md (T-05, T-07) | T-07 states "the initial URL does NOT need to be validated; only Link-header-derived next URLs are validated", but T-05's pseudocode places `validateSameOrigin(statusesUrl, this.baseUrl)` at the top of the while-loop, which also runs on the first (non-Link-derived) URL. The two paragraphs are in mild tension. | Clarify in T-07 that calling `validateSameOrigin` on the initial URL (constructed from `this.baseUrl`) is always a no-op pass and harmless, so placing the guard at the top of every iteration is the preferred pattern. No functional change needed. |

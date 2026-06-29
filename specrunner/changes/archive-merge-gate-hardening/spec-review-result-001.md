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
| 1 | LOW | Spec coverage | spec.md | Requirement §1 ("A transient BLOCKED merge state MUST NOT short-circuit") states in the body that `failure` rollup MUST fire the existing check-failure escalation, but has no Scenario for it. test-case-gen could derive this from the body text alone, and tasks.md T-01 calls it out explicitly, so it is not a blocker — but a scenario would remove ambiguity. | Add a Scenario "BLOCKED with failure rollup → check-failure escalation fires, not branch-protection escalation" under Requirement §1. |
| 2 | LOW | Known risk / acknowledged | design.md | Within a single loop iteration `isBlocked` is captured from `getPullRequest` and `rollup.state` from a later `getCheckStatus` call. If CI completes between the two fetches (narrow window), the iteration sees `isBlocked=true` and `rollup.state="success"` simultaneously, producing a false branch-protection escalation. Design correctly identifies and accepts this with a one-line re-run mitigation. | Noted. No action required; consistent with the risk register in design.md. |

## Review Notes

### Code reference verification

All code-line references in request.md were verified against the worktree source:

- `merge-then-archive.ts:318-329` — DIRTY/CONFLICTING escalation: confirmed unchanged, ordered before BLOCKED.
- `merge-then-archive.ts:332-342` — BLOCKED immediate escalation: confirmed. This fires before headSha guard and check polling.
- `merge-then-archive.ts:466-480` — `checkMergeableForMerge` Step 5 gate: confirmed.
- `pr-status.ts:114-192` — `checkMergeableForMerge` with `MERGEABLE_RETRY_COUNT=3`, `MERGEABLE_RETRY_DELAY_MS=5000`: confirmed.
- `github-client.ts:731-750` — `isMergeTransientFailure` classifier: confirmed. Transient: 405 "not mergeable" / "is expected" / "base branch was modified" / "head branch was modified" / locked. Permanent: 409 / 405 "has failed".
- `merge-then-archive.ts:500-510` — current `!mergeResult.merged` handler: confirmed generic (no cause distinction). T-03 adds the classifier.

### Design evaluation

- **D1 (BLOCKED deferred to check polling)**: Correct root fix. Capturing `isBlocked` per-iteration from `prData` and evaluating it only at terminal check-polling decision points (success break, none-grace break) cleanly separates the transient state from the permanent one. The DIRTY/CONFLICTING guard retains priority over BLOCKED (correct ordering).
- **D2 (Step 5 gate removal)**: Justified. `mergePullRequest` is a synchronous authority; `isMergeTransientFailure` already handles the compute-lag race. Removing the flaky pre-gate is a net correctness improvement with no safety regression.
- **D3 (delete `checkMergeableForMerge`)**: Clean. No production callers remain after D2; dead-code removal reduces future confusion.
- **D4 (`classifyMergeFailure`)**: Consistent with the existing `isMergeTransientFailure` pattern (substring matching on lowercase message). All three escalation buckets include a resume command.
- **D5 (conflict fail-closed)**: Double coverage retained — DIRTY/CONFLICTING in wait loop and 409 at merge endpoint.

### Spec format check

- All Requirements begin with `### Requirement:` ✓
- All Requirements contain at least one `#### Scenario:` ✓
- All Requirements contain SHALL or MUST in the body ✓
- Scenarios use Given/When/Then ✓
- Coverage of all behavioral changes: BLOCKED transient handling ✓, Step 5 gate removal ✓, cause-distinguished escalations ✓, conflict fail-closed ✓

### Tasks completeness

T-01 through T-06 are granular enough for unambiguous implementation. Special attention: T-05a's `TC-MTA-ARCHIVE-SHA` mock-count fix (removing the stale 4th `getPullRequest` mock for `checkMergeableForMerge`) is correctly identified and must not be overlooked.

### Security review

No OWASP Top 10 issues identified.

- **Authorization**: Conflict detection remains fail-closed (two independent layers). BLOCKED escalation for non-check branch-protection requirements (e.g. missing required review) is preserved at the terminal decision points — the runner cannot bypass a missing reviewer by re-running.
- **Injection**: `classifyMergeFailure` performs read-only substring matching on GitHub's API response. `mergeResult.message` is included in `detectedState` for display, but is already present in existing code (`merge-then-archive.ts:505`). No new prompt-injection surface introduced.
- **Auth surface**: No auth changes. GitHub token requirements unchanged.
- **Conflict safety**: DIRTY/CONFLICTING still escalated pre-merge (Step 4). Merge API 409 → permanent failure (D4 conflict bucket). A conflicting PR cannot be merged by this path.

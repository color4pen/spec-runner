# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | All T-01 through T-06 checkboxes marked [x] |
| design.md | ✅ | D1–D5 all faithfully implemented (see detail below) |
| spec.md | ✅ | All 5 requirements and 11 scenarios covered by tests |
| request.md | ✅ | All 8 acceptance criteria satisfied |

## Detail

### tasks.md

All task checkboxes are `[x]`. T-01 through T-06 (including sub-tasks T-05a/b/c) complete.

### design.md — decisions D1–D5

**D1 (BLOCKED deferred)**: The early `mergeStateStatus === "BLOCKED"` escalation block has been removed. Line 333 captures `const isBlocked = mergeStateStatus === "BLOCKED"` and the flag is evaluated only at terminal check decision points:
- `rollup.state === "success"` with `isBlocked` → `blockedAfterChecksEscalation(slug, "success")`
- `rollup.state === "none"` grace-exhausted with `isBlocked` → `blockedAfterChecksEscalation(slug, "no checks")`
- `rollup.state === "failure"` → existing check-failure escalation (unchanged)
- `rollup.state === "pending"` → loop continues waiting (no escalation)

`blockedAfterChecksEscalation` is factored into a shared helper and reused at both break points, avoiding duplication as suggested in T-01.

**D2 (Step 5 gate removed)**: `checkMergeableForMerge` call and import are gone. After the wait loop breaks, `mergePullRequest` is called directly. Module docstring updated to match the new flow. `mergeable === UNKNOWN` no longer blocks the path.

**D3 (checkMergeableForMerge deleted)**: `checkMergeableForMerge`, `MERGEABLE_RETRY_COUNT`, `MERGEABLE_RETRY_DELAY_MS`, and `CheckMergeableResult` removed from `pr-status.ts`. grep in `src/` returns 0 matches. `fetchPrViewWithRetry`, `UNKNOWN_RETRY_COUNT`, `UNKNOWN_RETRY_DELAY_MS`, `sleep`, `PrViewData`, `PrViewFetchResult` are all preserved (out of scope).

**D4 (cause-distinguished escalation)**: `classifyMergeFailure` classifies the lowercased message:
- `"conflict"` substring → `"squash merge (conflict)"` with rebase guidance
- `"required status check"` + `"has failed"` → `"squash merge (required checks failed)"` with fix-checks guidance
- else → generic `"squash merge (REST API)"` escalation
All three include the resume command `specrunner job archive --with-merge <slug>`.

**D5 (conflict fail-closed)**: `DIRTY`/`CONFLICTING` check at lines 318–329 is unchanged. The merge-endpoint 409 path flows through `isMergeTransientFailure` as permanent → `{ merged: false }` → `classifyMergeFailure` returns `"conflict"` → conflict escalation. Conflict is still caught at two layers.

### spec.md — requirements and scenarios

| Requirement / Scenario | Test |
|------------------------|------|
| Transient BLOCKED MUST NOT short-circuit — pending keeps waiting | TC-MTA-BLOCKED-PENDING-THEN-MERGE: poll 1 BLOCKED+pending → sleep (no escalation); poll 2 CLEAN+success → `mergePullRequest` and cleanup run |
| Persistent BLOCKED after `success` → branch-protection escalation | TC-MTA-008 (updated): BLOCKED + success rollup → exitCode 1, `branch protection` in escalation, `getCheckStatus` was called, merge and cleanup not called |
| Persistent BLOCKED after `none` grace exhausted → branch-protection escalation | TC-MTA-BLOCKED-NONE-EXHAUSTED: injected `nowFn` crosses `NONE_CHECK_GRACE_MS`; exitCode 1, branch-protection escalation, merge not called |
| `mergeable UNKNOWN` MUST NOT block path — merge endpoint is authoritative | TC-MTA-UNKNOWN-REACHES-MERGE: `mergeable: "UNKNOWN"` + CLEAN + success → `mergePullRequest` called; exactly 2 `getPullRequest` calls (no extra gate call) |
| No pre-merge mergeable poll after loop breaks | Confirmed by TC-MTA-UNKNOWN-REACHES-MERGE asserting `getPullRequest` called 2× and by import removal |
| 409 conflict → conflict escalation | TC-MTA-MERGE-FAIL-CONFLICT: `"Merge conflict detected"` → `"squash merge (conflict)"`, cleanup not called |
| `required status check ... has failed` → checks-failed escalation | TC-MTA-MERGE-FAIL-CHECKS: `'required status check "ci/build" has failed'` → `"squash merge (required checks failed)"` |
| Other merge failure → generic escalation + resume command | TC-MTA-MERGE-FAIL-OTHER: `"repository rule violations found"` → `"squash merge (REST API)"` + resume command |
| DIRTY → conflict escalation (unchanged) | TC-MTA-006 unchanged and passing |
| CONFLICTING → conflict escalation (unchanged) | TC-MTA-007 unchanged and passing |
| Lower-level merge transient/permanent guarantees preserved | TC-PM-015/016/018/020/021 confirmed present and unmodified in `github-client-pr.test.ts` |

### request.md — acceptance criteria

| Criterion | Status |
|-----------|--------|
| BLOCKED + pending → wait; check success → merge | ✅ TC-MTA-BLOCKED-PENDING-THEN-MERGE |
| BLOCKED + success/none exhausted → branch-protection escalation | ✅ TC-MTA-008, TC-MTA-BLOCKED-NONE-EXHAUSTED |
| `mergeable UNKNOWN` → no escalation, proceeds to `mergePullRequest` | ✅ TC-MTA-UNKNOWN-REACHES-MERGE |
| 405 "not mergeable" / "is expected" transient retry → success | ✅ TC-PM-016, TC-PM-018, TC-PM-021 (unchanged) |
| 409 conflict and 405 "has failed" → permanent `!merged` escalation | ✅ TC-PM-015, TC-PM-020 (unchanged) |
| DIRTY/CONFLICTING detection unchanged | ✅ TC-MTA-006, TC-MTA-007 |
| No dangling `checkMergeableForMerge` references in `src/` | ✅ grep: 0 matches in `src/` |
| `bun test` green, `typecheck` green, `build` success | ✅ verification-result.md: all 4 phases passed (416 files, 5647 tests) |

### Additional observations

- TC-MTA-ARCHIVE-SHA correctly has 3 `getPullRequest` calls (Step 2 + 2 wait-loop iterations); the stale 4th call for `checkMergeableForMerge` was removed as required by T-05a.
- The `checkMergeableForMerge` describe block and its imports are cleanly removed from `pr-status.test.ts`; the `fetchPrViewWithRetry` describe block is unchanged.
- No conformance gaps found.

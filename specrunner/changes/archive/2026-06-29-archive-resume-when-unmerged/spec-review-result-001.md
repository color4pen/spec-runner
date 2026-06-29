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
| 1 | LOW | Naming | `tasks.md` / `src/core/archive/__tests__/orchestrator.test.ts` | T-03 instructs adding a test labeled `T-07: archived job resolves via includeArchived…` to `orchestrator.test.ts`, but `T-07` already exists in that file (`T-07: draft rm EACCES emits a Warning via stderrWrite`). Two tests will share the same label in test output, creating navigation confusion. | Use `T-08` (or the next available number) as the label for the new test case. |

## Review Notes

**Bug diagnosis verified.** Both call sites match the request's claims:

- `orchestrator.ts:112` — `JobStateStore.list(cwd)` without `includeArchived`. Confirmed by source.
- `merge-then-archive.ts:125` — same pattern. Confirmed by source.
- `store.ts:380-381` — `resolveId` already passes `{ includeArchived: true }` as the stated precedent. Confirmed.
- `TERMINAL_STATUSES` at `lifecycle.ts:46` = `Set(["archived", "canceled"])`. Confirmed; orchestrator's terminal short-circuit at line 129 is reachable once the lookup is fixed.
- `markJobArchived` at `job-state-update.ts:83` is idempotent (`noop` path when already archived). Confirmed.

**All three post-fix scenarios trace correctly through the existing code:**

1. *archived + OPEN PR*: Step 1 finds job → Step 2 (getPullRequest) skips MERGED branch → Step 3 `runArchiveOrchestrator` returns `{ exitCode: 0 }` via terminal short-circuit (no `headSha`) → CI-wait loop skips SHA comparison (`archiveSha !== undefined` guard at line 361, already handles `undefined`) → merge flow proceeds.
2. *archived + MERGED PR*: Step 1 finds job → Step 2 MERGED branch (`prData.state === "MERGED" && jobStatus === "archived"`) → `runPostMergeCleanup` → exitCode 0. This path was confirmed as dead code before the fix.
3. *non-`--with-merge`, archived job*: `runArchiveOrchestrator` finds job, TERMINAL_STATUSES check fires, logs "Already finished (archived)", returns exitCode 0.

**Scope is appropriately bounded.** The three intentionally-excluded callers (cancel/inbox/exit-guard) are identified with rationale; changing them would permit re-cancel, re-inbox-pickup, or running-state transitions of finished jobs — correct to leave them unchanged.

**Security:** No concerns. The fix widens the lookup scope within an already-authenticated archive command path. No new user-controlled input is introduced, no privilege boundary is crossed.

**Test strategy is sound.** T-03 (orchestrator idempotent return), T-04 (MERGED+archived cleanup), T-05 (OPEN+archived no "No job found") cover all three acceptance criteria. The T-05 approach of stubbing `runArchiveOrchestrator` to exitCode 1 is a valid boundary probe — the test distinguishes "job found, step 3 stub failed" (exitCode 1, no "No job found") from "job not found" (exitCode 2, "No job found") correctly.

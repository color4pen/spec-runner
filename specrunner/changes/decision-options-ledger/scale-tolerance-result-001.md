# Scale-Tolerance Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
-->

- **verdict**: approved

## Scope

Reviewed the following monotonically-growing targets under this change:

| Target | Growth driver | Reviewed location |
|--------|--------------|-------------------|
| `JobState.decisions[]` | Escalation/resume cycles per job | `src/state/schema.ts`, `src/core/inbox/run-inbox.ts` |
| `isFindingDecided` / `filterUndecidedFindings` | `decisions.length × findings.length` per step | `src/core/decision/decision-ledger.ts` |
| `getOpenDecisionFindings` | `steps[step].length` (latest run access) | `src/core/decision/decision-ledger.ts` |
| Issue comment scan (planResumes) | Comments per issue | `src/core/inbox/planner.ts` |
| Escalation comment rendering | Open decision-needed findings per step | `src/core/notify/issue-notifier.ts` |
| `filterUndecidedFindings` calls per step finalization | Judge/request-review/conformance branch count | `src/core/step/executor.ts` |

## Analysis

**`decisions[]` state size**: Grows by 1 record per human decision made during a job's escalation cycles. A `DecisionRecord` is ~2–5 KB (finding snapshot + resumeComment + metadata). Escalation cycles per job are human-paced and empirically low (1–5). No unbounded accumulation path exists.

**`isFindingDecided` / `filterUndecidedFindings`**: O(F × D) per step finalization where F = findings in the latest step run (≤ ~20) and D = `decisions.length` (≤ ~20 per job). Absolute worst case is O(400) comparisons. No index or map acceleration needed at these scales.

**`getOpenDecisionFindings`**: `runs[runs.length - 1]` is O(1) direct-index access on the per-step array. No full steps-record scan. Clean.

**Issue comment scan**: `matchesEscalationMarker` is called linearly over all comments per issue to find the cutoff. This is pre-existing behavior, unchanged by this change. `getOpenDecisionFindings(job)` is added as an O(1) + O(F×D) call per awaiting job — no regression.

**Escalation comment rendering** (`buildEscalationComment`): Iterates over `findingsWithOptions` — a subset of the latest step run's open decision findings. Bounded by findings per step run. Clean.

**No cross-job or archive-wide scans introduced**: Decision lookup, ledger persistence, and verdict filtering are all scoped to a single `JobState` object. No `JobStateStore.list()` calls added.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Redundant computation | `src/core/step/executor.ts:634–668` | `filterUndecidedFindings(step.name, allFindings, state.decisions)` is called up to three separate times during a single judge-step finalization: once per verdict-derivation branch (request-review / conformance / judge), then again for the finding-refs verification path. Each call recomputes `computeFindingKey` for all findings and performs `decisions.some()` scans. At current scales (F ≤ 20, D ≤ 20) this is negligible, but the duplicate work is unnecessary. | Compute `undecidedFindings` once before the branch and reuse the result in all three call sites. |

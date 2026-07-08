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
| 1 | LOW | Implementation guidance | tasks.md / T-01 | T-01 offers two options for finding the "most recent run" in the scoped path: "last element by index, or sort by `endedAt ?? startedAt` descending". The index-based option is ambiguous when a step has multiple runs that may not be appended in chronological order. The existing fallback path already uses timestamp comparison; the scoped path should do the same for consistency. | Prefer sort-by-timestamp in T-01 text: "find the run with the greatest `endedAt ?? startedAt`" (same algorithm as the legacy scan). The test fixtures use single-run arrays so either approach passes tests, but the implementation spec should not leave the choice open. |

## Review Notes

### Verification against source code

Both bugs and their stated root causes were confirmed by reading the actual files.

**Bug 1**: `deriveEscalationSourceStep` (operations-view.ts:150–167) iterates all steps and all runs with no reference to `state.resumePoint`. Confirmed.

**Bug 2**: `deriveRunStat` (job-stats.ts:153–166) loops over all `commandInvocations` without a `jobId` filter. Confirmed. `runJobStats` resolves the usage file by slug only (no jobId scoping, lines 359–374). Confirmed.

**`resumePoint` write sites verified**: All three `await-resume` transition callsites in pipeline.ts (lines 218, 426, 683) and one in executor.ts (line 412) write `resumePoint`. The escalation callsite (line 426) writes `step: currentStep` at the moment the step's run is recorded as `verdict === "escalation"`. Timeout (executor.ts:412) and iteration-exhaustion (pipeline.ts:683) write `resumePoint` without an escalation verdict on the current step's most recent run. The design's correctness assumption holds.

**`jobId` is required**: `JobState.jobId: string` is validated as required in schema.ts (lines 253, 447–448). `NormalizedJobState` preserves this field. T-03's assumption is correct.

### Spec quality

- All four requirements in spec.md have corresponding test cases in tasks.md.
- The two-path logic in T-01 (resumePoint-present → scoped; absent → fallback) is directly implementable from the task description.
- The filter predicate in T-03 (`inv.jobId !== undefined && inv.jobId !== stateJobId`) correctly encodes the three-way passthrough/include/exclude rule.
- Test coverage spans all edge cases: escalation, timeout, exhaustion, empty step history, legacy (no resumePoint), jobId-matched, jobId-foreign, legacy invocations (no jobId), and mixed invocations.
- No schema changes, no I/O changes, no display format changes — scope matches request.

### Security

No security concerns. Both fixes are scoped to pure in-process aggregation functions operating on data already loaded from trusted local state files. No external inputs, no authentication surfaces, no injection vectors.

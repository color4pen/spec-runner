# Tasks: job-view-accuracy

## T-01: Fix `deriveEscalationSourceStep` to use `resumePoint` as primary gate

**File**: `src/core/job-list/operations-view.ts`

- [ ] Update the JSDoc comment for `deriveEscalationSourceStep` to document the
  new two-path logic: (a) `resumePoint` present → scoped lookup, (b) absent →
  legacy full-history scan
- [ ] Add the `resumePoint`-present branch at the top of the function body:
  - Read `state.resumePoint` (may be undefined/null)
  - If present, resolve `runs = (state.steps ?? {})[resumePoint.step] ?? []`
  - Find the most recent run in `runs` (last element by index, or sort by
    `endedAt ?? startedAt` descending if ordering cannot be assumed)
  - If `mostRecentRun?.outcome.verdict === "escalation"`, return `resumePoint.step`
  - Otherwise return `null`
- [ ] Keep the existing full-history scan as the `else` branch (fallback for legacy
  states without `resumePoint`)
- [ ] The function signature stays unchanged: `(state: JobState): string | null`

**Acceptance Criteria**:
- Given `resumePoint.step = "spec-review"` and that step's last run has
  `verdict === "escalation"`, the function returns `"spec-review"`
- Given `resumePoint.step = "implementer"` (timeout) and `state.steps` contains a
  historical `"spec-review"` escalation run, the function returns `null`
- Given `state` has no `resumePoint`, the function behaves exactly as before
  (returns the step with the greatest escalation timestamp across all steps)

---

## T-02: Add tests for updated `deriveEscalationSourceStep`

**File**: `src/core/job-list/__tests__/operations-view.test.ts`

- [ ] Add TC-031: `resumePoint` present, current step's last run is escalation →
  returns that step name
  - Fixture: `resumePoint = { step: "spec-review", reason: "...", iterationsExhausted: 0 }`
  - `steps["spec-review"] = [makeStepRun({ verdict: "escalation" })]`
  - Expected: `"spec-review"`
- [ ] Add TC-032: `resumePoint` present, current step's last run is NOT escalation
  (e.g. null verdict / timeout), but history contains an old escalation at another
  step → returns `null`
  - Fixture: `resumePoint = { step: "implementer", reason: "timeout", iterationsExhausted: 0 }`
  - `steps["spec-review"] = [makeStepRun({ verdict: "escalation" })]`
  - `steps["implementer"] = [makeStepRun({ verdict: null })]`
  - Expected: `null`
- [ ] Add TC-033: `resumePoint` present, current step has no runs in `steps`
  (empty or missing key) → returns `null`
  - Fixture: `resumePoint = { step: "spec-review", ... }`, `steps = {}`
  - Expected: `null`
- [ ] Add TC-034: `resumePoint` absent (legacy state), escalation run exists in
  history → returns step (existing fallback path regression guard)
  - Fixture: no `resumePoint` field, `steps["spec-review"] = [escalation run]`
  - Expected: `"spec-review"`
- [ ] Verify existing TC-016, TC-017, TC-018 still pass without modification

**Acceptance Criteria**:
- All four new test cases pass
- All pre-existing `deriveEscalationSourceStep` tests (TC-016, TC-017, TC-018,
  TC-004, TC-005) remain green without modification

---

## T-03: Fix `deriveRunStat` to filter invocations by `jobId`

**File**: `src/core/command/job-stats.ts`

- [ ] In the `costUsd` derivation loop (lines ~149–167), add a per-invocation
  filter before processing `inv.modelUsage`:
  ```
  const stateJobId = state.jobId;
  for (const inv of usageFile.commandInvocations) {
    // Exclude invocations that belong to a different job
    if (inv.jobId !== undefined && inv.jobId !== stateJobId) continue;
    // ... existing modelUsage aggregation ...
  }
  ```
- [ ] Ensure `state.jobId` is accessed from the `NormalizedJobState` parameter
  (field `jobId: string` is required in `JobState` schema, so it is always present)
- [ ] Do not change any other part of `deriveRunStat`; no signature changes

**Acceptance Criteria**:
- Given a usage file where two invocations have distinct `jobId`s and the state
  carries `jobId = "job-A"`, `costUsd` reflects only the `"job-A"` invocation cost
- Given a usage file where all invocations have no `jobId`, `costUsd` reflects the
  sum of all invocation costs (legacy passthrough unchanged)
- `deriveRunStat` signature is unchanged

---

## T-04: Add tests for updated `deriveRunStat`

**File**: `src/core/command/__tests__/job-stats.test.ts` (new file)

- [ ] Create the test file. Import `deriveRunStat` and `buildJobStatsReport` from
  `"../../command/job-stats.js"` and supporting types as needed.
- [ ] Add a minimal `makeJobState` fixture helper (or import from a shared helper
  if one exists) that produces a `NormalizedJobState` with `steps: {}` and a given
  `jobId`
- [ ] Add TC-S01: same slug, two jobIds, shared usage file → each job row shows
  only its own cost, summary `costUsdTotal` is the sum of the two distinct costs
  (not doubled)
  - Create two state fixtures with `jobId = "job-A"` and `jobId = "job-B"`, slug
    identical for both
  - Build a `UsageFile` with one invocation for `"job-A"` (cost-producing
    modelUsage) and one for `"job-B"` (cost-producing modelUsage)
  - Call `deriveRunStat(stateA, usageFile)` and `deriveRunStat(stateB, usageFile)`
  - Assert `rowA.costUsd` equals cost of job-A invocation only
  - Assert `rowB.costUsd` equals cost of job-B invocation only
  - Call `buildJobStatsReport([rowA, rowB])` and assert
    `summary.costUsdTotal` equals `rowA.costUsd + rowB.costUsd` (not double)
- [ ] Add TC-S02: usage file with only jobId-absent invocations → cost is summed
  for any job regardless of jobId
  - Build a `UsageFile` with two invocations, both without `jobId`
  - Call `deriveRunStat` for any state
  - Assert `costUsd` equals sum of both invocation costs
- [ ] Add TC-S03: usage file with mixed legacy (no jobId) + new (jobId = "job-A")
  invocations, state has `jobId = "job-A"` → cost includes both
  - Build usage file: one legacy invocation (no `jobId`), one with `jobId = "job-A"`
  - Call `deriveRunStat` for state with `jobId = "job-A"`
  - Assert `costUsd` equals sum of both costs (legacy passthrough + own job)
- [ ] Add TC-S04: usage file with only a foreign `jobId` invocation, state has
  different `jobId` → `costUsd` is `null` (no priced invocations after filter)
  - Build usage file: one invocation with `jobId = "job-B"`
  - Call `deriveRunStat` for state with `jobId = "job-A"`
  - Assert `costUsd` is `null`

**Acceptance Criteria**:
- All four test cases (TC-S01 through TC-S04) pass
- No existing tests are modified
- `typecheck && test` green

---

## T-05: Verify `typecheck && test` clean

- [ ] Run `bun run typecheck` in the repository root — zero errors
- [ ] Run `bun run test` in the repository root — all tests green, no regressions

**Acceptance Criteria**:
- Both commands exit with code 0

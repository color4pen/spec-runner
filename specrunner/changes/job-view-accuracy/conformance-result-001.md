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
| tasks.md | ✅ | All 5 task groups completed; all checkboxes [x] |
| design.md | ✅ | D1 and D2 implemented correctly |
| spec.md | ✅ | All 4 requirements and 6 scenarios covered by tests |
| request.md | ✅ | All 6 acceptance criteria satisfied |

## Detail

### tasks.md — all checkboxes [x]

T-01 through T-05 are fully marked complete. Verified against implementation.

### design.md — D1 and D2

**D1 (`resumePoint` as primary gate)**: `deriveEscalationSourceStep` in
`src/core/job-list/operations-view.ts` first checks `state.resumePoint != null`.
When present, it scopes the escalation verdict check to
`state.steps[state.resumePoint.step]`, finds the most recent run by
`endedAt ?? startedAt`, and returns the step name only if that run's
`verdict === "escalation"`. Otherwise returns `null`. Legacy path (no `resumePoint`)
retains the original full-history scan. Matches D1 exactly.

**D2 (jobId filter with legacy passthrough)**: `deriveRunStat` in
`src/core/command/job-stats.ts` adds
`if (inv.jobId !== undefined && inv.jobId !== stateJobId) continue;`
before processing `modelUsage`. Invocations without `jobId` always pass through.
Matches D2 exactly.

### spec.md — requirements and scenarios

| Requirement | Scenarios | Test(s) |
|-------------|-----------|---------|
| escalation source step reflects only current interruption | escalation-sourced with resumePoint | TC-031 |
| | timeout-sourced with prior escalation in history | TC-032 |
| | iteration-exhaustion with prior escalation in history | TC-003 |
| legacy state falls back to history scan | legacy state without resumePoint shows escalation step | TC-034 |
| job stats cost scoped to current job's invocations | two jobs share usage file, each sees only its own cost | TC-S01 |
| legacy invocations without jobId always included | only jobId-absent invocations | TC-S02 |
| | mixed legacy and new invocations | TC-S03 |

All scenarios map to implemented and named test cases. TC-033 (resumePoint present,
step has no runs → null) adds coverage beyond the spec scenarios.

### request.md — acceptance criteria

1. **escalation 由来では表示され、timeout / iteration exhaustion 由来では表示されない** — TC-031 (escalation), TC-032 (timeout), TC-003 (iteration exhaustion) ✅
2. **resumePoint を持たない legacy state で従来どおり** — TC-034 ✅
3. **同一 slug で jobId が異なる 2 job の fixture で各行が自 jobId のみの cost、summary に二重計上なし** — TC-S01 ✅
4. **jobId 無し invocation のみの fixture で従来どおり計上** — TC-S02 ✅
5. **既存テスト無変更で green** — TC-016/TC-017/TC-018 are unchanged in the test file; they exercise the legacy fallback path (no `resumePoint`) which is structurally identical to the original implementation ✅
6. **typecheck && test green** — T-05 confirms both passed ✅

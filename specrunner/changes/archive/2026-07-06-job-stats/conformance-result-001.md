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
| tasks.md | ✓ | All 6 tasks (T-01 through T-06) marked [x]; verified against implementation |
| design.md | ✓ | All 10 decisions (D1–D10) correctly reflected; see detail below |
| spec.md | ✓ | All 5 Requirements and all Scenarios covered by tests |
| request.md | ✓ | All 5 acceptance criteria green; typecheck clean; full suite (5984 tests) pass |

---

## Detail

### 1. tasks.md — all complete

| Task | Status |
|------|--------|
| T-01 `resolveChangeDir` extraction to `src/core/job-access/resolve-change-dir.ts` | [x] — module exists, `job-show.ts` imports it |
| T-02 pure derivation module (`deriveRunStat`, `buildJobStatsReport`, types) | [x] — `src/core/command/job-stats.ts` |
| T-03 pure renderers (`renderJobStatsTable`, `renderJobStatsJson`) | [x] — implemented in same module |
| T-04 IO orchestrator `runJobStats` | [x] — uses `JobStateStore.list` + `resolveChangeDir` + `readUsageFile` |
| T-05 CLI wiring (`job.subcommands.stats`, USAGE line, README entry) | [x] — all three updated |
| T-06 tests green | [x] — 38/38 unit tests, 5984/5984 full suite pass |

### 2. design.md — decisions implemented

| Decision | Implementation |
|----------|----------------|
| D1 new subcommand, not `usage summary` extension | `command-registry.ts` `job.subcommands.stats` |
| D2 `JobStateStore.list(repoRoot, { includeArchived: true })` | `runJobStats` line 346 |
| D3 duration = min(startedAt)..max(endedAt) | `deriveRunStat` lines 101–124 |
| D4 cost via `readUsageFile` + `computeCostUsd`, priced-only sum | `deriveRunStat` lines 147–167 |
| D5 convergence = review-loop non-skipped; built-in ∪ `reviewers[].name` | `reviewLoopStepNames()` + verdict filter |
| D6 null cells; `-` in table; run not dropped | per-cell null; `renderJobStatsTable` `-` branch |
| D7 JSON top-level frozen `{runs, summary}` | `renderJobStatsJson` serialises typed `JobStatsReport` directly |
| D8 pure module + thin IO layer | pure: `deriveRunStat`/`buildJobStatsReport`/renderers; IO: `runJobStats` |
| D9 date from `state.createdAt` YYYY-MM-DD | `state.createdAt.slice(0, 10)` with `isNaN` guard |
| D10 sort date asc, slug asc; summary excludes null rows | `buildJobStatsReport` sort + filter |

### 3. spec.md — requirements and scenarios

| Requirement | Key Scenarios | Test Coverage |
|-------------|---------------|---------------|
| `job stats` lists active+archive runs, 6 columns, date-asc | archive fixture table; 0 runs | TC-JSTATS-026, TC-JSTATS-019, TC-JSTATS-020 |
| Summary block, correct population | 3 runs / 1 cost-absent | TC-JSTATS-022, TC-JSTATS-017, TC-JSTATS-018 |
| `--json` key sets frozen | top-level, row, summary keys | TC-JSTATS-023, 024, 025 |
| Reuse fold / computeCostUsd / timestamps | convergence formula; cost formula | TC-JSTATS-003, 008 |
| Data absence tolerance | usage.json absent; modelUsage null; events.jsonl absent | TC-JSTATS-027, 028, 029 |

### 4. request.md — acceptance criteria

| Criterion | Result |
|-----------|--------|
| Fixture archive dir table + `--json` tests | TC-JSTATS-026, TC-JSTATS-026b — pass |
| `usage.json` absent → costUsd null, no failure | TC-JSTATS-027 — pass |
| All `modelUsage` null → costUsd null, no failure | TC-JSTATS-028 — pass |
| `events.jsonl` absent → durationSec/convergence null, no failure | TC-JSTATS-029 — pass |
| `--json` top-level keys exactly `["runs", "summary"]` | TC-JSTATS-023 — pass |
| Existing tests unchanged and green | 5984/5984 pass (full suite) |
| `typecheck && test` green | `tsc --noEmit` clean; 5984/5984 pass |

### 5. Observation (non-blocking)

In `runJobStats`, a `usage.json` that exists but has `commandInvocations: []` is treated as absent
(guarded by `read.commandInvocations.length > 0`). This is consistent with D4 — zero priced pairs → `null` cost.
No correctness concern; noted for awareness.

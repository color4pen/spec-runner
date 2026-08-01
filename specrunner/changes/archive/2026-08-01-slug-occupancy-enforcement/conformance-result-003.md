# Conformance Result — slug-occupancy-enforcement — Iteration 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Identity Priming

Role: conformance agent for `slug-occupancy-enforcement` (spec-change).
Scope: read-only review against request.md, design.md, spec.md, tasks.md.
Touch target: this file only.

---

## J-1: Request Coverage (Requirements 1–8)

### R1 — Start guard enforces the slug occupancy invariant

**Evidence**: `src/core/occupancy/guard.ts` introduces `assertSlugUnoccupied`. It calls `scanSlugOccupancy` from the new `src/core/occupancy/scan.ts`. If `result.unreadable !== null` it throws `slugStateUnreadableError` (fail-closed). If `result.nonTerminal.length >= 1` it throws `slugOccupiedError` naming the prior `jobId` and `status` with a status-appropriate hint (`awaiting-archive` → archive/cancel; others → resume/cancel). `LocalRuntime.assertNoDuplicateLiveJob` in `local.ts:913` delegates to `assertSlugUnoccupied`; the call site at `pipeline-run.ts:125` is unchanged (pre-`bootstrapJob`).

**Finding**: PASS. State-based, fail-closed guard is in place before any state/worktree is created.

---

### R2 — Sidecar check-and-claim

**Evidence**: `src/core/occupancy/claim.ts` implements `claimLivenessSidecar`. It reads the existing sidecar's `jobId`, looks up the foreign job's status via `getJobStatus`, and:
- absent / same jobId → writes
- terminal/absent foreign job → writes (stale claim)
- non-terminal foreign job → throws `SLUG_OCCUPIED` (claim refused)

`local.ts:1435` routes `writeLivenessSidecar` through `claimLivenessSidecar`. `workspace-materializer.ts` calls `this.host.writeLivenessSidecar` which now goes through the claim. `SLUG_OCCUPIED` from claim propagates; I/O write errors are swallowed (best-effort per spec).

**Finding**: PASS.

---

### R3 — Cancel tears down sidecar and marker only for its own jobId

**Evidence**: `cancel/runner.ts`:
- Lines 427–437: liveness sidecar deletion reads the sidecar, checks `sidecarObj["jobId"] === state.jobId` before unlinking. Runs on **normal cancel** (not only `--purge`).
- Lines 477–488: managed marker unlink checks `markerObj["jobId"] === state.jobId`.
- Lines 495–556: `--purge` directory removal reads the sidecar, looks up the foreign job's terminal status via `JobStateStore.list`, and skips (with warning) if the sidecar belongs to a different non-terminal job.

**Finding**: PASS. Own-jobId gate applied to sidecar, marker, and `--purge` directory removal.

---

### R4 — State-based slug resolution

**Evidence**: `src/core/resume/resolve-job.ts` rewritten. Uses `JobStateStore.list(repoRoot, { includeArchived: false })`, filters by slug, classifies by `TERMINAL_STATUSES`: 1 non-terminal → return it; 0 → `null`; ≥2 → throw `slugOccupancyAmbiguousError` with candidate enumeration. `updatedAt` appears only in the enumeration payload, not as a selection key. `cli/resume.ts:47` and `cli/reopen.ts:58` now wrap the call in try/catch per D5.

**Finding**: PASS.

---

### R5 — Doctor detection and repair

**Evidence**:
- Detection: `src/core/doctor/checks/storage/slug-occupancy.ts` — `createSlugOccupancyCheck()` factory, category `storage`, `required: false` (`warn`). Reports (a) ≥2 non-terminal → breach, enumerate, no auto-selection; (b) exactly 1 non-terminal + sidecar mismatch → hints `specrunner doctor repair <slug>`. Registered in `checks/index.ts:77` as `createSlugOccupancyCheck()`.
- Repair: `src/core/occupancy/repair.ts` — `repairSlugOccupancySidecar`. Validates slug against `SLUG_REGEX`, runs `scanSlugOccupancy`; ≥2 non-terminal → throws `slugOccupancyAmbiguousError`; 0 non-terminal → no-op; 1 non-terminal + mismatched sidecar → re-points via `claimLivenessSidecar`; already-correct → no-op.
- CLI surface: `command-registry.ts:916–933` intercepts `doctor repair <slug>` before the main doctor runner. Plain `specrunner doctor` remains read-only.

**Finding**: PASS.

---

### R6 — Halt-aware Next guidance

**Evidence**: `src/cli/progress.ts:163–171`: `onPipelineComplete` branches on `p.state.status`:
- `"awaiting-archive"` → prints `Next: specrunner job archive <slug>`
- `"awaiting-resume"` → prints `Next: specrunner job resume <slug>`
- other statuses → no guidance printed

Unconditional archive hint removed.

**Finding**: PASS.

---

### R7 — Inbox rejection propagation

**Evidence**: `src/core/inbox/run-inbox.ts`:
- `startJob` effect (build-effects, lines 378–401): occupancy pre-check via `JobStateStore.list` filtered to non-terminal for the slug; throws `slugOccupiedError` carrying `priorJobId`/`priorStatus` if occupied.
- Caller catch block (lines 220–255): catches `SLUG_OCCUPIED`, checks `commentsByIssue` for an existing marker encoding `priorJobId`; posts once; skips on repeat. Idempotent via `<!-- specrunner:notification kind="slug-occupied" priorJobId="..." version="1" -->`.

**Finding**: PASS.

---

### R8 — Managed runtime symmetry

**Evidence**: `src/core/runtime/managed.ts:601–604`: `assertNoDuplicateLiveJob` delegates to `assertSlugUnoccupied` — no longer a no-op. Managed cancel's marker unlink is jobId-gated (same cancel/runner.ts R3 changes). Because managed has no local pid, the guard defaults `isProcessAlive` to false for a null pid — routing to resume/cancel advice.

**Finding**: PASS.

---

## J-2: Spec Conformance (SHALLs / MUSTs / Scenarios)

| Requirement | Key SHALLs / MUSTs | Scenarios | Status |
|---|---|---|---|
| Start guard | enumerate before creating; fail-closed; classify by status (pid MUST NOT decide) | awaiting-resume blocks; dead-pid blocks; terminal-only allows; unreadable refuses | PASS |
| Rejection message | new code ≠ DUPLICATE_LIVE_JOB; MUST name jobId + status; MUST offer status-appropriate exit; MUST reuse `isProcessAlive` from `safety.ts` | live job message; halted job message | PASS |
| Check-and-claim | SHALL NOT unconditionally overwrite; non-terminal foreign MUST NOT be overwritten | stale claimed; foreign non-terminal not claimed | PASS |
| Cancel jobId-scoped | SHALL delete on normal cancel; other job's records MUST NOT be deleted; `--purge` conditioned on jobId | own sidecar deleted; foreign left intact | PASS |
| State-based resolution | SHALL select by state; `updatedAt` MUST NOT be selection basis; ≥2 non-terminal → throw enumeration | non-terminal over newer terminal; multiple non-terminal stop | PASS |
| Doctor | SHALL report (a) breach ≥2 non-terminal; (b) mismatch; repair MUST refuse when not unique | mismatch detection; repair unique; repair refused non-unique | PASS |
| Next guidance | SHALL branch on `state.status` | halt → resume; archive → archive | PASS |
| Inbox | SHALL post comment naming priorJobId/status/exit; MUST be idempotent for given prior job | commented once; no duplicate | PASS |
| Managed symmetry | SHALL apply state-based guard; jobId-scoped teardown | managed guard rejects; managed cancel own marker | PASS |

All SHALLs and MUSTs implemented. All spec scenarios covered.

---

## J-3: Design Fidelity (D1–D11)

**D1** — Enforcement at pre-`bootstrapJob` preflight: `pipeline-run.ts:125` call site unchanged; guard body replaced. PASS.

**D2** — Single `src/core/occupancy/` module: `scan.ts` shared by guard, claim, resolve, doctor, repair. No per-call-site duplication. PASS.

**D3** — Non-terminal = `!TERMINAL_STATUSES.has(status)` (complement, wider than `ACTIVE_STATUSES`): verified in `scan.ts:202`. `awaiting-archive`, `failed`, `terminated` correctly in the non-terminal set. PASS.

**D4** — Fail-closed slug-scoped enumeration: `scan.ts` returns `unreadable` for parse failures, shape errors, and non-ENOENT I/O; ENOENT treated as absent (free). PASS.

**D5** — Resolution keeps `Promise<JobState | null>` signature; ambiguous branch throws; `cli/resume.ts` and `cli/reopen.ts` wrapped in try/catch; `includeArchived: false` set. PASS.

**D6** — Check-and-claim on write; jobId-scoped release on cancel (normal and `--purge`); genuine I/O write errors remain best-effort. PASS.

**D7** — Doctor read-only; separate `repairSlugOccupancySidecar` core function; CLI surface `specrunner doctor repair <slug>`; slug validated against `SLUG_REGEX`; plain `doctor` stays read-only. PASS.

**D8** — `SLUG_OCCUPIED` and `SLUG_STATE_UNREADABLE` → `ARG_ERROR` (exit 2); `SLUG_OCCUPANCY_AMBIGUOUS` → `GENERAL_ERROR` (exit 1 default). `SlugOccupiedError` subclass carries `priorJobId`/`priorStatus` as typed fields. `duplicate-slug-guard.ts` removed; `DUPLICATE_LIVE_JOB` also removed (implementer exercised the "if fully unused" discretion in D8). PASS.

**D9** — `onPipelineComplete` reads `p.state.status` for `awaiting-archive` / `awaiting-resume` branch. PASS.

**D10** — Inbox pre-check in `startJob` (build-effects); uses `JobStateStore.list` filtered to non-terminal for the slug; dedup via machine-readable marker encoding `priorJobId`. PASS.

**D11** — Managed `assertNoDuplicateLiveJob` delegates to `assertSlugUnoccupied` (no longer no-op); managed cancel's marker teardown is jobId-gated. PASS.

**Open Question: `cancelAllTerminated` collateral** — Design.md explicitly flags this as an out-of-scope follow-up. The implementation added a mitigation (transitions `failed`/`terminated` to `canceled` in state.json before removing the sidecar directory) that reduces the risk of blocking new starts after bulk cleanup, but does not apply the full jobId-gate described for single-job cancel. Consistent with design.md's "flagged for the reviewer rather than silently expanding scope" note.

---

## J-4: Acceptance Criteria Coverage

| Criterion | Test evidence | Status |
|---|---|---|
| シナリオ歯 (end-to-end): halt → refused start (no new state/sidecar) → cancel deletes own sidecar → new start succeeds | `tests/occupancy-e2e.test.ts` TC-051 (5 test cases) | PASS |
| Guard unit tests: awaiting-resume → reject; running+pid-alive → reject; running+pid-dead → reject; terminal-only → allow; unreadable → reject | `tests/unit/core/occupancy/guard.test.ts` TC-011 – TC-022 | PASS |
| Cancel tests: own sidecar → deleted on normal cancel; foreign sidecar → left intact | `tests/unit/core/cancel/sidecar-teardown.test.ts` TC-027 – TC-032 | PASS |
| Resolution tests: 1 non-terminal + N terminal (newer terminal) → non-terminal returned; ≥2 non-terminal → enumeration error | `tests/unit/core/resume/state-based-resolve.test.ts` TC-033 – TC-036 | PASS |
| Doctor tests: mismatch detected; unique repair; multi-non-terminal repair refused | `tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts` TC-037 – TC-039; `tests/unit/core/occupancy/repair.test.ts` TC-040 – TC-044; `tests/unit/cli/doctor-repair.test.ts` | PASS |
| Next guidance tests: awaiting-resume → resume advice; awaiting-archive → archive advice | `tests/unit/cli/progress-halt-guidance.test.ts` TC-045 – TC-047 | PASS |
| Inbox propagation: commented once; no duplicate on repeat | `tests/unit/inbox/occupancy-propagation.test.ts` TC-048 – TC-050 | PASS |
| Existing tests updated (not unrelated): old fail-open tests only | `duplicate-slug-guard.test.ts` deleted (source deleted per D8); `local-duplicate-guard.test.ts` updated to state-based expectations with R1/R2 attribution | PASS |
| `typecheck && test` green | verification-result.md: 670 test files, 9949 tests passed (1 skipped); build, typecheck, test, lint all exit 0 | PASS |

---

## 検証できなかった項目

None — all 13 tasks are checkboxed complete, all 8 requirements verified in code, all spec scenarios traced to tests.

## Findings 詳細

No blocking findings. Three non-blocking observations noted under J-3:

1. **`DUPLICATE_LIVE_JOB` removed**: D8 permits removal when fully unused. The only previous production caller (the guard) is replaced. Correct.
2. **`duplicate-slug-guard.test.ts` deleted**: The corresponding source file was removed; deleting its test file is the correct action. New coverage is in `guard.test.ts` and updated `local-duplicate-guard.test.ts`.
3. **`cancelAllTerminated` open question**: Not fully jobId-gated, consistent with design.md marking it out of scope. Mitigation (state transition to canceled before sidecar removal) is additive and reduces risk.

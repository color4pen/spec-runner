# Conformance Result — slug-occupancy-enforcement — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Identity Priming

Reviewer role: conformance agent. Scope is read-only review against 4 artifacts:
request.md (acceptance criteria), design.md (D1–D11), tasks.md (T-01–T-13), spec.md (Requirements/Scenarios).

---

## 検証した項目

### Tasks Completeness (tasks.md)

All 13 tasks (T-01 through T-13) carry `[x]` checkboxes.

| Task | Description | Evidence |
|------|-------------|----------|
| T-01 | `scanSlugOccupancy` core module | `src/core/occupancy/scan.ts`: enumerates main checkout, worktrees, managed local; dedup by jobId; fail-closed on parse error; ENOENT treated as absent |
| T-02 | Error codes and factories | `SLUG_OCCUPIED`, `SLUG_STATE_UNREADABLE`, `SLUG_OCCUPANCY_AMBIGUOUS` in `src/errors.ts`; EXIT_CODE_MAP rows for SLUG_OCCUPIED → ARG_ERROR, SLUG_STATE_UNREADABLE → ARG_ERROR; SLUG_OCCUPANCY_AMBIGUOUS omitted (defaults GENERAL_ERROR); SlugOccupiedError with `priorJobId`/`priorStatus` fields |
| T-03 | Occupancy start guard | `src/core/occupancy/guard.ts` `assertSlugUnoccupied`; both `local.ts` and `managed.ts` delegate `assertNoDuplicateLiveJob` to it; `duplicate-slug-guard.ts` deleted |
| T-04 | Check-and-claim sidecar | `src/core/occupancy/claim.ts` `claimLivenessSidecar`; `local.ts:writeLivenessSidecar` routes through claim; `workspace-materializer.ts` all write-sites use `host.writeLivenessSidecar` |
| T-05 | Cancel jobId-scoped teardown | `runner.ts`: liveness sidecar deletion on normal cancel gated on `sidecarObj.jobId === state.jobId`; managed marker unlink gated similarly; `--purge` checks foreign non-terminal sidecar and skips with warning |
| T-06 | State-based slug resolution | `resolve-job.ts` rewritten with `!TERMINAL_STATUSES.has(s.status)`; 1→return, 0→null, ≥2→throw; `cli/resume.ts` and `cli/reopen.ts` wrap in try/catch |
| T-07 | Doctor occupancy check | `src/core/doctor/checks/storage/slug-occupancy.ts` `createSlugOccupancyCheck`; storage category, `required: false`; detects breach (≥2 non-terminal) and mismatch (sidecar→terminal + 1 non-terminal); registered in `checks/index.ts` |
| T-08 | Mechanical sidecar repair | `src/core/occupancy/repair.ts` `repairSlugOccupancySidecar`; slug validated against `SLUG_REGEX`; `specrunner doctor repair <slug>` wired in `command-registry.ts` |
| T-09 | Halt-aware Next guidance | `src/cli/progress.ts` `onPipelineComplete` branches on `p.state.status`: awaiting-archive → archive hint; awaiting-resume → resume hint; else → no hint |
| T-10 | Inbox occupancy-rejection propagation | `run-inbox.ts` `defaultEffects.startJob` pre-checks `JobStateStore.list` for non-terminal occupant; throws `SlugOccupiedError`; catch block posts deduped comment via occupancy marker encoding `priorJobId` |
| T-11 | E2E occupancy scenario | `tests/occupancy-e2e.test.ts` TC-051: halt → refused start (no new state/sidecar) → cancel deletes own sidecar → subsequent start succeeds |
| T-12 | Divergence entry resolved | `architecture/divergence-status.md` burn-down table updated: names `assertSlugUnoccupied`, `resolveJobStateBySlug`, cancel jobId-bound teardown, managed guard activation |
| T-13 | Full verification | `verification-result.md`: build/typecheck/test/lint all passed; 669 test files, 9952 tests passed |

---

### Design Decisions (design.md D1–D11)

| Decision | Conformant? | Evidence |
|----------|-------------|----------|
| D1 — Guard in pre-`bootstrapJob` preflight slot | ✓ | `local.ts` and `managed.ts` `assertNoDuplicateLiveJob` delegate to `assertSlugUnoccupied`; call site at `pipeline-run.ts:125` unchanged |
| D2 — `src/core/occupancy/` owns invariant mechanics | ✓ | `scan.ts`, `guard.ts`, `claim.ts`, `repair.ts` all in `src/core/occupancy/` |
| D3 — Non-terminal = `!TERMINAL_STATUSES.has(status)` | ✓ | `scan.ts:202` and `resolve-job.ts:31` both use `TERMINAL_STATUSES` |
| D4 — Fail-closed; ENOENT is free | ✓ | `tryReadStateJson` returns `unreadable` on parse/IO failure; ENOENT returns `{ entry: null, unreadable: null }` |
| D5 — `resolveJobStateBySlug` return type unchanged | ✓ | `Promise<JobState \| null>` preserved; only ≥2 non-terminal case throws |
| D6 — Check-and-claim on write; jobId-scoped release | ✓ | `claim.ts` implements check-and-claim; cancel runner checks `sidecarObj.jobId` before delete |
| D7 — Doctor read-only; separate repair; `doctor repair <slug>` | ✓ | Doctor check has no mutations; `repair.ts` is separate; `command-registry.ts` handles `doctor repair <slug>` |
| D8 — New error codes; `checkDuplicateLiveJob` removed | ✓ | Three new codes; EXIT_CODE_MAP entries correct; `duplicate-slug-guard.ts` deleted |
| D9 — `onPipelineComplete` reads `state.status` | ✓ | `progress.ts:163-172` branches on `p.state.status` |
| D10 — Inbox pre-check in `startJob`; dedup via marker | ✓ | `defaultEffects.startJob` pre-checks before `runRunCore`; marker includes `priorJobId`; `commentsByIssue` consulted |
| D11 — Managed `assertNoDuplicateLiveJob` no longer a no-op | ✓ | `managed.ts:601-604` delegates to `assertSlugUnoccupied` |

---

### Spec Requirements and Scenarios

**Requirement: start guard enforces the slug occupancy invariant**
- `assertSlugUnoccupied` classifies by status only; pid not used for occupancy, only for message routing
- Fail-closed path: `unreadable !== null` → `slugStateUnreadableError`; occupancy path: `nonTerminal.length >= 1` → `slugOccupiedError`
- TC-011 (awaiting-resume blocks) ✓ TC-012 (dead pid still blocks) ✓ TC-013 (terminal-only allows) ✓ TC-014 (unreadable refuses) ✓

**Requirement: guard rejection names the prior job and routes to an exit**
- `SlugOccupiedError` carries `priorJobId`/`priorStatus` as typed fields
- `running` + live pid → "Wait or cancel" (direct construction in `guard.ts:59-66`)
- `awaiting-archive` → "archive or cancel" (factory branch)
- All other non-terminal → "resume or cancel" (factory default)
- `isProcessAlive` from `src/core/resume/safety.ts` reused via injection in both runtimes
- TC-015 (live prior message) ✓ TC-016 (halted prior message) ✓

**Requirement: liveness sidecar write is check-and-claim**
- `claimLivenessSidecar`: reads existing; looks up foreign job status; refuses non-terminal foreign; allows absent/terminal/same-jobId
- `local.ts:writeLivenessSidecar` routes through `claimLivenessSidecar`; I/O write failures swallowed (best-effort); claim refusal propagates
- `workspace-materializer.ts` all four write sites use `host.writeLivenessSidecar` (claim-gated)
- TC-023 (stale claimed) ✓ TC-024 (foreign non-terminal refused) ✓

**Requirement: cancel tears down sidecar and marker only for its own jobId**
- Liveness sidecar: `runner.ts:431` gates on `sidecarObj["jobId"] === state.jobId` on normal cancel
- Managed marker: `runner.ts:482` gates on `markerObj["jobId"] === state.jobId`
- `--purge`: foreign sidecar's job status checked; skips directory removal with warning if non-terminal foreign
- Additional: managed `state.json` overwritten with canceled state before marker unlink (scan location 3 sees terminal)
- TC-027 (own sidecar deleted on normal cancel) ✓ TC-028 (foreign left intact) ✓ TC-029 (managed marker jobId-gated) ✓

**Requirement: change-scoped slug resolution is state-based**
- `resolve-job.ts`: `includeArchived: false`; `TERMINAL_STATUSES` filter; 1→return, 0→null, ≥2→throw `slugOccupancyAmbiguousError`
- `cli/resume.ts:48-52` and `cli/reopen.ts:59-63` wrap in try/catch, surface message, return 1
- TC-033 (non-terminal chosen over newer terminal) ✓ TC-034 (multiple non-terminal → enumeration) ✓

**Requirement: doctor detects occupancy breaches and offers mechanical sidecar repair**
- `createSlugOccupancyCheck`: storage, `required: false`; breach and mismatch reported separately; hints to `specrunner doctor repair <slug>`
- `repairSlugOccupancySidecar`: slug SLUG_REGEX validated; ≥2 → throw ambiguous; 0 → no-op; 1 + mismatch → re-point via `claimSidecar`; 1 + correct → no-op
- TC-037 (mismatch detection) ✓ TC-040 (repair re-points unique) ✓ TC-041 (repair refuses when not unique) ✓

**Requirement: pipeline-complete Next guidance branches on the final state**
- `progress.ts:166-171` branches: `awaiting-archive` → archive hint; `awaiting-resume` → resume hint; else → no output
- TC-045 (halt → resume hint) ✓ TC-046 (normal → archive hint) ✓

**Requirement: inbox propagates an occupancy rejection to the issue, idempotently**
- `defaultEffects.startJob` pre-checks `JobStateStore.list` for non-terminal occupant; throws `slugOccupiedError`
- Catch block checks `commentsByIssue` for existing occupancy marker before posting; marker encodes `priorJobId`
- `commentsByIssue` populated from GitHub before the starts loop executes
- TC-048 (commented once) ✓ TC-049 (no duplicate) ✓

**Requirement: guard and jobId-scoped teardown apply to managed runtime**
- `managed.ts:601-604` delegates to `assertSlugUnoccupied` with `isAlive` injected; managed jobs have null pid so guidance defaults to resume/cancel
- `scan.ts` location 3 reads `.specrunner/local/<slug>/state.json` for managed state
- TC-021 (managed guard rejects) ✓ TC-029/TC-032 (managed cancel jobId-gated) ✓

---

### Request Acceptance Criteria

| Criterion | Evidence |
|-----------|----------|
| シナリオ歯 (end-to-end) | `tests/occupancy-e2e.test.ts` TC-051: halt → refused start (no new state/sidecar) → cancel deletes sidecar → start succeeds ✓ |
| guard の単体テスト | `guard.test.ts` TC-011–TC-022: awaiting-resume/running+alive/running+dead → reject; terminal-only → allow; unreadable → reject; managed guard ✓ |
| cancel のテスト | `sidecar-teardown.test.ts` TC-027–TC-032: own jobId → deleted on normal cancel; foreign → left intact; `--purge` gated ✓ |
| 解決のテスト | `state-based-resolve.test.ts` TC-033–TC-036: non-terminal chosen over newer terminal; ≥2 → enumeration error ✓ |
| doctor のテスト | `slug-occupancy.test.ts` TC-037–TC-039 (detection); `repair.test.ts` TC-040–TC-044 (repair) ✓ |
| Next 案内のテスト | `progress-halt-guidance.test.ts` TC-045–TC-047 ✓ |
| 既存テストは無変更で green | 9952 tests passed; `duplicate-slug-guard.test.ts` and `local-duplicate-guard.test.ts` expectations updated only for old fail-open behavior (per R1/R2) ✓ |
| `typecheck && test` が green | `verification-result.md`: all phases passed ✓ |

---

## 検証できなかった項目

None. All acceptance criteria, design decisions, task items, and spec requirements are verified against implementation.

---

## Findings 詳細

**Open Question (informational, not a finding)**: `cancelAllTerminated` at `runner.ts:644` removes `.specrunner/local/<slug>/` unconditionally for bulk-cleanup jobs. Design.md explicitly flags this as "a candidate follow-up — flagged for the reviewer rather than silently expanding scope" (not in requirements R1–R8). No action required for this change.

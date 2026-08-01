# Test Cases: slug-occupancy-enforcement

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 54 cases
- **Automated** (unit/integration): 54
- **Manual**: 0
- **Priority**: must: 41, should: 13, could: 0

---

## Category 1: Occupancy Scan Core (T-01)

### TC-001: single non-terminal + N terminal → nonTerminal.length === 1

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** slug S has one `awaiting-resume` job A and two `archived` jobs B, C in the candidate state locations
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called with injected deps
**THEN** `result.nonTerminal.length === 1` and it contains A; `result.terminal.length === 2`; `result.unreadable === null`

---

### TC-002: terminal-only history → nonTerminal empty

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** slug S has one `canceled` job and one `archived` job, no non-terminal jobs
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** `result.nonTerminal.length === 0`; `result.terminal.length === 2`; `result.unreadable === null`

---

### TC-003: two non-terminal jobs → nonTerminal.length === 2

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** slug S has one `running` job A and one `awaiting-resume` job B
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** `result.nonTerminal.length === 2`; both A and B are enumerated with their jobId, status, updatedAt

---

### TC-004: present-but-corrupted state → unreadable !== null

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** slug S has a state file that exists but cannot be parsed (JSON corruption or `JOURNAL_CORRUPTED`)
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** `result.unreadable !== null` and contains a reason describing the parse failure; `nonTerminal` and `terminal` are empty

---

### TC-005: absent slug → all arrays empty, unreadable null

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** slug S has no state files at any candidate location (ENOENT for all)
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** `result.nonTerminal.length === 0`; `result.terminal.length === 0`; `result.unreadable === null`

---

### TC-006: dedup by jobId — same jobId in multiple locations, newest updatedAt kept

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** slug S has state for the same jobId A in two candidate locations (e.g., main checkout and a worktree), with different `updatedAt` values
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** jobId A appears exactly once in the result; the entry with the newer `updatedAt` is retained

---

### TC-007: non-terminal set includes awaiting-archive, failed, terminated

**Category**: unit
**Priority**: must
**Source**: design.md > D3

**GIVEN** slug S has one `awaiting-archive` job A, one `failed` job B, and one `terminated` job C (no running/awaiting-resume)
**WHEN** `scanSlugOccupancy(repoRoot, "S")` is called
**THEN** all three are classified as non-terminal (`result.nonTerminal.length === 3`); none appear in `result.terminal`

---

## Category 2: Error Codes & Factories (T-02)

### TC-008: SLUG_OCCUPIED factory — structured fields and exit code

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `slugOccupiedError("S", { jobId: "abc-1234", status: "awaiting-resume", ... })` is called
**WHEN** the resulting error is inspected
**THEN** `error.code === ERROR_CODES.SLUG_OCCUPIED`; the exit code maps to `ARG_ERROR` (exit 2); the error exposes `priorJobId === "abc-1234"` and `priorStatus === "awaiting-resume"` as structured fields; the message string contains both "abc-1234" and "awaiting-resume"

---

### TC-009: SLUG_STATE_UNREADABLE factory — includes reason and ARG_ERROR exit

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `slugStateUnreadableError("S", "journal corrupted")` is called
**WHEN** the resulting error is inspected
**THEN** `error.code === ERROR_CODES.SLUG_STATE_UNREADABLE`; exit code maps to `ARG_ERROR` (exit 2); the message includes "journal corrupted"

---

### TC-010: SLUG_OCCUPANCY_AMBIGUOUS factory — enumerates candidates and points to doctor

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `slugOccupancyAmbiguousError("S", [{ jobId: "A", status: "running", updatedAt: t1 }, { jobId: "B", status: "awaiting-resume", updatedAt: t2 }])` is called
**WHEN** the resulting error is inspected
**THEN** `error.code === ERROR_CODES.SLUG_OCCUPANCY_AMBIGUOUS`; message names both jobIds and statuses; message references `specrunner doctor`; exit code maps to `GENERAL_ERROR` (exit 1)

---

## Category 3: Start Guard — Local Runtime (T-03)

### TC-011: awaiting-resume prior job blocks a new start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: start guard enforces the slug occupancy invariant > Scenario: non-terminal prior job (awaiting-resume / halt) blocks a new start

---

### TC-012: running prior job with a dead pid still blocks a new start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: start guard enforces the slug occupancy invariant > Scenario: running prior job with a dead pid still blocks a new start

---

### TC-013: terminal-only history allows a new start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: start guard enforces the slug occupancy invariant > Scenario: terminal-only history allows a new start

---

### TC-014: unreadable slug state refuses the start (fail-closed)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: start guard enforces the slug occupancy invariant > Scenario: unreadable slug state refuses the start (fail-closed)

---

### TC-015: rejection message content for a live running prior job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guard rejection names the prior job and routes to an exit > Scenario: rejection message content for a live prior job

---

### TC-016: rejection message content for a halted (awaiting-resume) prior job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guard rejection names the prior job and routes to an exit > Scenario: rejection message content for a halted prior job

---

### TC-017: awaiting-archive prior job blocks start and advises archive/cancel

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** slug S has a prior job A with status `awaiting-archive`
**WHEN** `assertSlugUnoccupied(repoRoot, "S")` is called
**THEN** it throws `SLUG_OCCUPIED`; the message names A's jobId and "awaiting-archive"; the message advises `specrunner job archive S` or `specrunner job cancel <A.jobId>`

---

### TC-018: failed prior job blocks start and advises resume/cancel

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** slug S has a prior job A with status `failed`
**WHEN** `assertSlugUnoccupied(repoRoot, "S")` is called
**THEN** it throws `SLUG_OCCUPIED`; message names A's jobId and "failed"; message advises resume or cancel

---

### TC-019: terminated prior job blocks start and advises resume/cancel

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** slug S has a prior job A with status `terminated`
**WHEN** `assertSlugUnoccupied(repoRoot, "S")` is called
**THEN** it throws `SLUG_OCCUPIED`; message names A's jobId and "terminated"; message advises resume or cancel

---

### TC-020: guard rejection creates no job state, worktree, or liveness sidecar

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** slug S has a non-terminal prior job A
**WHEN** the pipeline-run pre-`bootstrapJob` preflight (`pipeline-run.ts:125`) runs and the occupancy guard throws
**THEN** `bootstrapJob` is not called; no new state file, worktree, branch, or liveness sidecar is created for the rejected run

---

## Category 4: Start Guard — Managed Runtime (T-03, R8)

### TC-021: managed start guard rejects an occupied slug

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the guard and jobId-scoped teardown apply to the managed runtime > Scenario: managed start guard rejects an occupied slug

---

### TC-022: managed start guard allows a terminal-only slug

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** the runtime is managed and slug S has only terminal managed jobs (archived/canceled state in `marker.json` + co-located state)
**WHEN** a managed run is invoked for slug S
**THEN** `assertNoDuplicateLiveJob` (managed path) does not throw; the run proceeds normally

---

## Category 5: Sidecar Check-and-Claim (T-04)

### TC-023: stale (terminal) sidecar is claimed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: liveness sidecar write is a check-and-claim owned by non-terminal jobs > Scenario: stale sidecar is claimed

---

### TC-024: foreign non-terminal sidecar is not claimed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: liveness sidecar write is a check-and-claim owned by non-terminal jobs > Scenario: foreign non-terminal sidecar is not claimed

---

### TC-025: absent sidecar is claimed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `.specrunner/local/S/liveness.json` does not exist (ENOENT)
**WHEN** job A calls `claimLivenessSidecar(repoRoot, "S", recordA)` (where recordA carries A's jobId)
**THEN** the sidecar is written successfully pointing to A; no error is thrown

---

### TC-026: same jobId sidecar is refreshed (re-established)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `.specrunner/local/S/liveness.json` already points to job A (same jobId as the claimant)
**WHEN** job A calls `claimLivenessSidecar(repoRoot, "S", recordA)` again
**THEN** the sidecar is overwritten with updated values without error (refresh/re-establish succeeds)

---

## Category 6: Cancel Teardown (T-05)

### TC-027: normal cancel deletes its own sidecar

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel tears down sidecar and marker only for its own jobId > Scenario: normal cancel deletes its own sidecar

---

### TC-028: cancel leaves a foreign sidecar intact

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel tears down sidecar and marker only for its own jobId > Scenario: cancel leaves a foreign sidecar intact

---

### TC-029: managed cancel deletes only its own marker

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the guard and jobId-scoped teardown apply to the managed runtime > Scenario: managed cancel deletes only its own marker

---

### TC-030: --purge removes the slug directory when sidecar/marker matches jobId

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `.specrunner/local/S/liveness.json` records `jobId` = A and job A is canceled with `--purge`
**WHEN** `specrunner job cancel A --purge` runs
**THEN** the `.specrunner/local/S/` directory is removed entirely

---

### TC-031: --purge skips directory removal when sidecar belongs to a foreign non-terminal job

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `.specrunner/local/S/liveness.json` records `jobId` = B (a non-terminal job B ≠ A), and job A (same slug) is canceled with `--purge`
**WHEN** `specrunner job cancel A --purge` runs
**THEN** the `.specrunner/local/S/` directory is NOT removed; a warning is emitted indicating the directory belongs to a different non-terminal job

---

### TC-032: managed marker is not unlinked when jobId does not match

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `marker.json` for slug S records `jobId` = B; job A (same slug, B ≠ A) is being canceled normally (without `--purge`)
**WHEN** `specrunner job cancel A` runs
**THEN** `marker.json` is left intact (not deleted), as its jobId does not match A

---

## Category 7: Slug Resolution (T-06)

### TC-033: non-terminal job is chosen over a newer terminal job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: change-scoped slug resolution is state-based, not time-based > Scenario: non-terminal is chosen over a newer terminal job

---

### TC-034: multiple non-terminal jobs stop with candidate enumeration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: change-scoped slug resolution is state-based, not time-based > Scenario: multiple non-terminal jobs stop with a candidate enumeration

---

### TC-035: zero non-terminal jobs → null returned

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** slug S has only terminal jobs (`canceled`, `archived`); `includeArchived: false` is set
**WHEN** `resolveJobStateBySlug("S", store)` is called
**THEN** the function returns `null` (no error is thrown)

---

### TC-036: CLI callers handle the ambiguous-breach throw gracefully

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `cli/resume.ts` and `cli/reopen.ts` call `resolveJobStateBySlug` for a slug S that has two non-terminal jobs
**WHEN** the resolver throws `SLUG_OCCUPANCY_AMBIGUOUS`
**THEN** both CLI entry points catch the error, surface its message to stderr, and exit with a non-zero exit code (no unhandled exception / unhandled promise rejection)

---

## Category 8: Doctor Detection (T-07)

### TC-037: mismatch detected — sidecar points to canceled job, unique non-terminal job exists

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor detects occupancy breaches and offers a mechanical sidecar repair > Scenario: mismatch detection with a unique non-terminal job

---

### TC-038: two non-terminal jobs → breach enumerated, no auto-selection

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** slug S has two non-terminal jobs A and B (injected via the scan override)
**WHEN** the doctor occupancy check runs
**THEN** a breach is reported enumerating A and B by jobId/status/updatedAt; no automatic selection or repair action is performed; the report points the user to `specrunner doctor repair` for manual resolution

---

### TC-039: clean repo → check passes with no findings

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** all slugs have at most one non-terminal job and no sidecar/state mismatch
**WHEN** the doctor occupancy check runs
**THEN** the check reports no findings and returns a passing result

---

## Category 9: Doctor Repair (T-08)

### TC-040: sidecar re-pointed when unique non-terminal job exists

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor detects occupancy breaches and offers a mechanical sidecar repair > Scenario: mechanical repair re-points the sidecar when unique

---

### TC-041: repair refused when non-terminal job is not unique

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor detects occupancy breaches and offers a mechanical sidecar repair > Scenario: repair refuses when the non-terminal job is not unique

---

### TC-042: zero non-terminal jobs → no-op with clear message

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** slug S has no non-terminal jobs (all terminal or no state)
**WHEN** `repairSlugOccupancySidecar(repoRoot, "S")` is called
**THEN** no sidecar is written or modified; the function returns a clear no-op message explaining there is nothing to repair

---

### TC-043: already-correct sidecar → no-op with clear message

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** slug S has exactly one non-terminal job A and the liveness sidecar already points to A's jobId
**WHEN** `repairSlugOccupancySidecar(repoRoot, "S")` is called
**THEN** no changes are made to the sidecar; the function returns a clear no-op message indicating the sidecar is already correct

---

### TC-044: invalid slug argument rejected before repair logic runs

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** the user runs `specrunner doctor repair "not a valid slug!!"` (argument fails `SLUG_REGEX` validation)
**WHEN** the CLI parses the argument
**THEN** the argument is rejected with a descriptive validation error before `repairSlugOccupancySidecar` is invoked

---

## Category 10: Next Guidance (T-09)

### TC-045: halt (awaiting-resume) completion advises resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline-complete Next guidance branches on the final state > Scenario: halt completion advises resume

---

### TC-046: normal (awaiting-archive) completion advises archive

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline-complete Next guidance branches on the final state > Scenario: normal completion advises archive

---

### TC-047: other terminal status → no Next guidance printed

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** a pipeline completes with a status that is neither `awaiting-archive` nor `awaiting-resume` (e.g., `canceled` or `failed`)
**WHEN** `pipeline:complete` fires with that payload
**THEN** no "Next:" guidance line is printed; the else branch is a no-op (the unconditional archive hint no longer appears)

---

## Category 11: Inbox Propagation (T-10)

### TC-048: occupancy rejection is commented once on the issue

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: inbox propagates an occupancy rejection to the issue, idempotently > Scenario: occupancy rejection is commented once

---

### TC-049: repeated inbox polling does not post a duplicate comment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: inbox propagates an occupancy rejection to the issue, idempotently > Scenario: repeated polling does not repeat the comment

---

### TC-050: reject comment body names prior jobId, status, and recommended exit

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10

**GIVEN** slug S is occupied by non-terminal prior job A with jobId "abc-1234" and status "awaiting-resume"
**WHEN** the inbox start path posts the reject comment via `postRejectComment`
**THEN** the comment body contains "abc-1234", "awaiting-resume", and a recommended exit instruction (e.g., `specrunner job resume S` or `specrunner job cancel abc-1234`)

---

## Category 12: End-to-End Occupancy Scenario (T-11)

### TC-051: full loop — halt → refused start → cancel → successful start

**Category**: integration
**Priority**: must
**Source**: request.md > 受け入れ基準 > シナリオ歯（占有不変条件の end-to-end）; tasks.md > T-11

**GIVEN** a job for slug S has reached status `awaiting-resume` (halt) with its liveness sidecar written
**WHEN** `specrunner run` / `specrunner job start` is invoked for slug S
**THEN** the run is refused with the new occupancy error code (`SLUG_OCCUPIED`); no new state file, worktree, branch, or liveness sidecar is created
**WHEN** the prior halted job is canceled via `specrunner job cancel <priorJobId>` (normal cancel)
**THEN** the prior job's own-jobId sidecar is deleted (not left behind)
**WHEN** `specrunner run` / `specrunner job start` is invoked again for slug S
**THEN** the new start succeeds (the occupancy guard finds no non-terminal prior job and allows `bootstrapJob` to proceed)

---

## Category 13: Regression / Existing Tests (T-13)

### TC-052: old "dead pid → allow" test expectations updated to fail-closed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-13

**GIVEN** `tests/unit/core/runtime/duplicate-slug-guard.test.ts` and `tests/unit/core/runtime/local-duplicate-guard.test.ts` previously asserted that a dead pid causes the guard to allow a start
**WHEN** those test expectations are updated
**THEN** the updated expectations assert dead-pid → reject (with `SLUG_OCCUPIED` or occupancy error); the change reason cites R1/R2; no other existing test expectations are modified

---

### TC-053: old "corruption → allow" test expectations updated to fail-closed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-13

**GIVEN** tests that previously asserted a corrupted sidecar or state causes the guard to allow a start (fail-open)
**WHEN** those test expectations are updated
**THEN** the updated expectations assert corrupted state → reject with `SLUG_STATE_UNREADABLE`; the change reason cites R1/R2; no other existing test expectations are modified

---

### TC-054: full test suite passes without unrelated expectation changes

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-13

**GIVEN** the implementation of T-01 through T-12 is complete
**WHEN** `bun run typecheck && bun run test` runs
**THEN** both commands exit 0; no test expectations outside the two duplicate-slug-guard files were modified

---

## Result

```yaml
result: completed
total: 54
automated: 54
manual: 0
must: 41
should: 13
could: 0
blocked_reasons: []
```

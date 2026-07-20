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
| tasks.md | ✅ | All 6 tasks complete ([x]); every AC explicitly tested. |
| design.md | ✅ | D1–D5 all implemented as specified; no drift. |
| spec.md | ✅ | All SHALL/MUST clauses and Scenarios satisfied. |
| request.md | ✅ | All 6 acceptance criteria (T1–T6) satisfied; typecheck && test green (7470 tests). |

## Judgment Item 1 — Acceptance Criteria Coverage

All 6 ACs are covered by named test cases, verified against the implementation:

**T1 (dry-run enumeration):**
- `TC-004` in `sidecar-runner.test.ts`: dry-run lists orphan sidecars in `info` lines and asserts `fs.rm` is never called. Active sidecars do not appear (scan excludes them). ✅

**T2 (--force selective deletion + 破壊確認):**
- `TC-006`: `--force` calls `fs.rm` exactly for orphan `sidecarPath`(s), not for active ones.
- `TC-007` (破壊確認): a malicious `scan` override that returns an active sidecar causes `fs.rm` to be called for it — proving the guard is load-bearing. The contrast sub-test confirms that a correct scan yields no `rm` call for the active sidecar.
- `TC-003` in `orphan.test.ts`: `isOrphanSidecar` returns `false` for all five `ACTIVE_STATUSES` entries. ✅

**T3 (hint replacement):**
- `TC-009` in `orphan-sidecars-check.test.ts`: hint contains `specrunner job prune`, does NOT contain `rm -rf`, and does NOT contain the sidecar path. The actual hint text is `Remove orphan sidecars with:\n  specrunner job prune --force`. ✅

**T4 (rounding):**
- `TC-010`: `detailsHuman` has exactly `SIDECAR_DETAILS_HUMAN_LIMIT + 1` entries (N paths + `…and K more`) when orphan count exceeds limit.
- `TC-011`: `details` contains every orphan path regardless of count.
- `TC-019` in `formatter-detailshuman.test.ts`: `formatHuman` renders `detailsHuman`; `formatJson` emits full `details` and never emits a `detailsHuman` key. ✅

**T5 (shared predicate):**
- `TC-001` and `TC-017` confirm `scanOrphanSidecars` from `src/core/sidecar/orphan.ts` is imported and used by both the doctor check (`createOrphanSidecarsCheck`) and the prune runner (`pruneOrphanSidecars`). Neither consumer defines its own orphan predicate. ✅

**T6 (typecheck && test green):**
- `verification-result.md`: build ✅, typecheck ✅, test (544 files / 7470 tests passing) ✅, lint ✅, changed-line-coverage ✅. Existing `pruneOrphanWorktrees` tests and unrelated doctor tests unmodified. ✅

## Judgment Item 2 — Design Decision Conformance (D1–D5)

**D1 (shared detection module):**
`src/core/sidecar/orphan.ts` exports `ACTIVE_STATUSES`, `isOrphanSidecar`, `scanOrphanSidecars`, `OrphanSidecar`, `SidecarScanFs`, `ScanSidecarDeps`, `ScanSidecarsFn` — exact analogue of `src/core/worktree/orphan.ts`. `SidecarScanFs` is a read-only structural subset of `DoctorFs` (no `rm`, no `access`, no `constants`), so `ctx.fs` is assignable without casting. Confirmed by `TC-017` asserting `callArg.fs === ctx.fs`. ✅

**D2 (job prune composes two runners; worktree logic untouched):**
`src/core/prune/sidecar-runner.ts` exports `pruneOrphanSidecars` mirroring the `PruneResult` contract from `runner.ts`. `runPrune` in `src/cli/prune.ts` calls both runners sequentially, prints them under explicit labeled sections ("Orphan worktrees:" / "Orphan sidecars:"), and combines exit codes with `||`. `src/core/prune/runner.ts` is unmodified (Non-Goal honored). Confirmed by `TC-005`, `TC-013`, `TC-022`. ✅

**D3 (doctor hint points to job prune):**
`orphan-sidecars.ts` sets `hint: "Remove orphan sidecars with:\n  specrunner job prune --force"`. Paths are fully absent from the hint; they live only in `details` and `detailsHuman`. ✅

**D4 (detailsHuman for human rounding; formatJson unchanged):**
`DoctorResult` gains optional `detailsHuman?: string[]`. `formatHuman` renders `r.detailsHuman ?? r.details` (backward-compatible for all other checks). `formatJson` uses only `r.details` and never emits `detailsHuman`. `TC-012` confirms other checks render identically. ✅

**D5 (active-sidecar protection is the scan predicate; no second prune-local guard):**
`pruneOrphanSidecars` deletes exactly what `scanOrphanSidecars` returns. Active sidecars are excluded structurally at scan time by `isOrphanSidecar`. There is no prune-local re-check. The 破壊確認 (TC-007) demonstrates this single-tooth design. ✅

## Judgment Item 3 — Spec Requirement Conformance (SHALL/MUST)

| Requirement | Clause | Status |
|-------------|--------|--------|
| Sidecar-orphan detection SHALL be a single shared implementation | orphan.ts imported by both consumers | ✅ |
| Neither consumer MUST contain an independent re-implementation | orphan-sidecars.ts has no private ACTIVE_STATUSES or predicate | ✅ |
| Classification semantics MUST match current isOrphanSidecar | ACTIVE_STATUSES set identical (5 statuses); archived/canceled/missing → orphan logic preserved | ✅ |
| job prune SHALL list orphan worktrees and orphan sidecars in dry-run | runPrune calls both runners with labeled sections | ✅ |
| MUST NOT modify filesystem in dry-run | pruneOrphanSidecars skips fs.rm when force=false (TC-004) | ✅ |
| Active-job sidecars MUST NOT appear | scan excludes ACTIVE_STATUSES entries (TC-003, TC-004) | ✅ |
| --force SHALL remove every orphan sidecar; MUST leave active job sidecar | TC-006 confirms; TC-007 破壊確認 | ✅ |
| Deletion MUST be best-effort | TC-020: per-rm failure → warning; other orphans still attempted; exitCode stays 0 | ✅ |
| hint SHALL direct to specrunner job prune, MUST NOT contain rm -rf | TC-009 confirms both conditions | ✅ |
| human output SHALL show at most N paths + remainder; --json MUST contain full list | TC-010/011/019 | ✅ |
| Other doctor checks and worktree prune SHALL remain unchanged | formatter ?? fallback; runner.ts unmodified; TC-012/TC-013 | ✅ |

## Judgment Item 4 — Scope / Non-Regression

Items explicitly out of scope are untouched:
- `src/core/worktree/orphan.ts`: not modified.
- `src/core/prune/runner.ts`: not modified.
- `src/core/doctor/checks/storage/orphan-worktrees.ts`: not modified.
- No other doctor check files modified.
- `ACTIVE_STATUSES` set: identical to original (`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`).

The one expected change to existing tests (orphan-sidecars check hint/details assertions — the T6 carve-out) is confirmed: the prior `rm -rf` hint assertions are replaced with `job prune` assertions; `details` retains every path, so `W-01`/`W-02` details-presence assertions remain valid.

No architectural boundary violations observed. The `prune` runner does not depend on the `doctor` subtree; the shared module lives at a neutral `src/core/sidecar/` location, mirroring `src/core/worktree/`.

## Summary

The implementation fully satisfies all acceptance criteria and conforms to all design decisions, spec requirements, and the request's acceptance criteria. The code review (review-feedback-001.md) returned `approved` with two `info`-level findings and no blocking issues. All verification phases passed.

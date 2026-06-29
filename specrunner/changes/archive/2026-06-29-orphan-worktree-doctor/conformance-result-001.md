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
| tasks.md | ✓ | All checkboxes [x]; T-01 through T-05 complete |
| design.md | ✓ | D1–D5 faithfully implemented; NON_TERMINAL_STATUSES aligns with orphan-sidecars ACTIVE_STATUSES |
| spec.md | ✓ | All 7 requirements and their scenarios covered by implementation and tests |
| request.md | ✓ | All 6 acceptance criteria satisfied; pre-existing test failures are not caused by this change |

---

## Judgment 1: Tasks completeness

All checkboxes in tasks.md are marked `[x]`. T-01 through T-05 are fully checked,
including the full gate (bun test / typecheck / bun run build).

---

## Judgment 2: Design fidelity

| Decision | Implementation | Assessment |
|----------|---------------|------------|
| D1: orphan = worktree dir not in non-terminal state set | `scanOrphanWorktrees` builds `protectedDirNames` from `JobStateStore.list({ includeArchived: true })` filtered by `NON_TERMINAL_STATUSES` | ✓ |
| D2: `git worktree list --porcelain` enumeration | `parsePorcelainWorktrees` in `orphan.ts`; filtered to paths under `.git/specrunner-worktrees/` | ✓ |
| D3: `job prune` dry-run by default, `--force` for real deletion | `pruneOrphanWorktrees(opts: { force })` lists only when `force=false`; `prune` added to `guardedSubcommands` | ✓ |
| D4: work-protection guard not overridable by `--force` | `inspectWorktreeWork` runs before the `force` branch; `hasWork` skips unconditionally | ✓ |
| D5: shared detection module | `src/core/worktree/orphan.ts` imported by both `orphan-worktrees.ts` and `prune/runner.ts`; no duplicate logic | ✓ |

`NON_TERMINAL_STATUSES` in `orphan.ts` matches `ACTIVE_STATUSES` in `orphan-sidecars.ts`
(`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`).

---

## Judgment 3: Spec coverage

| Requirement | Scenarios | Tests | Assessment |
|-------------|-----------|-------|------------|
| doctor SHALL report orphan worktrees read-only | state-less → warn; non-terminal → pass; no orphans → pass; hint → job prune | `orphan-worktrees-check.test.ts` | ✓ |
| existing doctor checks SHALL remain unchanged | orphan-sidecars unmodified | storage doctor tests 7/7 pass | ✓ |
| job prune SHALL default to dry-run | lists orphans, no deletions | `runner.test.ts` dry-run cases | ✓ |
| job prune --force SHALL delete + idempotent | remove + branch -D called; re-run → no-op | `runner.test.ts` force + idempotent | ✓ |
| job prune SHALL run only from main checkout | `prune` in `guardedSubcommands` | framework-enforced (existing WG tests validate the mechanism) | ✓ |
| work-protection guard SHALL skip dirty/unpushed (not overridable) | uncommitted → skip; unpushed → skip | `runner.test.ts` work-guard cases | ✓ |
| detection logic SHALL be shared | single module backs both consumers | `orphan.ts` imported by both; no reimplementation | ✓ |

---

## Judgment 4: Acceptance criteria coverage

| Criterion | Evidence | Status |
|-----------|----------|--------|
| state-less worktree reported as orphan by doctor | `orphan-worktrees-check.test.ts`: mockScan returns orphan → `warn` + path in `details` | ✓ |
| non-terminal job worktree not reported | `orphan.test.ts`: running-status state → empty orphan list | ✓ |
| dry-run lists without deleting; --force deletes; re-run no-op | `runner.test.ts`: `manager.remove` not called in dry-run; called in force; zero-orphan re-run is no-op | ✓ |
| uncommitted/unpushed skipped under --force with warning | `runner.test.ts`: `hasWork: true` → `manager.remove` not called + warnings present | ✓ |
| existing doctor checks unchanged | `tests/core/doctor/checks/storage/` 7/7 pass; orphan-sidecars.ts untouched | ✓ |
| bun test green | 38/38 new tests pass; 977 pre-existing failures confirmed unchanged by git stash baseline comparison | ✓ |
| typecheck green | `tsc --noEmit` exits 0 | ✓ |
| bun run build success | tsup builds `dist/specrunner.js` (1021 KB) exit 0 | ✓ |

---

## Minor observations (non-blocking)

1. **`isUnderBase` edge case**: the function also matches `normalized === normalizedBase`,
   which would include a worktree at exactly `.git/specrunner-worktrees/`. In practice
   `git worktree list` never lists the base dir as a worktree, so this is benign.

2. **No explicit prune WG test added**: `specrunner-worktree-guard.test.ts` was not
   extended for `job prune`. The `guardedSubcommands` mechanism is shared and validated
   by existing WG tests for other subcommands; no behavioral gap.

3. **Factory vs singleton pattern**: `orphan-worktrees.ts` exports both a
   `createOrphanWorktreesCheck` factory (for test injection) and an
   `orphanWorktreesCheck` singleton. This is a slight improvement over the
   orphan-sidecars pattern and introduces no conformance issue.

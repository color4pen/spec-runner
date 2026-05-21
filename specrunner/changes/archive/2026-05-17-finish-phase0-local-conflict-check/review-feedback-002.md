# Review Feedback (Iteration 2): finish-phase0-local-conflict-check

Reviewed: `src/core/finish/local-conflict-check.ts`, `src/core/finish/orchestrator.ts`, `tests/unit/core/finish/local-conflict-check.test.ts`, `tests/finish-orchestrator.test.ts`, `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md`, `specrunner/changes/finish-phase0-local-conflict-check/test-cases.md`

Verified all iteration-1 findings were addressed. Ran `bun run typecheck` (clean) and `bun run test` (1951/1951 pass).

---

## Verification of iteration-1 fixes

### [iter-1 major: parseConflictPaths misses modify/delete paths] — FIXED

**file**: `src/core/finish/local-conflict-check.ts:75-92`

The new `parseConflictPaths` adds a second regex branch (`Pattern 2`) covering the real git modify/delete format:

```typescript
const m2 = /CONFLICT \([^)]+\): (.+?) (?:deleted|modified|added) in/.exec(line);
```

This matches the suggested fix verbatim. A new unit test (`local-conflict-check.test.ts:247-270`) asserts a real `CONFLICT (modify/delete): src/deleted-file.ts deleted in branch-del and modified in HEAD...` line yields `conflictPaths: ["src/deleted-file.ts"]`. Verified by passing test suite.

### [iter-1 minor: TC-125 semantics drift] — FIXED

**file**: `tests/finish-orchestrator.test.ts:402-407`

The spawn mock now distinguishes Phase 0 (`args[2] === "main"`) from Phase 1 (`args[2] === "feat/test-slug"`) explicitly, with comments documenting the intent. The first branch succeeds, the second fails, preserving the original test's "Phase 1 escalation" semantics.

### [iter-1 minor: test-cases.md format mismatch] — FIXED

**file**: `specrunner/changes/finish-phase0-local-conflict-check/test-cases.md:29-40, 73-85`

TC-LCC-2 and TC-LCC-5 GIVEN blocks now use the actual git output format with `"Merge conflict in"` for content conflicts and `"deleted in <branch> and modified in HEAD..."` for modify/delete. THEN clauses document which pattern extracts each path.

### [iter-1 minor: TC-LCC-ORCH-6 label mismatch] — FIXED

**file**: `tests/finish-orchestrator.test.ts:1060-1064`

`describe` renamed to `TC-LCC-ORCH-7 (tasks TC-LCC-ORCH-DRYRUN): dry-run skips local conflict check` with a clarifying comment that the original "regression-free" TC-LCC-ORCH-6 is covered implicitly by the pre-existing suite.

---

## New findings (iteration 2)

### [minor] Unit-test TC-LCC-2 data does not match the updated test-cases.md scenario

**file**: `tests/unit/core/finish/local-conflict-check.test.ts:80-83`

**description**: test-cases.md TC-LCC-2 now specifies the GIVEN stdout as one content line plus one modify/delete line:
```
CONFLICT (content): Merge conflict in src/foo.ts
CONFLICT (modify/delete): src/bar.ts deleted in branch-del and modified in HEAD.  Version HEAD of src/bar.ts left in tree.
```
The corresponding unit test still uses two content lines:
```
CONFLICT (content): Merge conflict in src/foo.ts
CONFLICT (content): Merge conflict in src/bar.ts
```

Functional coverage of Pattern 2 (modify/delete) is provided by the new TC-LCC-5 `it("extracts modify/delete...")`. The two-patterns-in-one-call scenario (Pattern 1 + Pattern 2 mixed output) is NOT directly tested anywhere. Same drift exists for TC-LCC-5: test-cases.md specifies a 3-line mixed-pattern output, but the unit test uses 3 content lines only.

**impact**: Low. Pattern 2 is exercised in isolation, so a regression in either pattern would be caught. The risk is that a parser bug in handling adjacent mixed-pattern lines (e.g. accidental fallthrough between patterns) would not be detected.

**suggestion**: Either (a) update the TC-LCC-2 / TC-LCC-5 unit-test stdout strings to match the new test-cases.md format (which would also assert the mixed-pattern scenario), or (b) note in test-cases.md that TC-LCC-2 / TC-LCC-5 path-extraction details are split across two `it` blocks rather than a single one.

### [minor] TC-LCC-7 (non-default base branch — `should`) not implemented

**file**: `tests/unit/core/finish/local-conflict-check.test.ts` (no test)

**description**: test-cases.md TC-LCC-7 (`should` priority) asserts `baseBranch: "develop"` flows correctly through to `git fetch origin develop` and `git merge-tree --write-tree HEAD origin/develop`. No test parameterizes `baseBranch` other than `"main"`. The TC-LCC-6 args-verification tests use the parametrized `BASE_BRANCH = "main"` constant, so they happen to verify args formatting but do not exercise the non-default branch path.

**impact**: Low (should priority). The code path is identical regardless of branch name — it is `string` interpolation only. Probability of regression is small.

**suggestion**: Add a one-line test with `baseBranch: "develop"` asserting the spawn args change accordingly. Or accept the gap and note in implementation-notes.md that TC-LCC-7 was deferred.

### [minor] `prViewData.state` is checked as string literal `"MERGED"` without enum/constant

**file**: `src/core/finish/orchestrator.ts:117`, `:160`

**description**: Two separate checks use the string literal `"MERGED"`:
- Line 117: `prViewData.state !== "MERGED"` (skip conflict check)
- Line 160: `prViewData.state === "MERGED"` (resume path)

These are coupled — if one drifts to `"merged"` or a typo, behavior diverges silently. Pre-existing pattern in the codebase, but the new line 117 doubles the surface.

**impact**: Very low. Both literals match the GitHub API enum exactly, and TypeScript's `string` typing on `prViewData.state` allows the comparison.

**suggestion**: (Non-blocking, project-wide refactor) Extract a `PR_STATE_MERGED = "MERGED"` constant or use a union type. Skip for this PR.

### [praise] Iteration 1 fix is minimal and targeted

The `parseConflictPaths` change adds 7 lines (one new regex + early-`continue` restructure), the orchestrator test fix is a 2-line change, and the test-cases.md update is documentation-only. No drift into other concerns. The exit-code-as-authority invariant is preserved: even if both regex branches fail, `{ ok: false, conflictPaths: [] }` is still returned.

### [praise] Test fixture for TC-125 carries explanatory comments

`tests/finish-orchestrator.test.ts:402-407` now contains two comments distinguishing Phase 0 (`origin main`) from Phase 1 (`origin feat/test-slug`) intent. Future readers will not be confused about which `git fetch` is being mocked.

### [praise] All 1951 tests pass and typecheck is clean

`bun run typecheck && bun run test` returns 0 errors, 1951/1951 tests pass, including the 12 unit tests for `local-conflict-check.ts` and 27 orchestrator integration tests.

---

## Scenario coverage summary

| TC | Priority | Implemented? | Notes |
|---|---|---|---|
| TC-LCC-1 (clean → ok:true) | must | yes | 3 `it` blocks |
| TC-LCC-2 (conflict + paths) | must | yes (but test data uses 2 content lines, not content+modify/delete as in test-cases.md) | minor drift documented above |
| TC-LCC-3 (fetch fail → throws) | must | yes | 3 `it` blocks |
| TC-LCC-4 (exit 1 + no parse) | should | yes | 2 `it` blocks |
| TC-LCC-5 (multi-path) | must | yes; modify/delete covered as separate `it` | functional coverage complete |
| TC-LCC-6 (correct spawn args) | should | yes (folded into TC-LCC-1 `it` blocks) | |
| TC-LCC-7 (non-default base) | should | no | minor gap |
| TC-LCC-ORCH-1 (block Phase 1) | must | yes | line 880 |
| TC-LCC-ORCH-2 (pass → proceed) | must | yes | line 921 |
| TC-LCC-ORCH-3 (fetch fail → escalate) | must | yes | line 950 |
| TC-LCC-ORCH-4 (recovery message) | must | yes | line 987 |
| TC-LCC-ORCH-5 (re-run not blocked) | must | yes | line 1019 |
| TC-LCC-ORCH-6 (regression-free) | must | implicit via full suite | acknowledged in describe comment |
| TC-LCC-ORCH-7 (dry-run skip) | should | yes | line 1064 |
| TC-LCC-ORCH-8 (MERGED skip) | should | covered indirectly by TC-106 | |
| TC-LCC-ORCH-9 (fetch error detail) | should | partial — TC-LCC-ORCH-3 asserts the failed-step label, not the stderr detail | |
| TC-LCC-ORCH-10 (worktreePath as cwd) | should | not asserted explicitly; TC-WT-FIN-001/-002 cover the equivalent path-routing for Phase 1 | |
| TC-REG-1/2/3 | must / could | covered by passing suite | |

All `must` scenarios have explicit or implicit coverage. The unimplemented `should` items (TC-LCC-7, TC-LCC-ORCH-9/-10 fine-detail) are non-blocking.

---

## Summary

Iteration 1's `major` finding (modify/delete path extraction) is fixed with the exact suggested two-pattern approach and a dedicated unit test. The three `minor` findings (TC-125 mock disambiguation, test-cases.md format, TC-LCC-ORCH-6 label) are all addressed. New findings in this iteration are all `minor` and non-blocking — primarily test-data-vs-spec drift in TC-LCC-2/TC-LCC-5 unit tests and unimplemented `should` priority cases.

The implementation correctly:
- Blocks Phase 1 on conflict detection (verified by TC-LCC-ORCH-1)
- Does not mutate job state on conflict (verified by `assertJobFinishable` round-trip in TC-LCC-ORCH-5)
- Escalates on fetch failure rather than silent-skipping (TC-LCC-ORCH-3)
- Threads `baseBranch` and `target.worktreePath ?? cwd` correctly
- Uses exit code as the authoritative conflict signal with best-effort path parsing

- **verdict**: approved

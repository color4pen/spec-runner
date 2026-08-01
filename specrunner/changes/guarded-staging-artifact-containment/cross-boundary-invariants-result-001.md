# Review: cross-boundary-invariants — guarded-staging-artifact-containment (iteration 1)

## Scope

Changed code examined:

| File | Role |
|------|------|
| `src/core/step/commit-push.ts` | Guarded branch wired with exclusion + volume guard (D3/D4/D5) |
| `src/core/step/staging-containment.ts` | New: pure filtering/counting/resolving utilities |
| `src/util/glob-match.ts` | `matchesGlob` relocated here; `globMatch` untouched |
| `src/core/step/bite-evidence/test-file-selection.ts` | Now re-exports `matchesGlob` from shared util |
| `src/errors.ts` | `STAGING_LIMIT_EXCEEDED` code + factory added |
| `src/config/schema/types.ts` | `PipelineConfig` extended with two optional fields |
| `src/config/schema/validation.ts` | Validation schemas for the two new fields |

Unchanged code examined for implicit assumptions:

- `src/core/step/write-scope.ts` — `findWriteScopeViolations`, `protectedCanonPaths`, `isJudgeArtifact`
- `src/core/step/__tests__/commit-push-egress-invariant.test.ts` — TC-002 / TC-017 (guarded existing tests)
- `src/core/step/commit-push.ts` scoped branch (lines 486–582) — scoped mode isolation
- `restoreViolatedPaths` (lines 184–235) — restoration routing under new `untracked` array semantics

---

## Invariant 1: Violation check runs on the full pre-exclusion set (D3)

**Claim**: `findWriteScopeViolations(changedPaths)` executes before `applyStagingExclusions`, so an
`stagingExcludePatterns` entry that covers a canon path cannot suppress detection.

**Verification**: In `commit-push.ts`:

```
line 602:  const violations = findWriteScopeViolations(step.name, slug, changedPaths, declaredWritePaths);
...
line 616:  const excludePatterns = resolveStagingExcludePatterns(deps.config);
line 617:  const stagePaths = applyStagingExclusions(changedPaths, excludePatterns);
```

Ordering is structurally enforced — exclusion is computed in lines after the violation guard. No
conditional path reaches exclusion before passing the violation check. **Green.**

---

## Invariant 2: Scoped mode is not touched by the `--untracked-files=all` change (D5)

**Claim**: The new `untrackedMode: "all"` parameter is used ONLY in the guarded branch. Scoped mode
retains `--untracked-files=normal` (default) behavior, so scoped residual checks and scoped staging
are structurally unchanged.

**Verification**: `getWorktreeChangedPaths` has two call sites in `commitAndPush`:

- Line 519 (scoped): `getWorktreeChangedPaths(infra.spawnFn, cwd, true)` — no 4th arg → default `"normal"`
- Line 588 (guarded): `getWorktreeChangedPaths(infra.spawnFn, cwd, false, "all")` — explicit `"all"`

The parameter defaults to `"normal"`, so the function signature change is backward-compatible
for the scoped caller. **Green.**

---

## Invariant 3: `restoreViolatedPaths` routing is correct under `--untracked-files=all`

**Claim**: `restoreViolatedPaths` routes each violation path to `git clean -f`, `git rm --cached`,
or `git checkout HEAD` by membership in `untrackedSet` / `stagedNewSet`. Switching the guarded
enumeration to `--untracked-files=all` changes what is in `statusResult.untracked`, but the routing
remains correct for actual violation targets.

**Key fact**: `findWriteScopeViolations` only produces violations for paths matching
`protectedCanonPaths` (exact paths like `specrunner/changes/<slug>/design.md`) or `isJudgeArtifact`
(prefix `specrunner/changes/<slug>/` + pattern). Both classes reside inside **tracked parent
directories** (`specrunner/changes/<slug>/` is committed and tracked). Within a tracked directory,
individual untracked files appear as `?? specrunner/changes/slug/new-file.md` in git status
**regardless of `--untracked-files` mode** (mode only collapses **fully untracked directories**;
already-tracked directories always enumerate their children individually).

Therefore `statusResult.untracked` contains the same individual paths for violation-class files
in both modes. The routing logic in `restoreViolatedPaths` (Set membership lookup) is unaffected.
**Green.**

---

## Invariant 4: Volume guard fires before `git add` — no ARG_MAX exposure in the halt path

**Claim**: For the motivating incident (48 000-file artifact tree), the `STAGING_LIMIT_EXCEEDED`
error is thrown before `git add -A -- <stagePaths>` is called. The giant path list is never
handed to git.

**Verification**:

```
line 622:  const limit = resolveMaxStagedFiles(deps.config);
line 623:  if (stagePaths.length > limit) {
line 624:    throw stagingLimitExceededError(...);
line 630:  }
line 639:  if (stagePaths.length > 0) {
line 640:    const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
```

The `throw` at line 624 exits the function; line 640 is never reached when the limit is exceeded.
**Green.**

---

## Invariant 5: Existing guarded tests (TC-002 / TC-017) remain green

**Claim**: TC-002 and TC-017 in `commit-push-egress-invariant.test.ts` — which drive the guarded
branch via positional fake `SpawnFn` — stay green unmodified.

**Verification**: These tests supply canned status output at a fixed position and assert only
that `subcommands` contains `commit`/`push`. They do not inspect `git status` args.

The guarded git-call **sequence length** is unchanged: 10 calls in TC-002 (rev-parse → status →
add → diff → commit → rev-parse → rev-parse → rev-list → push × 2). The new code adds no
git calls: volume guard check precedes `git add` (no extra git call), exclusion is a pure
JS filter (no extra git call). The `--untracked-files=all` flag is invisible to the positional fake.

For TC-002's canned status (` M src/impl-core-001.ts`): 1 file < 2000 default limit → no halt;
no patterns → no exclusion; call sequence identical. **Green.**

---

## Invariant 6: `matchesGlob` semantics preserved after relocation

**Claim**: The `matchesGlob` function relocated to `src/util/glob-match.ts` is byte-for-byte
identical to the original in `bite-evidence/test-file-selection.ts` (the design specifies "body
moved verbatim"). The re-export in `test-file-selection.ts` preserves the import path for
existing callers.

**Verification**:

- `src/util/glob-match.ts` lines 95-128: `matchesGlob` with `(?:.*/)?` for `**/`, `.*` for
  bare `**`, `[^/]*` for `*`, and regex-escape for all other chars including `.`
- `bite-evidence/test-file-selection.ts` lines 16-17:
  ```typescript
  import { matchesGlob } from "../../../util/glob-match.js";
  export { matchesGlob };
  ```
  Re-export keeps the public API unchanged for any caller importing from `./test-file-selection.js`.
- The `globMatch` function in the same util file is unmodified. **Green.**

---

## Invariant 7: Egress check integrity unaffected

**Claim**: `runInlineEgressCheck` (rev-parse + rev-list against `synthesizedCommits` ledger) is
called after commit in both modes and does not interact with the new exclusion or volume guard paths.

**Verification**: The egress call is at guarded line 683 and scoped line 579 — after commit in
both cases. The `synthesizedCommits` ledger and OID recording logic are not touched by this change.
The volume guard throws before `git add`, so no commit is made, and no egress call is made —
consistent with the halt semantics. **Green.**

---

## Observation (non-blocking)

**`--untracked-files=all` closes a pre-existing detection gap for delete-recreate of tracked canon directories**

In the old code (normal mode), if an agent deleted `specrunner/changes/<slug>/` and recreated it
as a fresh untracked directory, git status in normal mode would collapse the entry to
`?? specrunner/changes/slug/` (directory path). `findWriteScopeViolations` would check this
directory path against the `forbiddenWritePaths` Set (which contains exact file paths) and
`isJudgeArtifact` (requires `specrunner/changes/<slug>/` prefix + filename pattern). Neither would
match the bare directory path → violation missed.

With `--untracked-files=all`, the new code enumerates individual files (`?? specrunner/changes/slug/design.md` etc.), each of which is correctly matched by `findWriteScopeViolations`.

This is a positive strengthening of the enforcement invariant (fewer false-negatives), not a
regression. The scenario is unlikely in practice (requires an agent to `rm -rf` and recreate a
tracked directory), but the new code is strictly more correct. Documented here for transparency.

---

## Summary

All 7 cross-boundary invariants examined are green. No finding was raised. The implementation
correctly preserves the ordering guarantee (D3), scoped-mode isolation, existing-test
compatibility, and ARG_MAX safety. The `matchesGlob` relocation is behavior-preserving.

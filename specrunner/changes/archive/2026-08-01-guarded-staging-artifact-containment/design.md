# Design: guarded staging build-artifact containment — exclude patterns + volume guard

## Context

Guarded write steps (`implementer`, `build-fixer`, `code-fixer`, `test-materialize`, `adr-gen`)
cannot enumerate their outputs in advance, so `commitAndPush` stages the whole worktree diff
(including untracked files) for them. `src/core/step/write-scope.ts:33-53` classifies these steps
as `"guarded"`; `src/core/step/commit-push.ts:572-652` implements the guarded branch:
`git status` → enumerate `changedPaths` → `findWriteScopeViolations` → `git add -A -- <changedPaths>`
→ whole-index diff check → `git commit -- <changedPaths>` → egress check → push.

**The defect.** Whatever the agent wrote into the worktree to build (a scratch `CARGO_HOME`,
`cargo vendor` output, dependency caches) is untracked, and unless the *target* repo's `.gitignore`
lists it, guarded staging sweeps it into the commit. On a 0.4.8 TypeScript + Rust project the
`implementer` created `.cargo-tmp/` and vendor output (~48,000 files / ~8.8M lines); guarded staging
committed the whole tree; the resulting oversized pack failed `git push` with **HTTP 400**; the job
halted and recovery was manual. The contamination is *structural* (it is how guarded staging works),
so any round that builds Rust can re-hit it.

Adding a push retry does not help: the 400 is caused by pack size, and re-sending the same pack
fails identically. The correct fix has two layers:

1. A **repo-declared exclusion** that removes known scratch artifacts from the guarded stage set
   (leaving them in the worktree, uncommitted).
2. A **volume guard** that deterministically halts *before commit* when the post-exclusion stage set
   is implausibly large — a fail-closed backstop for artifacts the exclusion did not name.

### Verified current-code facts

- `src/core/step/commit-push.ts:574` — guarded enumeration calls
  `getWorktreeChangedPaths(spawnFn, cwd)` (defined `:106-158`), which runs
  `git status --porcelain -z --no-renames` with **no `--untracked-files` flag** → git's default
  `normal` mode. In `normal` mode git **collapses a fully-untracked directory into one entry**
  (e.g. `.cargo-tmp/`), then `git add -A -- .cargo-tmp/` expands it and stages every file beneath.
  So the incident presents as ~1-2 status entries but tens of thousands of staged files. A quantity
  guard that counts *status entries* would therefore be blind to the exact incident it targets. This
  fact drives Decision **D5**.
- `src/core/step/commit-push.ts:586` — `findWriteScopeViolations(step.name, slug, changedPaths,
  declaredWritePaths)` already runs on the full enumeration before staging (halts on protected-canon
  writes). Its position (before any staging) is what makes exclusion unable to open a fail-open hole
  (Decision **D3**).
- `deps.config` is a `SpecRunnerConfig` (`StepContext.config`, `src/core/port/step-context.ts:16`);
  `commitAndPush(step, state, deps, …)` already receives `deps`, so config is reachable inside the
  guarded branch with no signature change.
- Errors thrown by `commitAndPush` are caught in `StepExecutor` (`src/core/step/executor.ts:447-454`)
  and wrapped by `makeCommitFailHalt` (`src/core/step/step-halt.ts:330-341`), which **preserves the
  error `code`** and produces a terminal `kind: "failed"` halt (escalation). A distinct error code
  therefore surfaces as a diagnosable escalation and is assertable in tests.
- `PipelineConfig` (`src/config/schema/types.ts:236-247`) has only `maxRetries` and `fast`. The zod
  `pipeline` object schema is at `src/config/schema/validation.ts:205-244`; the non-empty-string
  array pattern (`array(nonEmptyString(...)).check(minLength(1, …))`) already exists for
  `verification.scopedTestPatterns` (`validation.ts:271-276`) and `coverage.include`. The positive-int
  pattern (`number().check(int(...), gte(1, …))`) exists for `specReview.pollIntervalMs`
  (`validation.ts:195-200`). Validation failures throw `code: "CONFIG_INVALID"` via
  `throwFromFirstIssue` (`validation.ts:504-528`).
- Three glob matchers already coexist in the tree: `matchesGlob`
  (`src/core/step/bite-evidence/test-file-selection.ts:51-84`, literal-dot semantics, `**/`→`(?:.*/)?`),
  `globMatch` (`src/util/glob-match.ts:17`, adds `?` support, `**/`→`(?:.+/)?`), and `matchGlob`
  (`src/core/reviewers/glob-match.ts`). This request reuses **`matchesGlob`** specifically, per its
  acceptance criteria (Decision **D2**).
- Existing guarded-mode `commitAndPush` tests (`commit-push-egress-invariant.test.ts` TC-002 / TC-017)
  drive the git sequence with a positional fake spawn and assert only that `subcommands` contains
  `commit`/`push`; they do **not** assert the `git status` args. Their configs are `{}` (no
  `pipeline` block). This bounds what changes keep them green (Decision **D5**, Risks).

## Goals / Non-Goals

**Goals**:

- Add `pipeline.stagingExcludePatterns?: string[]` (glob). In guarded staging, paths matching any
  pattern are removed from the stage set (not staged; left in the worktree). Default **empty** — the
  target repo's `.gitignore` is the first line of defense; a built-in default would silently drop
  intended outputs.
- Reuse the existing `matchesGlob` by relocating it to a shared util so both bite-evidence and the
  new staging code import a **single implementation** (no new dependency).
- Keep write-scope (protected-canon) enforcement **ahead of** exclusion so an exclude pattern that
  matches a canon path cannot suppress the violation check (closes an exclusion-driven fail-open).
- Add `pipeline.maxStagedFiles?: number` (default **2000**). When the post-exclusion stage count
  exceeds it, halt (escalation) before commit, with a message listing the total and the top
  directories by file count, and naming the two exits (exclude / `.gitignore`, or raise the limit).
- Validate both fields (`stagingExcludePatterns`: non-empty-string array; `maxStagedFiles`: positive
  integer) → `CONFIG_INVALID`. Document both in `docs/configuration.md`.

**Non-Goals**:

- Scoped staging (declared-output pathspec) is untouched. Exclusion and the volume guard apply to
  **guarded** mode only.
- No push transient-failure (5xx / network) retry mechanism. The 400 is removed at its source here;
  retry is a separate concern.
- No byte-size threshold (single huge file). A file-count threshold covers this incident class
  (dependency-tree contamination); size-based detection is a future request.
- No auto-editing of the target repo's `.gitignore`, and no change to any agent prompt.
- No consolidation of the three coexisting glob matchers. This request only *relocates* `matchesGlob`
  (behavior-preserving); unifying `globMatch` / `matchGlob` / `matchesGlob` is out of scope and would
  risk the "existing tests unchanged" criterion (they pin subtly different semantics).

## Decisions

### D1: Two-layer defense — repo-declared exclusion + fail-closed volume guard

The exclusion removes *known* scratch artifacts; the volume guard catches *unknown* mass
contamination. Neither alone suffices: exclusion misses patterns nobody declared; a volume guard
alone would halt on every legitimate known artifact and be noisy. Both are commit-time (guarded
mode), before push.

- **Rationale**: the incident is structural and recurring; a declarative escape hatch plus a
  fail-closed backstop converts an unrecoverable post-push failure (HTTP 400, manual cleanup) into a
  deterministic pre-commit halt with an actionable message.
- **Alternatives considered**:
  - *Push retry only* — **rejected**: the 400 is pack size; re-sending is identical. Treats the
    symptom, not the source.
  - *Built-in default exclude list (`.cargo-tmp`, `node_modules`, …)* — **rejected**: ecosystem-specific
    names are unbounded and can silently drop an intended artifact that happens to collide. Ownership
    belongs to the repo declaration.

### D2: Relocate `matchesGlob` to `src/util/glob-match.ts`; both consumers import it

Move the `matchesGlob` body from `bite-evidence/test-file-selection.ts` into `src/util/glob-match.ts`
(the existing glob-utility home) as a named export alongside `globMatch`. `test-file-selection.ts`
imports it from there and **re-exports** it (so `bite-evidence/__tests__/test-file-selection.test.ts`,
which imports `matchesGlob` from `./test-file-selection.js`, stays green unmodified). The new staging
module imports `matchesGlob` from the same util. A structural test pins that both consumers source
`matchesGlob` from a specifier ending in `glob-match.js` and that neither redefines it.

- **Rationale**: the acceptance criterion demands a *single* `matchesGlob` implementation shared by
  bite-evidence **and** staging, provable by import structure. Relocating into the existing glob-util
  file satisfies this literally without adding a file whose name (`match-glob.ts` vs `glob-match.ts`)
  would be a navigation trap.
- **Why not reuse `globMatch` for staging instead** — the criterion names `matchesGlob` and requires
  the *same* implementation on both sides; using `globMatch` on the staging side would leave two
  different implementations and fail the criterion. `globMatch` also differs semantically (`?`
  support; `**/`→`(?:.+/)?`), so swapping bite-evidence onto it would risk its pinned tests.
- **Why not merge the three matchers** — behavior-preserving relocation is in scope; a semantics
  merge is not (Non-Goals). The two functions coexisting in one file are documented as such; unifying
  them is a follow-up.

### D3: Write-scope enforcement runs on the full enumeration, before exclusion

Order in the guarded branch is unchanged where it matters: `findWriteScopeViolations` runs on the
full `changedPaths` (pre-exclusion). Only *after* it passes do we compute the exclusion-filtered
`stagePaths` and apply the volume guard. An exclude pattern that matches a protected-canon path (e.g.
`specrunner/changes/**`) therefore still trips the violation check and halts — exclusion only removes
a path from *staging*, never from *inspection*.

- **Rationale**: exclusion is a staging convenience; scope enforcement is a security boundary. If
  exclusion could gate inspection, a repo could declare its way past the canon guard (fail-open). The
  structural guarantee is ordering: inspect the whole set first.
- **Alternatives considered**: *filter first, then inspect the survivors* — **rejected**: exactly the
  fail-open this request must close.

### D4: Volume guard halts before commit via a distinct escalation error

After exclusion, if `stagePaths.length > maxStagedFiles`, throw a new
`STAGING_LIMIT_EXCEEDED` typed error (factory in `src/errors.ts`, mirroring `writeScopeViolationError`)
**before** `git add`. Because the check precedes staging, nothing is staged, committed, or pushed;
there is no index to unwind. The message carries the total, the top-N directories by file count
(aggregated by first path segment), and the two exits: declare `stagingExcludePatterns` / add to
`.gitignore` for scratch artifacts, or raise `maxStagedFiles` for a genuinely large change.
`makeCommitFailHalt` preserves the code → terminal `failed` halt → escalation. Default `maxStagedFiles`
is **2000**, resolved at runtime (not injected at the config layer), matching the
`resolveScopedTestPatterns` precedent.

- **Rationale**: converts an unrecoverable post-push failure into a pre-commit halt with an
  operator-actionable message. Checking before `git add` also means the halt path builds no oversized
  git arg list.
- **Alternatives considered**: *stage, then count the index, then unstage on breach* — **rejected**:
  adds a git call to the guarded sequence (breaks positional existing tests), and needs an unwind
  step. Counting the enumeration before staging is simpler and side-effect-free.

### D5: Guarded enumeration switches to `--untracked-files=all` so the count reflects real files

The volume guard is meaningless in git's default `normal` untracked mode, which collapses
`.cargo-tmp/` (48k files) into one status entry. The guarded call to `getWorktreeChangedPaths` gains
an opt-in `untrackedMode: "normal" | "all"` parameter and passes `"all"`, so `changedPaths` enumerates
individual untracked files and the post-exclusion count is the true file count. The guard then halts
*before* `git add`, so the tens-of-thousands-element path list is never handed to git (ARG_MAX safe).
Scoped callers keep the default `"normal"` — no scoped-path behavior change.

- **Rationale**: without per-file enumeration the guard has no teeth against the motivating incident
  (the class it exists to stop). Per-file enumeration + count-before-add is the only shape that both
  (a) counts truthfully and (b) never builds an oversized arg list, because the over-limit case halts
  before staging.
- **Existing-tests safety**: `getWorktreeChangedPaths` is internal to `commit-push.ts`. The new
  parameter defaults to `"normal"`; only the guarded caller opts into `"all"`. Guarded tests
  (TC-002 / TC-017) supply canned status output positionally and do not assert `git status` args, and
  the git-call *sequence length is unchanged* (exclusion and the guard add **no** git calls), so they
  stay green. Scoped tests are unaffected.
- **Alternatives considered**:
  - *Count `normal`-mode status entries* — **rejected**: toothless against collapsed untracked dirs
    (the incident).
  - *Keep `normal` enumeration but stage then count the expanded index* — **rejected** (see D4): adds
    a git call, breaks positional tests, needs an unwind.

### D6: Config validation mirrors existing precedents

In the `pipeline` object schema: `stagingExcludePatterns:
optional(array(nonEmptyString(...), "must be an array.").check(minLength(1, "must be a non-empty
array.")))` (like `verification.scopedTestPatterns`), and `maxStagedFiles: optional(number(...).check(
int(...), gte(1, …)))` (positive integer, like `specReview.pollIntervalMs`). `[]`, empty-string /
non-string elements, and `0` / negative / non-integer all surface as `CONFIG_INVALID` through the
existing `throwFromFirstIssue` path.

- **Rationale**: symmetry with established patterns; invalid config fails at load, not at the guard.
- **Note**: `stagingExcludePatterns: []` is rejected as invalid rather than treated as "explicit
  empty" — an empty array is the same as omitting the field, and rejecting it avoids a silent no-op
  config. Omit the field to mean "no exclusions" (the default).

## Risks / Trade-offs

- **[Risk] `--untracked-files=all` enumerates a very large untracked tree into memory** (e.g. 48k
  path strings). → **Mitigation**: this is string enumeration git already walks; the array is a few
  MB and is discarded at the halt. No oversized git arg list is built because the guard halts before
  `git add`.
- **[Risk] A genuinely large legitimate change with `maxStagedFiles` raised into the tens of
  thousands could approach OS `ARG_MAX` on `git add -A -- <stagePaths>`.** → **Mitigation**: the
  default 2000 keeps the arg list ≈100 KB, well within `ARG_MAX` (≥1 MB). Raising the limit into the
  tens of thousands is an explicit, pathological operator choice; `git add` pathspec batching is a
  future refinement if it ever bites. The default path and the incident path are both safe.
- **[Risk] Exclusion granularity is bounded by enumeration.** With `--untracked-files=all`, patterns
  match individual files, so whole-artifact-dir patterns (`.cargo-tmp/**`, `vendor/**`) and file-level
  patterns both work. → **Mitigation**: none needed; per-file enumeration is strictly more precise
  than the collapsed-dir alternative. Documented semantics in `docs/configuration.md` use the simple
  glob rules (no full-glob claims).
- **[Risk] Two glob matchers (`globMatch`, `matchesGlob`) now live in one file.** → **Mitigation**:
  documented as a behavior-preserving relocation with a follow-up note; merging is out of scope and
  would risk pinned semantics.
- **[Risk] Behavior change for guarded steps whose worktree legitimately contained untracked scratch
  that used to be committed silently.** → **Mitigation**: intended. Without exclusion configured,
  small scratch (< limit) still commits exactly as before (default exclude is empty, default limit is
  2000); only implausibly large sets halt, which is the desired safety.

## Open Questions

None. All design forks were resolved in the request's "architect 評価済みの設計判断". The
`--untracked-files=all` enumeration (D5) is the mechanism required to give requirement 3 real teeth
against git's directory-collapsing; it follows necessarily from the motivating incident and adds no
git calls to the guarded sequence.

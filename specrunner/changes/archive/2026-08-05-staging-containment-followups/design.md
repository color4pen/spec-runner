# Design: staging containment follow-ups — staged byte-size guard + artifact hygiene discipline

## Context

Guarded write steps (`implementer`, `build-fixer`, `code-fixer`, `test-materialize`, `adr-gen`)
cannot enumerate their outputs in advance, so `commitAndPush` stages the whole post-exclusion
worktree diff for them. The prior change (`2026-08-01-guarded-staging-artifact-containment`) added
two teeth to that path: repo-declared exclusion (`pipeline.stagingExcludePatterns`) and a fail-closed
file-count guard (`pipeline.maxStagedFiles`, default 2000) that halts before commit when the
post-exclusion **count** is implausibly large. The guarded branch lives in
`src/core/step/commit-push.ts:583-687`: `git status --untracked-files=all` → enumerate `changedPaths`
→ `findWriteScopeViolations` → `applyStagingExclusions` → **file-count guard** → `git add -A --
<stagePaths>` → whole-index `git diff --cached --quiet` → `git commit -- <stagePaths>` → egress check
→ `pushOnly`.

**The two remaining gaps.**

1. **Count is not the only path to the unrecoverable failure.** The real incident's failure mode is
   "a giant pack fails `git push` with HTTP 400 and the pipeline has no recovery." That endpoint is
   reached by total *bytes*, not only file count. A small number of very large files (e.g. 100 files
   × 50 MB of binaries) passes the file-count guard yet produces the same oversized pack. Push-side
   rescue (bigger `http.postBuffer`, stronger retry) is explicitly unwanted because it would make the
   oversized-pack push *succeed* — turning an accident into a "successful" bad outcome. Since a
   pre-commit halt is the only defense, the threshold must also exist in bytes.

2. **The upstream source is unguarded by discipline.** If the agent never drops build artifacts /
   scratch files into the worktree, the guard never has to fire. Today no producer prompt says
   anything about where build outputs and scratch files belong; the shared `COMMIT_DISCIPLINE`
   fragment (`src/prompts/fragments.ts:16-20`) only prohibits git operations. A build step that
   writes generated output under the repo root surfaces it as untracked mass that guarded staging
   then sweeps up.

Both are follow-ups to the same containment design and are closed by the same two-layer shape as the
prior change: a mechanical guard (the teeth) plus a prompt-level discipline (source suppression).

### Verified current-code facts

- `src/core/step/commit-push.ts:615-631` — after exclusion, the file-count guard compares
  `stagePaths.length` to `resolveMaxStagedFiles(deps.config)` and, on excess, throws
  `stagingLimitExceededError(step.name, branch, stagePaths.length, limit,
  summarizeTopDirectories(stagePaths))` **before** any `git add`. This is the mirror point for the
  byte guard.
- `src/core/step/commit-push.ts:588` — the guarded enumeration already uses `--untracked-files=all`,
  so `changedPaths` (and therefore `stagePaths`) are individual files; measuring per-path byte size
  by `lstat` is well-defined.
- `getWorktreeChangedPaths` (`:113-170`) returns paths only (status codes are consumed internally,
  no size). Byte size must be obtained separately via the filesystem, not from `git status`.
- `src/core/step/commit-push.ts:1-2` already imports `node:fs/promises` (`access`, `mkdir`,
  `writeFile`, `readFile`) and `node:path` (`join as pathJoin`); adding `lstat` needs no new
  dependency. `CommitPushInfra` (`:45-59`) already carries injectable `spawnFn` / `sleepFn`, the
  established seam for test injection.
- `pushOnly` (`:912-934`) retries once (5 s) with no HTTP-400 / pack-size special handling and throws
  `pushFailedError` on double failure. There is no post-pack recovery path — confirming the
  pre-commit halt is the only defense (Non-Goal: push changes).
- `src/errors.ts:526-550` — `stagingLimitExceededError` (code `STAGING_LIMIT_EXCEEDED`,
  `ERROR_CODES` entry at `:134`) is a `SpecRunnerError` with a hint + detailed message and is
  deliberately **not** in `EXIT_CODE_MAP` (`:19`), so it halts via the pipeline escalation path. The
  byte error mirrors this exactly.
- `src/config/schema/types.ts:257-262` — `PipelineConfig` carries `stagingExcludePatterns` and
  `maxStagedFiles`. `src/config/schema/validation.ts:247-252` validates `maxStagedFiles` with
  `optional(number(...).check(int(...), gte(1, ...)))`; `number`, `int`, `gte` are already imported.
  This positive-integer pattern is the mirror for `maxStagedBytes`.
- `src/core/step/staging-containment.ts` — `DEFAULT_MAX_STAGED_FILES = 2000`,
  `resolveMaxStagedFiles` (`:53-59`), and `summarizeTopDirectories` (`:82-99`, first-segment
  aggregation, count-desc / name-asc, `topN` slice) are the mirror targets for the byte equivalents.
- `src/prompts/fragments.ts:16-20` — `COMMIT_DISCIPLINE` is a shared fragment composed via
  `buildSystemPrompt` into six producer prompts: `implementer`, `build-fixer`, `code-fixer`,
  `test-materialize`, `spec-fixer`, `adr-gen` (verified by import/usage grep). Editing the fragment
  once reaches all of them; the three named guarded producers (`implementer` / `build-fixer` /
  `code-fixer`) are a subset.
- `src/prompts/__tests__/coverage-gate-prohibition.test.ts` — the established prompt-contract test
  style: `expect(SYSTEM_PROMPT).toContain("...")` on the composed prompt. The artifact-hygiene test
  mirrors this.
- Existing guarded-staging integration tests (`commit-push-guarded-staging.test.ts`) drive
  `commitAndPush` with a positional fake `SpawnFn` and a fake cwd (`/tmp/fake-repo-...`). They do not
  set `statFn`; with the default real-`fs.lstat` probe every fake path resolves ENOENT → 0 bytes →
  total 0 → under the 50 MiB default → no byte halt. So they stay green unmodified (Risks).

## Goals / Non-Goals

**Goals**:

- Add `pipeline.maxStagedBytes?: number` (default `52428800` = 50 MiB). In guarded staging, after
  exclusion and independently of the file-count guard, measure the total worktree byte size of
  `stagePaths` and halt (escalation) before `git add` when it exceeds the threshold.
- Measure by `lstat` per staged path against the worktree cwd. Delete-pending (not-in-worktree) paths
  contribute 0. Non-`ENOENT` measurement errors fail-closed (no fail-open).
- Raise a distinct `STAGED_BYTES_LIMIT_EXCEEDED` typed error mirroring `stagingLimitExceededError`
  (total, threshold, per-directory size breakdown, both remedies), on the same escalation path (not
  in `EXIT_CODE_MAP`).
- Validate `maxStagedBytes` (positive integer → else `CONFIG_INVALID`) and document it beside
  `maxStagedFiles`.
- Extend the shared `COMMIT_DISCIPLINE` fragment with generated-artifact / scratch-file hygiene so all
  producer prompts inherit it from one edit.

**Non-Goals**:

- No push-path change (`http.postBuffer`, retry strength, HTTP-400 special-casing). Making the
  oversized pack push succeed is the accident's success-ification, not its fix.
- No pack-splitting or other post-pack recovery.
- No guard on scoped staging (declared-output pathspec branch).
- No change to `maxStagedFiles` / `stagingExcludePatterns` behavior or defaults, and no change to the
  file-count guard's judgement, error, or message.
- No compressed-pack (post-`git add`) size measurement — that requires writing the objects the guard
  exists to prevent.

## Decisions

### D1: Byte-size guard mirrors the file-count guard — same point, same escalation, independent condition

Add a byte guard immediately after the existing file-count guard in the guarded branch (post-exclusion,
pre-`git add`). It resolves `pipeline.maxStagedBytes` (default `52428800`), measures the total byte
size of `stagePaths`, and throws `STAGED_BYTES_LIMIT_EXCEEDED` on excess. The two guards are
independent: the file-count check keeps its exact current behavior and runs first; the byte check runs
next; exceeding **either** halts. The file-count guard remains the only halt for the count class; the
byte guard is the only halt for the size class; a set can trip one without the other (the motivating
"few huge files" case trips bytes, not count).

- **Rationale**: pack size is reached by bytes as well as count; a pre-commit halt is the sole defense
  because push has no recovery path. Placing the check before `git add` means the oversized set never
  becomes a pack. Mirroring the existing guard keeps the escalation surface and operator mental model
  identical.
- **Alternatives considered**:
  - *Measure the compressed pack size after `git add`* — **rejected**: the objects the guard exists to
    stop would already be written to the object store; only a pre-`add` measurement prevents that.
    `lstat` on the worktree is the only value available before `add`.
  - *Extend the file-count guard to also carry bytes (single combined error)* — **rejected**: the
    request requires the two guards be independent and the file-count behavior unchanged; a combined
    error would change the file-count error's shape and message.

### D2: Uncompressed `lstat` bytes, conservative on the safe side

Measure uncompressed byte size via `lstat` per staged path. Uncompressed size overestimates the pack
(which is delta-compressed), so the guard trips *earlier* than the true pack size would — it errs
toward halting, which is the safe direction for a fail-closed containment. `lstat` (not `stat`) is
used so symlinks are measured as the link entry and are not followed (no target inflation, no loop).

- **Rationale**: the only value obtainable before `git add` is the on-disk file size; over-estimating
  pack size means the guard never lets an oversized pack through, and false-early halts are operator-
  actionable (raise the limit or exclude). Precision is not the goal; a fail-closed ceiling is.
- **Alternatives considered**: *`stat` (follow symlinks)* — **rejected**: could inflate on a symlink
  to a large target or loop; the staged bytes are what git packs, and git packs the link, not the
  target.

### D3: Measurement degradation rule — delete-pending → 0, other errors → fail-closed

For each staged path, `lstat(join(cwd, path))`. Classify the result:

- success → contribute `stat.size`.
- error with `code === "ENOENT"` → the path is not in the worktree (a delete-pending entry that
  `git status` enumerated). Contribute `0`. This is the only benign miss.
- any other error → **do not** treat as 0 and **do not** skip the guard. Propagate so the guarded
  staging halts fail-closed before commit (surfaced as a `commitEffectFailedError("stage", …)`), never
  fail-open.

- **Rationale**: a delete-pending path legitimately has no worktree bytes, so 0 is correct and must
  not misfire the guard. Every other measurement failure is an unknown; silently zeroing it would open
  a fail-open hole (an unreadable huge file could slip the guard). Fail-closed on the unknown matches
  the containment's fail-closed posture.
- **Alternatives considered**: *treat every `lstat` failure as 0* — **rejected**: fail-open; a
  measurement error on a real large file would bypass the guard. *Infer deletion from the `git status`
  status code instead of ENOENT* — **rejected**: the request specifies measurement by `lstat` and
  "not in worktree → 0"; the ENOENT signal is exactly "not in worktree" and needs no status-code
  plumbing.

### D4: Distinct escalation error with a size breakdown

Add `STAGED_BYTES_LIMIT_EXCEEDED` to `ERROR_CODES` (near `STAGING_LIMIT_EXCEEDED`) and a factory
`stagedBytesLimitExceededError(stepName, branch, totalBytes, limitBytes, topDirs)` shaped like
`stagingLimitExceededError` (hint + detailed message). The size breakdown is produced by a new pure
`summarizeTopDirectoriesBySize(entries, topN)` that mirrors `summarizeTopDirectories` but aggregates
**bytes** per first-level directory (bytes-desc, name-asc ties, `topN` slice). The message carries the
total bytes, the threshold, the top directories by size, and both remedies (declare
`stagingExcludePatterns` / add to `.gitignore`; or raise `maxStagedBytes`). It is **not** added to
`EXIT_CODE_MAP` — like the file-count error it halts via the pipeline escalation path and is preserved
by `makeCommitFailHalt`.

- **Rationale**: a distinct code makes the size class independently diagnosable and testable, and a
  size (not count) breakdown points the operator at the actual offenders (a single huge file dominates
  by bytes even when it is one of few files).
- **Alternatives considered**: *reuse `STAGING_LIMIT_EXCEEDED`* — **rejected**: conflates two
  independent conditions, and a count-oriented message would misdescribe a byte breach.

### D5: Injectable size probe on `CommitPushInfra`; pure measurement in `staging-containment.ts`

Add an optional `statFn?: (absPath: string) => Promise<{ size: number }>` to `CommitPushInfra`,
defaulting (when undefined) to a thin `fs.lstat` wrapper in `commit-push.ts`. The measurement itself is
a pure, injected-I/O function `measureStagedBytes(paths, cwd, probe)` in `staging-containment.ts` that
joins `cwd` + path, calls the probe, applies the D3 classification, and returns
`{ totalBytes, entries: Array<{ path, bytes }> }`. `commit-push.ts` calls it with `infra.statFn ??
defaultProbe`.

- **Rationale**: mirrors the existing `spawnFn` injection seam so the integration tests can program
  file sizes (and error/ENOENT behavior) without touching the filesystem — the same positional-fake
  discipline the existing guarded-staging tests use. Keeping the classification in a pure function
  makes D3 directly unit-testable. The executor's `CommitPushInfra` construction
  (`executor.ts:102`) needs no change because the field is optional and defaults in `commit-push.ts`.
- **Alternatives considered**: *measure with real temp files in tests* — **rejected**: diverges from
  the established fake-spawn test style and couples unit tests to the filesystem. *Put `measureStagedBytes`
  in `commit-push.ts`* — **rejected**: it belongs with the other resolvers/summarizers in
  `staging-containment.ts`; only a stdlib `node:path` import is added (no runtime dependency).

### D6: Config validation + docs mirror the file-count field

In `PipelineConfig` add `maxStagedBytes?: number` with a doc string; in the `pipeline` validation
schema add `maxStagedBytes: optional(number(...).check(int(...), gte(1, ...)))` (identical to
`maxStagedFiles`). `0`, negative, and non-integer surface as `CONFIG_INVALID` via the existing
`throwFromFirstIssue`. Omitting the field validates (default applies at runtime, not the config layer,
matching `resolveMaxStagedFiles`). Document `maxStagedBytes` in the Guarded staging section of
`docs/configuration.md` beside `maxStagedFiles`, stating default `52428800`, guarded-steps-only scope,
and that measurement is uncompressed bytes.

- **Rationale**: symmetry with the established field; invalid config fails at load, not at the guard.

### D7: Artifact-hygiene discipline in the shared `COMMIT_DISCIPLINE` fragment

Extend `COMMIT_DISCIPLINE` (`src/prompts/fragments.ts`) with a generated-artifact / scratch-file
hygiene clause: do not emit build outputs, generated artifacts, or scratch files into locations that
become tracked/staged; when a build's output location is fixed inside the repo, confirm it is
`.gitignore`d and, if not, include the `.gitignore` addition in the change; place temporary files in
already-ignored locations. Because all producer prompts compose this one fragment, the discipline
reaches `implementer` / `build-fixer` / `code-fixer` (and the other producers) from a single edit.

- **Rationale**: the machine guard is the teeth; the prompt is source suppression (a producer that
  never drops artifacts never trips the guard). The request names the shared fragment as the single
  point; that also (harmlessly) covers `test-materialize` / `adr-gen` / `spec-fixer`, which are other
  producers for whom the rule is either applicable or inert.
- **Alternatives considered**: *per-prompt duplication* — **rejected**: three-plus copies drift;
  the shared fragment is the single source of truth (same pattern as `COVERAGE_GATE_INTEGRITY`).
  *Prompt discipline only, no guard* — **rejected** (request): agents narrow instructions under
  pressure; the machine guard must be primary.

## Risks / Trade-offs

- **[Risk] Adding real `fs.lstat` calls to the guarded path could slow the hot path or touch the
  filesystem in unit tests.** → **Mitigation**: measurement runs once per guarded commit over the
  already-enumerated `stagePaths`; `lstat` is cheap. Unit/integration tests inject `statFn` and never
  hit the disk. Existing guarded-staging tests leave `statFn` unset; the default probe ENOENTs on the
  fake cwd (→ 0 bytes) so they stay green unmodified.
- **[Risk] Uncompressed measurement overestimates the pack, so a legitimate large change could halt
  earlier than a pack-size check would.** → **Mitigation**: intended (fail-closed, safe side). The
  50 MiB default is far above any plausible legitimate uncompressed source change; a genuine large
  change raises `maxStagedBytes` or excludes the artifact, exactly as with `maxStagedFiles`.
- **[Risk] Fail-closed on non-ENOENT measurement errors could halt a run on a transient filesystem
  error.** → **Mitigation**: the alternative (fail-open) is worse — it would silently bypass the guard
  on the exact large-file case it exists to stop. A halt is diagnosable and re-runnable; a bypass ships
  the accident.
- **[Risk] The `COMMIT_DISCIPLINE` edit also reaches `test-materialize` / `spec-fixer` / `adr-gen`,
  not just the three named steps.** → **Mitigation**: intended and harmless — those are producers too;
  the rule is beneficial where builds run and inert where they do not (`spec-fixer` writes only
  spec.md). The request explicitly chose the shared fragment as the single effect point.
- **[Risk] Behavior change for guarded steps whose worktree legitimately held large-but-intended
  untracked files.** → **Mitigation**: only sets whose post-exclusion total exceeds 50 MiB halt; the
  default file-count and exclusion behavior is unchanged, and the remedy (exclude or raise the limit)
  is named in the error.

## Open Questions

None. All design forks are resolved by the request's "architect 評価済みの設計判断" (pre-add
fail-closed mirror; uncompressed `lstat`; no push changes; guard-primary / prompt-secondary). The
independence of the two guards and the ENOENT-vs-error degradation rule follow directly from the
acceptance criteria.

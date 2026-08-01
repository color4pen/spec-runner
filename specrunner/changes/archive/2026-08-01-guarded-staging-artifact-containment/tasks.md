# Tasks: guarded staging build-artifact containment — exclude patterns + volume guard

<!-- Implementer: read specrunner/changes/guarded-staging-artifact-containment/design.md and spec.md first.
     HARD CONSTRAINTS:
     - Do NOT add any runtime dependency (no glob library). Verify package.json / lockfile unchanged.
     - Do NOT change the scoped staging path (commit-push.ts scoped branch) or scoped enumeration.
     - Do NOT modify .specrunner/config.json.
     - Do NOT add a git call to the guarded commit sequence (status → add → diff --cached --quiet →
       commit → rev-parse → rev-list → push). Exclusion + volume guard add NO git calls; the volume
       guard checks the enumeration count BEFORE `git add`. Existing tests
       (commit-push-egress-invariant.test.ts, commit-scoped-paths.test.ts) MUST stay green unmodified.
     - Do NOT merge/rename `globMatch` or `matchGlob`; only relocate `matchesGlob` (behavior-preserving). -->

## T-01: Relocate `matchesGlob` to the shared glob util

- [x] In `src/util/glob-match.ts`, add `export function matchesGlob(filePath: string, pattern: string):
      boolean` — the body moved verbatim from `src/core/step/bite-evidence/test-file-selection.ts:51-84`
      (anchored-RegExp translation: `**/`→`(?:.*/)?`, `**`→`.*`, `*`→`[^/]*`, other chars regex-escaped
      incl. literal `.`). Keep its doc comment. Do NOT modify the existing `globMatch` function; add a
      short note that `matchesGlob` coexists as a behavior-preserving relocation and that unifying the
      matchers is out of scope.
- [x] In `src/core/step/bite-evidence/test-file-selection.ts`: remove the local `matchesGlob`
      definition; add `import { matchesGlob } from "../../../util/glob-match.js";` and
      `export { matchesGlob };` (re-export so existing imports of `matchesGlob` from
      `./test-file-selection.js` keep working). `selectMaterializedTestFiles` continues to call
      `matchesGlob` via the imported binding. Do NOT change `DEFAULT_SCOPED_TEST_PATTERNS`,
      `isExcludedPath`, `resolveScopedTestPatterns`, or `selectMaterializedTestFiles` behavior.

**Acceptance Criteria**:
- `src/util/glob-match.ts` contains exactly one `function matchesGlob` definition; `test-file-selection.ts`
  contains no local `function matchesGlob` body and re-exports it.
- Existing `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts` passes unmodified
  (its `matchesGlob("foo.test.ts", "**/*.test.*")` etc. cases resolve through the re-export).
- `typecheck` passes.

## T-02: Add the pure guarded-staging containment module

- [x] Create `src/core/step/staging-containment.ts` (leaf; imports only `matchesGlob` from
      `../../util/glob-match.js` and the `SpecRunnerConfig` type). Export:
  - `export const DEFAULT_MAX_STAGED_FILES = 2000`.
  - `export function resolveStagingExcludePatterns(config: SpecRunnerConfig | undefined): string[]` —
    return a copy of `config?.pipeline?.stagingExcludePatterns` when it is a non-empty array, else `[]`.
  - `export function resolveMaxStagedFiles(config: SpecRunnerConfig | undefined): number` —
    return `config?.pipeline?.maxStagedFiles` when it is a positive integer, else `DEFAULT_MAX_STAGED_FILES`.
  - `export function applyStagingExclusions(paths: string[], excludePatterns: string[]): string[]` —
    `paths.filter((p) => !excludePatterns.some((pat) => matchesGlob(p, pat)))` (empty patterns → return
    all paths unchanged).
  - `export function summarizeTopDirectories(paths: string[], topN = 10): Array<{ dir: string; count:
    number }>` — group paths by their first segment (the substring before the first `/`; a path with no
    `/` is grouped under `"."`), count per group, sort by count descending (ties: dir name ascending),
    return the first `topN`.

**Acceptance Criteria**:
- `applyStagingExclusions(["a/.cargo-tmp/x", "vendor/y", "src/lib.rs"], ["**/.cargo-tmp/**",
  ".cargo-tmp/**", "vendor/**"])` returns `["src/lib.rs"]`; with `[]` patterns returns the input unchanged.
- `resolveMaxStagedFiles({})` and `resolveMaxStagedFiles(undefined)` return `2000`;
  `resolveMaxStagedFiles({ pipeline: { maxStagedFiles: 5000 } })` returns `5000`.
- `resolveStagingExcludePatterns` returns `[]` when the field is absent and a copy of the array when present.
- `summarizeTopDirectories` aggregates by first segment and returns counts sorted descending.
- Module imports `matchesGlob` from a specifier ending in `glob-match.js`; `typecheck` passes.

## T-03: Add unit tests for the containment module

- [x] Add `src/core/step/__tests__/staging-containment.test.ts` covering: exclusion filtering
      (artifact trees removed, real files kept; empty patterns → identity); `resolveMaxStagedFiles`
      default vs configured; `resolveStagingExcludePatterns` absent vs present; `summarizeTopDirectories`
      grouping / ordering / `topN` truncation; and a few direct `matchesGlob` cases proving the shared
      import behaves (`**/` prefix, `*` non-crossing, dir-prefix `vendor/**`).

**Acceptance Criteria**:
- All spec.md "exclusion" and "volume guard aggregation" behaviors that are pure (filtering, counting,
  summarizing, resolving defaults) are pinned and green.

## T-04: Add the `STAGING_LIMIT_EXCEEDED` error code and factory

- [x] In `src/errors.ts`, add `STAGING_LIMIT_EXCEEDED: "STAGING_LIMIT_EXCEEDED"` to `ERROR_CODES`
      (near `WRITE_SCOPE_VIOLATION`).
- [x] Add `export function stagingLimitExceededError(stepName: string, branch: string, total: number,
      limit: number, topDirs: Array<{ dir: string; count: number }>): SpecRunnerError` — code
      `STAGING_LIMIT_EXCEEDED`; message states the total (`total`) exceeds `limit`, lists `topDirs` as
      `  - <dir>: <count>` lines, and names both exits: "既知の一時資材なら pipeline.stagingExcludePatterns
      か対象 repo の .gitignore に追加。正当な大変更なら pipeline.maxStagedFiles を引き上げてください。"
      Follow the shape of `writeScopeViolationError` (hint + detailed message). Do NOT add
      `STAGING_LIMIT_EXCEEDED` to `EXIT_CODE_MAP` (it halts via the pipeline, not a CLI exit override).

**Acceptance Criteria**:
- `stagingLimitExceededError("implementer", "b", 48000, 2000, [{dir:".cargo-tmp",count:24000}]).code ===
  "STAGING_LIMIT_EXCEEDED"` and its message contains `48000`, `2000`, `.cargo-tmp`, `24000`, and both
  remedy hints. `typecheck` passes.

## T-05: Wire exclusion + volume guard into the guarded branch of `commitAndPush`

- [x] In `src/core/step/commit-push.ts`, extend `getWorktreeChangedPaths` (`:106`) with a new parameter
      `untrackedMode: "normal" | "all" = "normal"`; when `"all"`, append `"--untracked-files=all"` to the
      `git status` args. Leave all other behavior identical. Do NOT change the two scoped-mode call sites
      (they keep the default `"normal"`).
- [x] In the guarded branch (`:572-652`):
  1. Call `getWorktreeChangedPaths(infra.spawnFn, cwd, false, "all")` for the enumeration (per D5) so
     `changedPaths` reflects individual untracked files.
  2. Keep `findWriteScopeViolations(step.name, slug, changedPaths, declaredWritePaths)` on the FULL
     `changedPaths` (unchanged; before exclusion) — per D3.
  3. After the violation check passes, compute
     `const excludePatterns = resolveStagingExcludePatterns(deps.config);` and
     `const stagePaths = applyStagingExclusions(changedPaths, excludePatterns);`.
  4. Volume guard, BEFORE `git add`: `const limit = resolveMaxStagedFiles(deps.config); if
     (stagePaths.length > limit) throw stagingLimitExceededError(step.name, branch, stagePaths.length,
     limit, summarizeTopDirectories(stagePaths));`.
  5. Replace the staging + commit pathspec from `changedPaths` to `stagePaths`: `git add -A -- <stagePaths>`
     (skip when `stagePaths.length === 0`), and `git commit -m … -- <stagePaths>`. Preserve the existing
     whole-index `git diff --cached --quiet` check and the "empty enumeration → fail closed" invariant,
     keyed off `stagePaths` (i.e. the fail-closed throw guards `stagePaths.length === 0` when staged
     changes are nonetheless present).
- [x] Import `resolveStagingExcludePatterns`, `resolveMaxStagedFiles`, `applyStagingExclusions`,
      `summarizeTopDirectories` from `./staging-containment.js` and `stagingLimitExceededError` from
      `../../errors.js`. Do NOT touch the scoped branch.

**Acceptance Criteria**:
- The guarded git-call SEQUENCE is unchanged (no added git call): status → add → diff --cached --quiet →
  commit → rev-parse → (rev-parse) → rev-list → push. Only the `git status` args (guarded) gain
  `--untracked-files=all`, and the add/commit pathspec is `stagePaths`.
- `deps.config` with no `pipeline` block → empty exclusions, limit 2000 → legacy behavior.
- `typecheck` passes; existing `commit-push-egress-invariant.test.ts` (TC-002 / TC-017 guarded) and
  `commit-scoped-paths.test.ts` pass unmodified.

## T-06: Integration tests for guarded exclusion + volume guard

- [x] Add `src/core/step/__tests__/commit-push-guarded-staging.test.ts` using the positional fake
      `SpawnFn` pattern from `commit-push-egress-invariant.test.ts` (record `calls`, canned responses).
      Drive `commitAndPush` with a guarded step and cover:
  - **Exclusion (configured)**: status stdout lists `.cargo-tmp/…`, `vendor/…`, and `src/lib.rs`;
    `deps.config.pipeline.stagingExcludePatterns` set → assert the `git add` call's pathspec includes
    `src/lib.rs` and excludes every `.cargo-tmp/`/`vendor/` path; commit + push proceed.
  - **Exclusion (unset)**: same status, no patterns → assert `git add` pathspec includes all paths.
  - **Scope-bypass**: status stdout includes an undeclared change to `specrunner/changes/<slug>/design.md`;
    `stagingExcludePatterns: ["specrunner/changes/**"]` → assert rejects with
    `{ code: "WRITE_SCOPE_VIOLATION" }` and that `subcommands` contains neither `commit` nor `push`.
  - **Volume guard (over)**: status stdout lists > `maxStagedFiles` files (use a small
    `maxStagedFiles`, e.g. 3, and ≥4 files) → assert rejects with `{ code: "STAGING_LIMIT_EXCEEDED" }`,
    the message contains the total and a top-directory breakdown, and `subcommands` contains neither
    `add` nor `commit` nor `push`.
  - **Volume guard (under)**: files ≤ `maxStagedFiles` → commit + push proceed.
  - **Composite**: full set > limit but exclusion removes the artifact trees so survivors ≤ limit →
    no halt; `git add` pathspec is the survivors.
- [x] Assert the guarded `git status` call includes `--untracked-files=all` in at least one case.

**Acceptance Criteria**:
- All spec.md scenarios (exclusion configured/unset, scope-bypass halt, volume over/under, composite)
  are pinned and green. No existing test is modified.

## T-07: Structural test — single shared `matchesGlob`

- [x] Add `src/core/step/__tests__/shared-glob-match-imports.test.ts` that reads the source text of
      `src/core/step/bite-evidence/test-file-selection.ts` and `src/core/step/staging-containment.ts` and
      asserts: both reference `matchesGlob` from a module specifier ending in `glob-match.js` (import or
      re-export); neither contains a local `function matchesGlob` definition body; and
      `src/util/glob-match.ts` contains the single `function matchesGlob` definition.

**Acceptance Criteria**:
- The test fails if either consumer stops importing `matchesGlob` from the shared util or reintroduces a
  local body. Green in the implemented state.

## T-08: Add `pipeline.stagingExcludePatterns` and `pipeline.maxStagedFiles` to the config type + schema

- [x] In `src/config/schema/types.ts`, extend `PipelineConfig` (`:236-247`) with:
  - `stagingExcludePatterns?: string[];` — doc: "Glob patterns removed from the GUARDED staging set
    (implementer / build-fixer / code-fixer / test-materialize / adr-gen). Matched paths are not staged
    and remain in the worktree. Absent = no exclusions (the target repo's .gitignore is the first line of
    defense). Uses the shared bounded glob matcher (`**/`, `*`, literal others). No effect on scoped steps."
  - `maxStagedFiles?: number;` — doc: "Fail-closed guard: max post-exclusion file count a GUARDED step may
    stage. Exceeding it halts (escalation) before commit. Default 2000. No effect on scoped steps."
- [x] In `src/config/schema/validation.ts`, in the `pipeline` object schema (`:205-244`), add:
  - `stagingExcludePatterns: optional(array(nonEmptyString("must be a non-empty string."), "must be an
    array.").check(minLength(1, "must be a non-empty array.")))` (mirror `scopedTestPatterns` at
    `:271-276`; `array`, `nonEmptyString`, `minLength` already imported/defined).
  - `maxStagedFiles: optional(number("must be a positive integer.").check(int("must be a positive
    integer."), gte(1, "must be a positive integer.")))` (mirror `specReview.pollIntervalMs` at
    `:195-200`; `number`, `int`, `gte` already imported).
- [x] Do NOT edit `.specrunner/config.json`.

**Acceptance Criteria**:
- `pipeline.stagingExcludePatterns: []`, an empty-string element, or a non-string element throws with
  `code: "CONFIG_INVALID"`.
- `pipeline.maxStagedFiles: 0`, negative, or non-integer throws with `code: "CONFIG_INVALID"`.
- Valid `{ pipeline: { stagingExcludePatterns: ["vendor/**"], maxStagedFiles: 5000 } }` validates and is
  preserved; a config omitting both validates unchanged (no default injected at the config layer).
- `typecheck` passes.

## T-09: Config validation tests

- [x] Add `src/config/__tests__/staging-config-validation.test.ts` (mirror the style of
      `verification-scoped-patterns.test.ts`) asserting on `err.code === "CONFIG_INVALID"` for: empty
      array, empty-string element, non-string element (`stagingExcludePatterns`); `0`, negative, and
      non-integer (`maxStagedFiles`). Add positive cases: valid values preserved; both fields omitted →
      validates unchanged.

**Acceptance Criteria**:
- All spec.md config-validation scenarios are pinned and green.

## T-10: Document both settings in `docs/configuration.md`

- [x] In `docs/configuration.md` under `## Pipeline` (`:361`), add rows/subsection for
      `pipeline.stagingExcludePatterns` (default `[]` / absent; purpose: exclude known scratch artifacts
      from guarded staging; matched paths stay in the worktree; guarded steps only; uses simple glob
      rules `**/`, `*`) and `pipeline.maxStagedFiles` (default `2000`; purpose: fail-closed halt before
      commit when the post-exclusion guarded stage count exceeds it; guarded steps only). State
      explicitly that both affect GUARDED steps only (implementer / build-fixer / code-fixer /
      test-materialize / adr-gen) and not scoped steps, and that the target repo's `.gitignore` is the
      first line of defense. Note array-replacement-on-deep-merge for `stagingExcludePatterns` (consistent
      with the existing `forbiddenSurfaces` note).

**Acceptance Criteria**:
- `docs/configuration.md` documents both settings' purpose, default, and guarded-only scope. No other
  section is broken.

## T-11: Full verification and dependency guard

- [x] Run `bun run typecheck` and `bun run test`; both green.
- [x] Confirm `git diff` shows NO change to `package.json` / lockfile (no new runtime dependency),
      NO change to `.specrunner/config.json`, and NO change to the scoped branch of `commit-push.ts`
      or to `src/core/reviewers/glob-match.ts` / `src/util/glob-match.ts`'s `globMatch` body.

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes (all existing tests unmodified).
- No new runtime dependency; `.specrunner/config.json` unchanged; scoped staging unchanged.

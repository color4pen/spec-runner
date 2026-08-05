# Tasks: staging containment follow-ups — staged byte-size guard + artifact hygiene discipline

<!-- Implementer: read specrunner/changes/staging-containment-followups/design.md and spec.md first.
     HARD CONSTRAINTS:
     - Do NOT add any runtime dependency. `node:fs/promises` (lstat) and `node:path` (join) are stdlib.
       Verify package.json / lockfile are unchanged.
     - Do NOT change the SCOPED branch of commit-push.ts, nor scoped enumeration, nor commitScopedPaths.
     - Do NOT change the FILE-COUNT guard's judgement point, default (2000), error code
       (STAGING_LIMIT_EXCEEDED), or message. Do NOT change stagingExcludePatterns behavior.
     - Do NOT change the push path (pushOnly / postBuffer / retry / HTTP-400 handling).
     - Do NOT add or remove any git call in the guarded commit sequence
       (status → add → diff --cached --quiet → commit → rev-parse → rev-list → push). The byte guard
       adds NO git call; it lstat's the worktree BEFORE `git add` and halts on excess.
     - Do NOT modify any EXISTING test file. Add NEW test files only. Existing guarded-staging tests
       (commit-push-guarded-staging.test.ts, staging-containment.test.ts,
       staging-config-validation.test.ts) MUST stay green unmodified.
     - Do NOT edit .specrunner/config.json. -->

## T-01: Add byte-size resolver, size summarizer, and measurement to `staging-containment.ts`

- [x] In `src/core/step/staging-containment.ts` add `export const DEFAULT_MAX_STAGED_BYTES = 52_428_800;`
      (50 MiB) with a doc comment: default max post-exclusion total worktree byte size a GUARDED step may
      stage; exceeding it halts before commit.
- [x] Add `export function resolveMaxStagedBytes(config: SpecRunnerConfig | undefined): number` — return
      `config?.pipeline?.maxStagedBytes` when it is a positive integer (`typeof === "number"`,
      `Number.isInteger`, `> 0`), else `DEFAULT_MAX_STAGED_BYTES`. Exact mirror of `resolveMaxStagedFiles`
      (`:53-59`).
- [x] Add `export type StagedPathSizeProbe = (absPath: string) => Promise<{ size: number }>;` — an
      injected lstat-like probe. It resolves with the entry's byte `size`, and rejects with an error whose
      `.code === "ENOENT"` when the path is absent (delete-pending / not in worktree).
- [x] Add `export interface StagedSizeEntry { path: string; bytes: number; }` and
      `export async function measureStagedBytes(paths: string[], cwd: string, probe: StagedPathSizeProbe):
      Promise<{ totalBytes: number; entries: StagedSizeEntry[] }>`. For each `p`: call
      `probe(pathJoin(cwd, p))`; on success contribute `size`; on error with `code === "ENOENT"` contribute
      `0`; on any OTHER error, rethrow (fail-closed — do NOT swallow, do NOT count as 0). Accumulate
      `totalBytes` and push `{ path: p, bytes }` per path. Import `join as pathJoin` from `node:path`
      (stdlib; update the leaf-module doc note to mention it).
- [x] Add `export function summarizeTopDirectoriesBySize(entries: Array<{ path: string; bytes: number }>,
      topN = 10): Array<{ dir: string; bytes: number }>` — group by first path segment (substring before
      the first `/`; no `/` → `"."`), SUM bytes per group, sort by bytes descending (ties: dir name
      ascending), return the first `topN`. Mirror of `summarizeTopDirectories` (`:82-99`) but summing bytes
      instead of counting.

**Acceptance Criteria**:
- `DEFAULT_MAX_STAGED_BYTES === 52428800`.
- `resolveMaxStagedBytes(undefined)`, `resolveMaxStagedBytes({})`, and a pipeline block without the field
  all return `52428800`; `resolveMaxStagedBytes({ pipeline: { maxStagedBytes: 104857600 } })` returns
  `104857600`.
- `measureStagedBytes` with a probe returning fixed sizes sums them; a probe that rejects with
  `{ code: "ENOENT" }` for a path contributes `0`; a probe that rejects with a non-ENOENT error causes
  `measureStagedBytes` to reject.
- `summarizeTopDirectoriesBySize([{path:"vendor/a",bytes:30},{path:"vendor/b",bytes:10},
  {path:"src/x",bytes:5}])` returns `[{dir:"vendor",bytes:40},{dir:"src",bytes:5}]`.
- `typecheck` passes; no new runtime dependency.

## T-02: Add the `STAGED_BYTES_LIMIT_EXCEEDED` error code and factory

- [x] In `src/errors.ts`, add `STAGED_BYTES_LIMIT_EXCEEDED: "STAGED_BYTES_LIMIT_EXCEEDED"` to
      `ERROR_CODES` immediately after `STAGING_LIMIT_EXCEEDED` (`:134`).
- [x] Add `export function stagedBytesLimitExceededError(stepName: string, branch: string, totalBytes:
      number, limitBytes: number, topDirs: Array<{ dir: string; bytes: number }>): SpecRunnerError` shaped
      like `stagingLimitExceededError` (`:532-550`): a hint naming BOTH remedies — "既知の一時資材なら
      pipeline.stagingExcludePatterns か対象 repo の .gitignore に追加。正当な大変更なら
      pipeline.maxStagedBytes を引き上げてください。" — and a detailed message that states `totalBytes`
      exceeds `limitBytes` and lists `topDirs` as `  - <dir>: <bytes>` lines under a "Top directories by
      size" header. Code `STAGED_BYTES_LIMIT_EXCEEDED`. Do NOT add it to `EXIT_CODE_MAP` (it halts via the
      pipeline escalation path, like the file-count error — add the same `Not added to EXIT_CODE_MAP` doc
      note).

**Acceptance Criteria**:
- `stagedBytesLimitExceededError("implementer","b",73400320,52428800,[{dir:"assets",bytes:73400320}]).code
  === "STAGED_BYTES_LIMIT_EXCEEDED"`.
- Its `message + hint` contains the total (`73400320`), the threshold (`52428800`), the top-directory name
  (`assets`) with its bytes, and both remedy tokens (`stagingExcludePatterns` or `.gitignore`, and
  `maxStagedBytes`).
- `STAGED_BYTES_LIMIT_EXCEEDED` is absent from `EXIT_CODE_MAP`. `typecheck` passes.

## T-03: Wire the byte guard + injectable probe into the guarded branch of `commitAndPush`

- [x] In `src/core/step/commit-push.ts`, add `lstat as fsLstat` to the existing `node:fs/promises` import
      (`:1`). Add a module-level `async function defaultStagedPathSizeProbe(absPath: string): Promise<{ size:
      number }> { const st = await fsLstat(absPath); return { size: st.size }; }` (fs.lstat rejects ENOENT
      with `code:"ENOENT"`, which `measureStagedBytes` classifies as delete-pending → 0).
- [x] Extend `CommitPushInfra` (`:45-59`) with an OPTIONAL `statFn?: StagedPathSizeProbe;` field, documented
      as the injectable worktree size probe for the guarded byte guard (defaults to `fs.lstat`). Import
      `StagedPathSizeProbe` from `./staging-containment.js`. Do NOT make it required — `executor.ts:102`
      must keep compiling unchanged.
- [x] Import `resolveMaxStagedBytes`, `measureStagedBytes`, `summarizeTopDirectoriesBySize` from
      `./staging-containment.js` and `stagedBytesLimitExceededError` from `../../errors.js`.
- [x] In the guarded branch, IMMEDIATELY AFTER the existing file-count guard (`:622-631`, i.e. after the
      `stagingLimitExceededError` block) and BEFORE the `git add` block (`:639`), add the byte guard:
  1. `const byteLimit = resolveMaxStagedBytes(deps.config);`
  2. `const probe = infra.statFn ?? defaultStagedPathSizeProbe;`
  3. Measure fail-closed on measurement error:
     `let measured; try { measured = await measureStagedBytes(stagePaths, cwd, probe); } catch (err) { throw
     commitEffectFailedError(step.name, branch, "stage", \`staged byte measurement failed: ${err instanceof
     Error ? err.message : String(err)}\`); }`
  4. `if (measured.totalBytes > byteLimit) { throw stagedBytesLimitExceededError(step.name, branch,
     measured.totalBytes, byteLimit, summarizeTopDirectoriesBySize(measured.entries)); }`
- [x] Do NOT touch the scoped branch, the file-count guard, or any git call. The byte guard runs entirely
      on `lstat` before `git add`.

**Acceptance Criteria**:
- The guarded git-call SEQUENCE is unchanged (no git call added): status → add → diff --cached --quiet →
  commit → rev-parse → (rev-parse) → rev-list → push. The byte guard adds only `lstat` reads before add.
- The two guards are independent and evaluated in order: file-count first (unchanged), byte second; either
  excess halts before add/commit/push.
- `deps.config` with no `pipeline` block → default 50 MiB limit; a probe that ENOENTs on the fake cwd
  yields total 0 → no byte halt → legacy behavior preserved.
- `executor.ts` compiles with no change (statFn optional). `typecheck` passes; existing
  `commit-push-guarded-staging.test.ts`, `commit-push-egress-invariant.test.ts`, and
  `commit-scoped-paths.test.ts` pass UNMODIFIED.

## T-04: Add `pipeline.maxStagedBytes` to the config type + validation schema

- [x] In `src/config/schema/types.ts`, add to `PipelineConfig` (after `maxStagedFiles`, `:262`):
      `maxStagedBytes?: number;` with doc: "Fail-closed guard: max post-exclusion total worktree byte size
      (uncompressed, via lstat) a GUARDED step may stage. Exceeding it halts (escalation) before commit.
      Default 52428800 (50 MiB). Independent of maxStagedFiles. No effect on scoped steps."
- [x] In `src/config/schema/validation.ts`, in the `pipeline` object schema, add after the `maxStagedFiles`
      entry (`:247-252`): `maxStagedBytes: optional(number("must be a positive integer.").check(int("must be
      a positive integer."), gte(1, "must be a positive integer.")))` — identical to `maxStagedFiles`.
      `number`, `int`, `gte`, `optional` are already imported.
- [x] Do NOT edit `.specrunner/config.json`.

**Acceptance Criteria**:
- `pipeline.maxStagedBytes: 0`, negative, or non-integer throws with `code: "CONFIG_INVALID"`.
- Valid `{ pipeline: { maxStagedBytes: 104857600 } }` validates and is preserved; a config omitting the
  field validates unchanged (no default injected at the config layer); `maxStagedFiles` /
  `stagingExcludePatterns` remain unaffected.
- `typecheck` passes.

## T-05: Extend the shared `COMMIT_DISCIPLINE` fragment with generated-artifact hygiene

- [x] In `src/prompts/fragments.ts`, extend `COMMIT_DISCIPLINE` (`:16-20`) with a generated-artifact /
      scratch-file hygiene clause (keep the existing git-operation prohibition intact). The clause MUST
      state, in the existing Japanese register:
  - build 出力・生成物・scratch ファイルを、tracked / staged 対象になる場所へ出力しない。
  - build の出力先が repo 内に固定されている場合は `.gitignore` で ignore されていることを確認し、
    ignore されていなければ `.gitignore` への追記を変更に含める。
  - 一時ファイルは既に ignore 済みの場所に置く。
- [x] Do NOT edit the individual producer prompt files — the fragment is composed into all producer system
      prompts (`implementer` / `build-fixer` / `code-fixer` / `test-materialize` / `spec-fixer` / `adr-gen`)
      via `buildSystemPrompt`, so one edit reaches all of them.

**Acceptance Criteria**:
- `COMMIT_DISCIPLINE` retains its `git operations` prohibition AND adds the artifact-hygiene clause naming
  build outputs / generated artifacts / scratch files and `.gitignore`.
- No individual `*-system.ts` prompt file is edited; the discipline appears in the composed
  `IMPLEMENTER_SYSTEM_PROMPT`, `BUILD_FIXER_SYSTEM_PROMPT`, and `CODE_FIXER_SYSTEM_PROMPT`.

## T-06: Unit tests for the byte-size containment helpers (NEW file)

- [x] Add `src/core/step/__tests__/staged-bytes-containment.test.ts` covering (TC IDs in test names):
  - **TC-035**: `DEFAULT_MAX_STAGED_BYTES === 52428800`; `resolveMaxStagedBytes` default (undefined / `{}` /
    empty pipeline) is `52428800`; configured value returned when a positive integer.
  - **TC-036**: `measureStagedBytes` sums present sizes; a probe rejecting with `{ code: "ENOENT" }`
    contributes `0`; a probe rejecting with a non-ENOENT error makes `measureStagedBytes` reject
    (fail-closed).
  - **TC-037**: `summarizeTopDirectoriesBySize` groups by first segment, sums bytes, sorts bytes-desc with
    name-asc ties, and truncates to `topN`.
  - **TC-034 (unit)**: `stagedBytesLimitExceededError` message/hint contains total, threshold, a size
    breakdown, and both remedy tokens (`stagingExcludePatterns`/`.gitignore` and `maxStagedBytes`); its
    `code === "STAGED_BYTES_LIMIT_EXCEEDED"`.

**Acceptance Criteria**:
- All pure byte behaviors (resolver default/configured, measurement summation + ENOENT-zero + fail-closed,
  size summarization, error message content) are pinned and green.

## T-07: Integration tests for the guarded byte guard (NEW file)

- [x] Add `src/core/step/__tests__/commit-push-staged-bytes-guard.test.ts`, reusing the positional fake
      `SpawnFn` + guarded-step harness pattern from `commit-push-guarded-staging.test.ts` (copy the helpers
      into the new file; do NOT import from or modify the existing test). Extend the infra helper to set
      `statFn` (a map/function from absolute path → size, or a thrower). Drive `commitAndPush` with a
      guarded step and cover:
  - **TC-030 (over-byte, file count under)**: status lists a few files whose count is ≤ `maxStagedFiles`
    (leave `maxStagedFiles` at default or set high) but whose injected sizes sum over a small
    `maxStagedBytes` → assert rejects with `{ code: "STAGED_BYTES_LIMIT_EXCEEDED" }` and that
    `subcommands` contains NEITHER `add` NOR `commit` NOR `push` (destructive confirmation, TC-004 shape).
  - **TC-031 (under-byte)**: sizes sum ≤ `maxStagedBytes` (and count ≤ `maxStagedFiles`) → commit + push
    proceed.
  - **TC-032 (delete-pending → 0)**: status includes a delete-pending path (probe throws `ENOENT` for it)
    plus present files whose sizes sum ≤ `maxStagedBytes` → guard does NOT fire; commit + push proceed.
  - **TC-033 (measurement failure → fail-closed)**: probe throws a non-ENOENT error for a path → assert the
    step halts (rejects) and `subcommands` contains NEITHER `add` NOR `commit` NOR `push`.
  - **TC-042 (message)**: over-byte case → the thrown error message contains the total bytes, the
    threshold, and a size breakdown.
  - **TC-041 (independence)**: a set with count ≤ `maxStagedFiles` and bytes > `maxStagedBytes` halts on
    bytes (`STAGED_BYTES_LIMIT_EXCEEDED`), proving the byte guard fires where the file-count guard would
    not.

**Acceptance Criteria**:
- All byte-guard spec scenarios (over/under, delete-pending zero, measurement fail-closed, message content,
  independence) are pinned and green. No existing test file is modified.

## T-08: Config validation tests for `maxStagedBytes` (NEW file)

- [x] Add `src/config/__tests__/staged-bytes-config-validation.test.ts` (mirror
      `staging-config-validation.test.ts` style; do NOT modify that file) asserting `err.code ===
      "CONFIG_INVALID"` for `pipeline.maxStagedBytes` of `0`, `-1`, and `1.5`; and positive cases: a valid
      value (e.g. `104857600`) is preserved, an omitted field validates unchanged, and `maxStagedFiles` /
      `stagingExcludePatterns` are unaffected when set alongside.
  - **TC-038**: invalid values → `CONFIG_INVALID`.
  - **TC-039**: valid preserved / omitted → undefined (no default injected at the config layer).

**Acceptance Criteria**:
- All `maxStagedBytes` validation scenarios are pinned and green.

## T-09: Prompt-contract test for artifact-hygiene discipline (NEW file)

- [x] Add `src/prompts/__tests__/artifact-hygiene-discipline.test.ts` (mirror
      `coverage-gate-prohibition.test.ts` style) asserting:
  - **TC-040**: `COMMIT_DISCIPLINE` (imported from `../fragments.js`) contains the artifact-hygiene wording
    (e.g. references to 生成物 / scratch / `.gitignore`) AND still contains the existing `git operations`
    prohibition (`git add` / `git commit` / `git push` 禁止).
  - `IMPLEMENTER_SYSTEM_PROMPT`, `BUILD_FIXER_SYSTEM_PROMPT`, and `CODE_FIXER_SYSTEM_PROMPT` each contain the
    artifact-hygiene wording (verifying the shared fragment composed through).

**Acceptance Criteria**:
- The test fails if the artifact-hygiene clause is removed from `COMMIT_DISCIPLINE` or stops composing into
  the three named producer prompts. Green in the implemented state.

## T-10: Document `maxStagedBytes` in `docs/configuration.md`

- [x] In `docs/configuration.md`, in the "Guarded staging containment" section (`:411-438`), add a
      `**pipeline.maxStagedBytes**` paragraph beside `maxStagedFiles`: fail-closed guard that halts before
      commit when the post-exclusion total worktree byte size (uncompressed, measured via lstat) exceeds the
      limit; default `52428800` (50 MiB); independent of `maxStagedFiles` (either excess halts); guarded
      steps only; error names the same two remedies (exclude / `.gitignore`, or raise `maxStagedBytes`). Add
      a row to the settings table with default `52428800`. Update the JSONC example to optionally include
      `maxStagedBytes`.

**Acceptance Criteria**:
- `docs/configuration.md` documents `maxStagedBytes` (purpose, default `52428800`, uncompressed-lstat
  measurement, independence from `maxStagedFiles`, guarded-only scope). No other section is broken.

## T-11: Full verification and regression / dependency guard

- [x] Run `bun run typecheck` and `bun run test`; both green.
- [x] Confirm `git diff` shows NO change to `package.json` / lockfile (no new runtime dependency), NO change
      to `.specrunner/config.json`, NO change to the SCOPED branch of `commit-push.ts`, and NO change to the
      file-count guard's judgement / default / error / message.
- [x] Confirm the existing guarded-staging test suite (`commit-push-guarded-staging.test.ts` TC-001..TC-020,
      `staging-containment.test.ts` TC-010..TC-019, `staging-config-validation.test.ts` TC-007..TC-008) is
      green UNMODIFIED.

**Acceptance Criteria**:
- `bun run typecheck` passes; `bun run test` passes with all pre-existing tests unmodified.
- No new runtime dependency; `.specrunner/config.json` unchanged; scoped staging and the file-count guard
  unchanged.

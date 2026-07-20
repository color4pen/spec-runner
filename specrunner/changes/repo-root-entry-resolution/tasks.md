# Tasks: CLI repo-root resolution unified at entry

Verified against the current tree during design (file:line references are current).
Acceptance-criteria IDs T1–T7 refer to the request's acceptance criteria.

## T-01: Introduce CommandContext + dispatch-time single repo-root resolution

- [ ] Add `src/cli/command-context.ts` exporting:
  - `interface CommandContext { repoRoot: string | null; invokerCwd: string }`
  - `async function buildCommandContext(invokerCwd: string, resolveFn?: (cwd: string) => Promise<string | null>): Promise<CommandContext>`
    (defaults `resolveFn` to `resolveRepoRoot` from `src/util/repo-root.ts`; injectable
    for tests). Only `src/util/*` may be imported (keeps cli → leaf edge legal).
- [ ] In `src/cli/command-registry.ts`:
  - Add `requiresRepo?: boolean` to `CommandDef` (default `false`).
  - Change `CommandDef.handler` to
    `(parsed: ParsedArgs, ctx: CommandContext) => Promise<void>` and import
    `CommandContext` from `command-context.ts`. Do NOT edit handlers that ignore
    `ctx` (fewer-parameter functions remain assignable).
- [ ] In `bin/specrunner.ts`, in BOTH dispatch branches (subcommand path and normal
  command path), after `parseFlags` and after the existing worktree guard, and
  before invoking the handler:
  - Build `ctx = await buildCommandContext(process.cwd())`.
  - If `def.requiresRepo && ctx.repoRoot === null`, throw/print the unified
    repo-required error (T-02 factory) and exit non-zero; otherwise call
    `handler(parsed, ctx)`.
  - Keep resolution AFTER the `--help`/`--version` short-circuits and AFTER the
    worktree guard so existing ordering/tests are unchanged.
- [ ] Add `repoRequiredError(command: string)` to `src/errors.ts` using the existing
  `NOT_GIT_REPO` code (exit 2), with a hint prescribing `git init` or `cd` into a
  repository, then re-run.

**Acceptance Criteria**:
- `typecheck` passes with the new handler signature; unchanged handlers compile
  without edits.
- A dispatch-level test (via the `import("../../../bin/specrunner.js").main()` harness
  used in `tests/unit/cli/specrunner-worktree-guard.test.ts`, injecting a resolver /
  mocking `resolveRepoRoot` to return `null`) shows a `requiresRepo: true` command
  exits non-zero with the unified error out of a repo; a `requiresRepo: false`
  command proceeds. (supports T3-outside branch)
- `buildCommandContext` unit test: given an injected resolver returning a root, the
  returned `repoRoot` equals it and `invokerCwd` equals the passed cwd.

## T-02: Convert `request new` to repo-root base

- [ ] Mark the `request new` subcommand `requiresRepo: true`.
- [ ] Change `command-registry.ts:334` to pass `ctx.repoRoot` (guaranteed non-null by
  `requiresRepo`) into `executeNew(slug, requestType, ctx.repoRoot)`; add a call-site
  comment noting the base is the repo root. Do not change `executeNew` /
  `request/store.ts`.

**Acceptance Criteria** (T3):
- New test: from a subdirectory of a fixture git repo, driving `request new <slug>`
  through dispatch creates `<repo-root>/specrunner/drafts/<slug>/request.md` and
  creates NO `specrunner/` tree under the subdirectory.
- Mutation check documented: reverting the call site to `process.cwd()` makes the
  subdir test create the nested structure and fail.
- `tests/unit/core/command/request-new.test.ts` remains unchanged and green (it calls
  `executeNew` directly with a base directory).

## T-03: Convert `job stats` to repo-root base

- [ ] Mark the `job stats` subcommand `requiresRepo: true`.
- [ ] Change `command-registry.ts:683` to `runJobStats({ cwd: ctx.repoRoot, json })`
  (option key stays `cwd`; the supplied value is now the repo root). Do not change
  `runJobStats`. The in-command specrunner-worktree guard keeps inspecting the
  supplied base (D5 — worktree semantics preserved).

**Acceptance Criteria** (T2):
- New test: a fixture git repo with archived runs under
  `specrunner/changes/archive/`; driving `job stats --json` from a subdirectory and
  from the repo root yields the identical run set.
- Mutation check documented: reverting the call site to `process.cwd()` makes the
  subdir run report `0 runs` and fail the equivalence.
- `tests/unit/core/command/job-stats.test.ts` remains unchanged and green (it calls
  `runJobStats({ cwd })` directly).

## T-04: doctor — carry repo root in DoctorContext; checks use root; repo-optional

- [ ] `src/core/doctor/types.ts`: add `repoRoot?: string | null` to `DoctorContext`
  (optional so existing check mocks keep compiling).
- [ ] `src/cli/doctor.ts` `runDoctor`:
  - Signature `runDoctor(opts: { json: boolean; repoRoot?: string | null; invokerCwd?: string })`.
  - `invokerCwd = opts.invokerCwd ?? process.cwd()`;
    `repoRoot = opts.repoRoot !== undefined ? opts.repoRoot : await resolveRepoRoot(invokerCwd)`.
  - Set `ctx.cwd = invokerCwd` and `ctx.repoRoot = repoRoot`.
  - Reuse `repoRoot` for the config-error path (replace the duplicate
    `resolveRepoRoot(process.cwd())` at line 114).
- [ ] `doctor` handler in `command-registry.ts`: keep `requiresRepo: false`; pass
  `{ json, repoRoot: ctx.repoRoot, invokerCwd: ctx.invokerCwd }` into `runDoctor`.
- [ ] Update the 9 repo/storage checks to derive their base from
  `ctx.repoRoot ?? ctx.cwd` instead of `ctx.cwd`:
  - `repo/git-repository.ts` (fail-message base only),
    `repo/specrunner-project-md.ts`, `repo/workflow-structure.ts`
  - `storage/local-state-writable.ts`, `storage/legacy-jobs-dir.ts`,
    `storage/orphan-sidecars.ts`, `storage/journal-integrity.ts` (`repoRoot:` arg),
    `storage/orphan-worktrees.ts` (`repoRoot:` arg at line 39)
  - `runtime/package-manager.ts` (`detectPackageManager(base, ctx.fs)`)

**Acceptance Criteria** (T1, T6):
- New test (T1): build two `DoctorContext`s that differ only in `cwd`
  (subdir vs root) but both with `repoRoot` set to the root, over a fixture fs where
  `specrunner/` exists under the root but not the subdir; run the repo + storage
  checks via `runChecks`; assert the `(name, status, message)` results are identical.
- Mutation check (T1 破壊確認): reverting the checks to use `ctx.cwd` directly makes
  the subdir-context results differ from the root-context results → the test fails.
- New test (T6): `runDoctor` with `repoRoot: null` (outside a repo) completes without
  throwing and the `git-repository` check reports `fail`.
- Existing doctor tests (`tests/core/doctor/doctor-cli.test.ts`, all
  `src/core/doctor/checks/**` tests) remain green (they call `runDoctor({ json })` /
  build mock contexts without `repoRoot`).

## T-05: Tooth — process.cwd() allowlist ratchet over src/

- [ ] Add a `CWD` invariant `describe` block to
  `tests/unit/architecture/core-invariants.test.ts`:
  - `grepE("process\\.cwd\\(\\)", "src")`, parse, exclude `__tests__/` and `.test.ts`
    and comment lines (reuse existing helpers), filter through
    `ARCH_ALLOWLIST.filter(e => e.invariant === "CWD")`, assert violations `[]`.
  - Liveness: assert raw non-comment/non-test match count > 0.
  - T-04-style regression guard: a synthetic `process.cwd()` match in a
    non-allowlisted `src/` file is detected; a synthetic match covered by a `CWD`
    entry is suppressed.
- [ ] Seed `tests/unit/architecture/arch-allowlist.ts` with a `CWD` section
  containing one entry per current non-comment, non-test `process.cwd()` occurrence in
  `src/`, EXCLUDING the two converted sites (`command-registry.ts:334`,
  `command-registry.ts:683`) and the removed `doctor.ts:114`. Classify each entry's
  comment as permanent-legit (role a / role b / DI default) or debt (un-converted).
  Use the appendix below; drive completeness from the failing test output.

**Acceptance Criteria** (T5):
- With the seed complete, the `CWD` invariant test passes (no violations, liveness > 0).
- Regression guard: adding a `process.cwd()` to a `src/` file not covered by the
  allowlist makes the invariant test fail; a covered occurrence does not.
- No new `process.cwd()` remains at the converted sites (`command-registry.ts:334`,
  `command-registry.ts:683`, `doctor.ts:114`) — they are not present in the seed.

## T-06: request validate relative-path regression guard

- [ ] No code change (role (b) at `command-registry.ts:381` is preserved). Add the
  test below to pin the behavior.

**Acceptance Criteria** (T4):
- New test: from a subdirectory of a fixture git repo containing a valid request file
  at `<subdir>/foo.md`, driving `request validate foo.md` through dispatch resolves
  the argument against the invoker cwd (`<subdir>/foo.md`) and exits 0; the argument
  is NOT resolved against the repo root.

## T-07: Full verification

- [ ] Run `typecheck && test`.

**Acceptance Criteria** (T7):
- `typecheck` is clean.
- The whole suite is green. The only expected test-expectation changes are those whose
  cwd-vs-repo-root semantics this change intentionally alters (doctor / job stats /
  request new subdir behavior); all other existing tests pass unchanged.

---

## Appendix: CWD allowlist seed (obtained from `grep -rEn 'process\.cwd\(\)' src`)

Exclude comments, `__tests__/`, `.test.ts`. Exclude the converted sites
(`command-registry.ts:334`, `command-registry.ts:683`, `doctor.ts:114`). Within one
file, identical line content collapses to a single (file, pattern) entry.

**Permanent-legit — role (a): repo-root discovery origin / degradation**
- `src/util/repo-root.ts` — `cwd ?? process.cwd()`
- `src/cli/load-config-with-overlay.ts` — `resolveRepoRoot(cwd ?? process.cwd())`
- `src/cli/init.ts` — `["rev-parse", "--show-toplevel"], { cwd: process.cwd() }`
- `src/cli/job-show.ts` — `(await resolveRepoRoot()) ?? process.cwd()` and
  `repoRoot: string = process.cwd()`
- `src/cli/ps.ts` — `?? (await resolveRepoRoot()) ?? process.cwd()`
- `src/cli/doctor.ts` — the `invokerCwd = opts.invokerCwd ?? process.cwd()` default
- `src/git/transport-auth.ts` — `opts.cwd ?? process.cwd()`

**Permanent-legit — role (b): user-supplied relative-path base**
- `src/cli/command-registry.ts` — `path.resolve(process.cwd(), input)` (validate arg)
- `src/cli/command-registry.ts` — `path.resolve(process.cwd(), promptFile)` (prompt-file)
- `src/core/command/request.ts` — `opts?.cwd ?? process.cwd()` (validate cwd)

**Permanent-legit — dependency-injection default (`x ?? process.cwd()` / default param)**
- `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/config-effective.ts`
- `src/core/command/pipeline-run.ts`, `src/core/command/resume.ts`
- `src/core/finish/resolve-target.ts`
- `src/core/step/pr-create.ts`, `src/core/step/verification.ts`,
  `src/core/step/step-completion.ts`, `src/core/step/scope-check.ts`,
  `src/core/step/commit-push.ts`, `src/core/step/executor.ts` (lines 253/527),
  `src/core/step/bite-evidence/step.ts`
- `src/core/pipeline/parallel-review-round.ts`
- `src/core/runtime/local.ts` (lines 652/669)
- `src/core/verification/lcov.ts`, `src/core/verification/runner.ts`
- `src/core/credentials/github.ts` (lines 65/105 — `cwd: process.cwd()`)
- `src/adapter/claude-code/query-one-shot.ts`,
  `src/adapter/claude-code/agent-runner.ts`,
  `src/adapter/shared/provider-sdk-loader.ts` (`detectPackageManager(process.cwd())`)

**Debt — un-converted internal-state derivation (follow-up burn-down)**
- `src/cli/command-registry.ts` — `cwd: process.cwd(),` (covers request generate 354,
  resume 562, attach 599, archive 640), `executeList(process.cwd())` (363),
  `storeResolve(process.cwd(), input)` (388),
  `executeRulesNew(..., process.cwd())` (753),
  `executeReviewersNew(name, process.cwd())` (767),
  `showUsage(slug, process.cwd())` (819), `showUsageSummary(process.cwd())` (821)
- `src/config/store.ts` — `path.join(process.cwd(), ".specrunner", "config.json")` (148)
- `src/cli/inbox.ts` — `const cwd = process.cwd()` (32)

Note on `src/cli/doctor.ts`: after T-04, lines 114 and 174 no longer call
`process.cwd()` directly (114 reuses the resolved `repoRoot`; 174 uses `invokerCwd`).
The file's only remaining `process.cwd()` is the `invokerCwd = opts.invokerCwd ??
process.cwd()` default, covered by the single permanent role-(a) entry listed above.

# Tasks: Repo root resolved exactly once per invocation

Verified against the current tree during design (file:line references are current).
Acceptance-criteria IDs T1–T5 refer to the request's acceptance criteria.

## T-01: Wire dispatch context + `requiresRepo` into the affected registry handlers

- [x] In `src/cli/command-registry.ts`, switch these handlers to `(parsed, ctx) => …`
  and pass the resolved root into their `runXxx` call (details in T-02/T-03):
  `init`, `inbox run`, `job prune`, `job cancel`, `job attach`, `job resume`, `job ls`,
  `job show`, `config effective`.
- [x] Declare `requiresRepo: true` on: `init`, `inbox` → `run`, `job` → `prune`,
  `job` → `cancel`, `job` → `attach`. Leave `job ls`, `job show`, `job resume`,
  `config effective` repo-optional (no `requiresRepo`).
- [x] Do not touch handlers outside the list above (they keep their current form).

**Acceptance Criteria**:
- `typecheck` passes; unchanged handlers still compile.
- Driving each repo-required command through the dispatch harness (as in
  `tests/unit/cli/job-stats-repo-root.test.ts`) with the resolver mocked to return `null`
  exits non-zero with the unified repo-required error; repo-optional commands proceed.

## T-02: Convert the repo-required handlers (remove re-resolution, use `ctx.repoRoot!`)

- [x] `src/cli/init.ts` `runInit`: add `repoRoot: string` to its options; remove the
  `git rev-parse --show-toplevel` block (`:73-90`) and the now-unused `spawnCommand`
  import; use `options.repoRoot` for `.gitignore` / `specrunner/drafts` /
  `specrunner/changes` scaffolding. Registry `init` handler passes
  `repoRoot: ctx!.repoRoot!`.
- [x] `src/cli/inbox.ts` `runInboxRun`: remove `const cwd = process.cwd()` (`:32`), the
  `resolveRepoRootOrFail` import (`:11`) and its call + error branch (`:44-50`). Use
  `repoRoot = ctx.repoRoot!`; pass it to `runInboxOrchestrator`, to `getOriginInfo`, and
  to `loadConfigWithOverlay(repoRoot, repoRoot)` (pre-resolved seam). Registry handler
  passes `ctx`.
- [x] `src/cli/prune.ts` `runPrune`: add `repoRoot: string` to `RunPruneOptions`; remove
  the dynamic `import` of `resolveRepoRootOrFail` (`:36`) and its call + error branch
  (`:40-46`); use `opts.repoRoot`. Keep the dynamic imports of `pruneOrphanWorktrees` /
  `pruneOrphanSidecars` (they exist for `vi.mock` binding). Registry handler passes
  `repoRoot: ctx!.repoRoot!`.
- [x] `src/cli/cancel.ts` `runCancel`: add `repoRoot?: string` to `RunCancelOptions`
  (optional so TC-020 arg-exclusivity-only callers typecheck without casting); remove the
  `resolveRepoRootOrFail` import and its call + error branch; use `opts.repoRoot` with
  non-null assertions after early returns. Registry handler passes `repoRoot: ctx!.repoRoot!`.
- [x] `src/cli/attach.ts` `runAttach`: add `repoRoot?: string` to `RunAttachOptions`
  (optional, fallback to `opts.cwd`); remove the `resolveRepoRoot` import and the
  `(await resolveRepoRoot(cwd)) ?? cwd` call; use `opts.repoRoot ?? cwd` where the repo
  root is needed. Keep `opts.cwd` for `detectSpecrunnerWorktree`. Registry handler passes
  `repoRoot: ctx!.repoRoot!` and keeps `cwd: process.cwd()`.

**Acceptance Criteria** (T1, supports T5):
- None of `init.ts`, `inbox.ts`, `prune.ts`, `cancel.ts`, `attach.ts` contains
  `resolveRepoRoot`, `resolveRepoRootOrFail`, or `git rev-parse --show-toplevel`.
- Each repo-required command, driven from a subdirectory of a fixture repo with the
  dispatch-resolved root set to the repo root, behaves identically to the root
  invocation; driven outside a repo (resolver → `null`) it exits non-zero with the
  unified error and creates no state.
- Existing direct-call tests are updated only on their injection seam: drop the
  `resolveRepoRoot*` mocks and pass `repoRoot` explicitly
  (`tests/init-git-guard.test.ts`, `tests/init.test.ts`,
  `tests/unit/cli/cancel.test.ts`, `tests/unit/cli/prune-combined.test.ts`,
  `tests/attach/attach-cli.test.ts`); their behavioral assertions are preserved. The
  `init` git-availability gate tests (`TC-002`/`TC-003`, `init.test.ts` anti-regression)
  are relocated to assert the dispatch-level `requiresRepo` behavior.

## T-03: Convert the repo-optional handlers (consume `ctx`, no re-resolution)

- [x] `src/cli/job-show.ts` `runJobShow`: add optional `opts?: { repoRoot?: string | null }`
  second parameter; remove the `resolveRepoRoot` import and the
  `(await resolveRepoRoot()) ?? process.cwd()` call; use `opts?.repoRoot ?? ""` as
  graceful degradation. Registry `job show` handler passes
  `{ repoRoot: ctx?.repoRoot ?? ctx?.invokerCwd }`.
- [x] `src/cli/config-effective.ts` `runConfigEffective`: add `repoRoot?: string | null`
  to `RunConfigEffectiveOptions` alongside deprecated `cwd?: string` (backward compat);
  remove the `resolveRepoRoot` import and its call; forward
  `options.repoRoot ?? options.cwd ?? undefined` to `loadConfigWithSourceMetadata`.
  Registry handler passes `repoRoot: ctx?.repoRoot`.
- [x] `src/cli/ps.ts`: left `:87` unchanged (DI-fallback). Registry `job ls` handler
  passes `repoRoot: ctx!.repoRoot ?? ctx!.invokerCwd` into `runPs` so production never
  hits the internal `resolveRepoRoot` fallback.
- [x] `job resume` threading for `bootstrap`:
  - `src/cli/resume.ts`: add `repoRoot?: string | null` to `ResumeOptions`; in
    `runResumeCore` forward `options.repoRoot ?? null` to `bootstrap`. Keep
    `cwd = options.cwd ?? process.cwd()` (allowlisted DI default).
  - `src/cli/bootstrap.ts`: add `repoRoot: string | null = null` third parameter; remove
    the `resolveRepoRoot` import and its call; use `loadConfig(repoRoot ?? undefined)`.
  - Registry `job resume` handler passes `repoRoot: ctx?.repoRoot` into `runResume`.

**Acceptance Criteria** (T1, supports T5):
- None of `job-show.ts`, `config-effective.ts`, `bootstrap.ts` contains
  `resolveRepoRoot`. `ps.ts` retains it only at `:87`.
- `job show`, `job ls`, and `config effective` driven from a subdirectory (dispatch root
  = repo root) match the root invocation; driven outside a repo they degrade without
  throwing.
- Injection-seam updates only: `tests/unit/cli/job-show.test.ts` passes `repoRoot`
  instead of patching git spawn; `tests/unit/cli/config-effective.test.ts` passes
  `repoRoot` instead of `cwd`; `tests/unit/cli/ps-filter.test.ts` and resume tests keep
  their behavioral assertions.

## T-04: Exactly-once tooth (grep invariant + fixed DI-fallback allowlist)

- [x] Add `RESOLVE_REPO_ROOT_ALLOWED_FILES = ["src/cli/command-context.ts",
  "src/cli/doctor.ts", "src/cli/load-config-with-overlay.ts", "src/cli/ps.ts"]` as a
  dedicated named export in `tests/unit/architecture/arch-allowlist.ts` (separate from
  `ARCH_ALLOWLIST`), with a governance comment: fixed structural carve-out, CODEOWNERS-gated.
- [x] Add a `describe` block to `tests/unit/architecture/core-invariants.test.ts`
  (reuse `grepE` / `parseGrepOutput` / `isCommentLine`):
  - Confinement: `grepE("resolveRepoRoot", "src/cli")`, exclude `__tests__/` / `.test.ts`
    / comment lines; assert every remaining match's file is in
    `RESOLVE_REPO_ROOT_ALLOWED_FILES`; violations `[]`.
  - No direct git resolution: `grepE("show-toplevel", "src/cli")` (non-test, non-comment)
    is empty.
  - Liveness: raw non-comment `resolveRepoRoot` match count in `src/cli/` > 0.
  - Regression guard: a synthetic match in `src/cli/inbox.ts` is flagged; a synthetic
    match in `src/cli/ps.ts` is suppressed.

**Acceptance Criteria** (T2):
- With T-02/T-03 complete, the exactly-once invariant passes (no violations, liveness > 0,
  `show-toplevel` empty).
- 破壊確認: re-adding a `resolveRepoRoot*` call to any converted handler (e.g.
  `src/cli/inbox.ts` or `src/cli/cancel.ts`) makes the confinement assertion fail; a
  `git rev-parse --show-toplevel` added to any `src/cli/` file makes the
  no-direct-resolution assertion fail.

## T-05: CWD allowlist burn-down (delete-only)

- [x] Remove these `CWD` entries from `tests/unit/architecture/arch-allowlist.ts`:
  `CWD-init-git-spawn`, `CWD-job-show-root-resolve`, `CWD-inbox-debt`,
  `CWD-config-effective-di-default`. Do not add any entry. Keep `CWD-ps-root-resolve` and
  `CWD-job-show-print-default`.
- [x] Update the CWD section comment (`arch-allowlist.ts:229-244`) if it enumerates a
  now-removed site.

**Acceptance Criteria** (T3):
- The four entries are gone; no `CWD` entry is added; the total `CWD` entry count strictly
  decreases.
- The CWD invariant (`core-invariants.test.ts`, `T-05`, `TC-010`) still reports no
  un-allowlisted `process.cwd()` in `src/` (code + entry removed in lockstep) and liveness
  (`TC-018`) stays > 0.

## T-06: Make the CWD-ratchet identifier unique in the ADR

- [x] In `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md`, replace the
  four `B-13` references (`:76`, `:78`, `:152`, `:168`) with the CWD ratchet's established
  identifier (the `CWD` invariant / test describe `CWD invariant … (T-05)`). Do not change
  the decision text, mechanism, or alternatives. Do not touch `architecture/model.md` or
  any StepExecutor `B-13` reference.

**Acceptance Criteria** (T4):
- `grep -n "B-13" specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md` returns
  no matches.
- Repository-wide, `B-13` appears only in the StepExecutor single-writer context
  (`architecture/model.md:91`, `architecture/domain-model.md`, `src/core/step/**`,
  `tests/unit/architecture/core-invariants.test.ts:1001` etc.) — none in a CWD context.

## T-07: Contract tests — subdir equivalence + repo-required unified error

- [x] Add/extend contract tests so each converted command has: (a) a subdir-equals-root
  equivalence test driven through the dispatch harness (mock the resolver to the repo
  root, run from repo root and from a subdir, assert identical observable result); (b) for
  repo-required commands, an outside-repo test (resolver → `null`) asserting the unified
  error + no state created; (c) a documented mutation check per D3/D2 (reverting to the
  invoker cwd / re-adding re-resolution changes the result).
- [x] Cover: `init`, `inbox run`, `job prune`, `job cancel`, `job attach` (repo-required);
  `job show`, `job ls`, `config effective` (subdir equivalence).
  (Tests were written by the test-materialize step; injection seams updated here.)

**Acceptance Criteria** (T1):
- Each converted command's subdir invocation equals its root invocation.
- Each repo-required command's outside-repo invocation stops with the unified error and
  creates no state.
- Mutation checks are documented and demonstrably red when the conversion is reverted.

## T-08: Full verification

- [x] Run `typecheck && test`.

**Acceptance Criteria** (T5):
- `typecheck` is clean and the whole suite is green.
- The only test changes are the intended injection-seam / behavior updates for the
  converted commands (init gate relocation, cancel/prune/attach/config-effective/job-show
  injection paths, resume threading); all other existing tests pass unchanged.

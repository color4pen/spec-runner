# Tasks: post-merge-integrity-check

## T-01: Add `archive.postMergeVerify` to config schema and validation

- [ ] Add `postMergeVerify?: ShellCommand[]` to the `ArchiveConfig` interface in
      `src/config/schema.ts` with a doc comment: an ordered list of `ShellCommand` run
      (fail-fast) on the merged base after `job archive --with-merge` squash-merges; absent
      or empty = no integrity check (backward compatible).
- [ ] In `configSchema`'s `archive` object, add `postMergeVerify: optional(array(shellCommandSchema, "must be an array."))`,
      reusing the existing `shellCommandSchema` (do not introduce a new command schema).

**Acceptance Criteria**:
- A valid `archive.postMergeVerify` array of `ShellCommand` (strings and/or `{ name?, run }`) passes validation.
- A non-array value throws `CONFIG_INVALID`.
- An array element that is an empty string, or an object without a non-empty `run`, throws `CONFIG_INVALID`.
- Absent key validates successfully (backward compatible).

## T-02: Create the post-merge integrity check module

- [ ] Create `src/core/archive/post-merge-integrity.ts` exporting
      `runPostMergeIntegrityCheck(input): Promise<{ ok: true } | { ok: false; escalation: string }>`
      where `input` is `{ slug: string; cwd: string; baseBranch: string; commands: ShellCommand[];
      spawn: SpawnFn; githubToken?: string; prNumber: number }`.
- [ ] Normalize `commands` locally (string → `{ name: undefined, run }`; object → as-is) — a small
      inline helper; do not import from `src/core/verification/` (keep archive self-contained).
- [ ] Wrap the injected `spawn` with `createTransportAuth({ token: githubToken, cwd }).wrapSpawn(spawn)`
      (`src/git/transport-auth.ts`) so `git fetch` authenticates on private HTTPS repos.
- [ ] `git fetch origin <baseBranch>` in `cwd`; then resolve the merge SHA via
      `git rev-parse origin/<baseBranch>` (used for both attribution and the checkout ref).
- [ ] Create an ephemeral detached worktree at the merge SHA via
      `git worktree add --detach <integrityPath> <mergeSha>` where `integrityPath` is a non-colliding
      path under `.git/specrunner-worktrees/` (e.g. `integrity-<slug>-<sha8>`).
- [ ] Run each normalized command via `spawn("sh", ["-c", cmd.run], { cwd: integrityPath })` in array
      order, fail-fast (stop at the first non-zero exit); capture the failing command's label, exit code,
      and combined stdout+stderr.
- [ ] Always remove the worktree in a `finally`: `git worktree remove --force <integrityPath>` then
      `git worktree prune` (best-effort; warn via `stderrWrite` on failure, do not throw).
- [ ] Infrastructure failures (fetch, rev-parse, worktree add) → `stderrWrite` a warning that the base
      branch was NOT verified (with the reason) and return `{ ok: true }` (do not escalate, do not
      falsely claim pass — the warning is the honest signal).
- [ ] On a non-zero command exit → return `{ ok: false, escalation }` built with `formatEscalation`
      (`src/core/finish/escalation.ts`):
      - `failedStep`: `post-merge integrity check (main)`
      - `detectedState`: states PR #`<prNumber>` was MERGED into `<baseBranch>` at merge commit
        `<sha7>`, that this merge failed the integrity check, the failing command label + exit code,
        and the combined command output.
      - `recommendedAction`: explains main is now broken (downstream job workspace setup will fail),
        that the merge is NOT rolled back (irreversible; auto-revert unsafe), and the fix steps
        (checkout `<baseBranch>` → reproduce with the failing command → regenerate lockfile / fix →
        commit to `<baseBranch>` → push to `origin/<baseBranch>`).
      - `resumeCommand`: `specrunner job archive --with-merge <slug>`.
- [ ] Use only the injected `SpawnFn` for subprocesses (no `node:child_process` import) and no direct
      `process.env` access (respect architecture invariants B-12 / B-6).

**Acceptance Criteria**:
- With commands that all exit 0, returns `{ ok: true }` and the worktree add + remove spawns are issued.
- With a command that exits non-zero, returns `{ ok: false, escalation }` whose escalation contains the
  PR number, the merge SHA, the failing command output, and remediation guidance; and no revert/rollback
  git command is spawned.
- When `git fetch` fails, returns `{ ok: true }` with a warning and does not escalate.
- Commands are executed via `sh -c` inside the ephemeral worktree, in order, fail-fast.
- The worktree removal is attempted even when a command fails.

## T-03: Wire the integrity check into `runMergeThenArchive`

- [ ] Add `postMergeVerify?: ShellCommand[]` to `MergeThenArchiveInput` in
      `src/core/archive/merge-then-archive.ts` (import `ShellCommand` from `../../config/schema.js`).
- [ ] Insert the integrity check between Step 5 (squash merge success, after
      `stdoutWrite("PR #... merged successfully.")`) and Step 6 (`runPostMergeCleanup`): only on this
      fresh-merge path. When `postMergeVerify` is non-empty, call `runPostMergeIntegrityCheck({ slug,
      cwd, baseBranch: resolvedBaseBranch, commands: postMergeVerify, spawn, githubToken, prNumber })`.
      On `{ ok: false }` return `{ exitCode: 1, escalation }` WITHOUT running cleanup. On `{ ok: true }`
      continue to Step 6 cleanup.
- [ ] When `postMergeVerify` is empty/undefined, skip the integrity check entirely (do not call the
      module — no fetch/worktree/command).
- [ ] Do NOT invoke the integrity check on the already-merged resume path (Step 2, `~:189`) nor on the
      merged-during-wait path (Step 4, `~:317`); those `runPostMergeCleanup` calls are unchanged.

**Acceptance Criteria**:
- Non-empty `postMergeVerify` + integrity failure → exit code 1 escalation; `runPostMergeCleanup` is not called.
- Non-empty `postMergeVerify` + integrity pass → `runPostMergeCleanup` runs and exit code 0.
- Empty/undefined `postMergeVerify` → integrity module not invoked; existing merge → cleanup flow unchanged.
- The already-merged resume path and merged-during-wait path do not invoke the integrity check.

## T-04: Wire config resolution in the CLI archive command

- [ ] In `src/cli/archive.ts` `--with-merge` block, read `config.archive?.postMergeVerify` alongside the
      existing archive config reads and pass it as `postMergeVerify` into the `runMergeThenArchive` input.
- [ ] In the config-load failure fallback, leave `postMergeVerify` undefined (no integrity check, backward compatible).

**Acceptance Criteria**:
- When `archive.postMergeVerify` is configured, it reaches `runMergeThenArchive`.
- When config load fails, no integrity check is applied and the archive flow still runs.

## T-05: Unit tests for the integrity check module

- [ ] Test `runPostMergeIntegrityCheck` with an injected `SpawnFn` fake covering:
      - all commands exit 0 → `{ ok: true }`; assert `git worktree add --detach` and
        `git worktree remove --force` were spawned, and commands ran via `sh -c` in the worktree in order.
      - a command exits non-zero → `{ ok: false }`; assert the escalation contains the PR number, the
        resolved merge SHA, the failing command output, and remediation text; assert no revert/rollback
        git command was spawned and the merge fact is stated as MERGED.
      - fail-fast: after the first failing command, later commands are not spawned.
      - `git fetch` failure → `{ ok: true }` with a warning; no escalation.
      - worktree removal failure after a passing run → still `{ ok: true }` (best-effort).

**Acceptance Criteria**:
- Tests cover the pass, fail (escalation content), fail-fast, fetch-failure, and cleanup-best-effort scenarios.
- The escalation-content assertions pin PR number, merge SHA, failing output, and remediation presence.

## T-06: Integration tests in `runMergeThenArchive`

- [ ] Extend the merge-then-archive tests (`src/core/archive/__tests__/merge-then-archive.test.ts` and/or
      `tests/unit/core/archive/merge-then-archive.test.ts`) to cover:
      - `postMergeVerify` set + integrity fail → exit code 1 escalation with attribution + failing output +
        remediation; assert `runPostMergeCleanup` is NOT called and the escalation reports MERGED (merged is merged).
      - `postMergeVerify` set + integrity pass → `runPostMergeCleanup` called, exit code 0.
      - `postMergeVerify` unset/empty → integrity module not invoked; existing flow unchanged (existing tests stay green).
- [ ] Prefer mocking the `post-merge-integrity.js` module (as the existing tests mock
      `post-merge-cleanup.js` / `orchestrator.js`) to keep the orchestration test focused on wiring/branching.

**Acceptance Criteria**:
- The four acceptance scenarios (fail→escalation, pass→cleanup, unset→unchanged, merged-reported-honestly) are pinned by tests.
- Existing merge-then-archive tests remain unchanged and green (undeclared config path).

## T-07: Document the config field and verify the build

- [ ] Document `archive.postMergeVerify` in `docs/configuration.md` (purpose, `ShellCommand[]` shape,
      absent/empty = no-op, example `["bun install --frozen-lockfile"]`), consistent with the existing
      `archive.protectedPaths` / `verification.commands` documentation style.
- [ ] Run `bun run typecheck && bun run test` and ensure both are green.

**Acceptance Criteria**:
- `docs/configuration.md` describes `archive.postMergeVerify` and its no-op-when-absent semantics.
- `bun run typecheck` passes.
- `bun run test` passes.

# Tasks: job cancel --restore-draft

## T-01: Add restore-draft logic to cancel runner

- [x] In `src/core/cancel/runner.ts`, add an optional field `restoreDraft?: boolean`
      (default `false`) to the `cancelSingleJob` opts object.
- [x] Add an `info: string[]` accumulator in `cancelSingleJob` alongside the
      existing `warnings: string[]`.
- [x] Add a private helper `restoreDraftFromBranch(state, deps, warnings, info)`:
  - [x] Derive `slug = getJobSlug(state)`; if empty, push a warning ("cannot
        restore draft: slug could not be derived") and return.
  - [x] Resolve the source worktree path via the existing
        `resolveWorktreePathForJob(state, deps.repoRoot)`; if `null`, push a
        warning and return.
  - [x] Build the source path `path.join(worktreePath, requestMdPath(slug))`
        (import `requestMdPath` from `src/util/paths.ts`).
  - [x] Read the source with `fs.readFile(..., "utf-8")`; on any read error
        (e.g. ENOENT), push a warning ("no request.md to restore at <path>") and
        return.
  - [x] Compute the destination `path.join(deps.repoRoot, draftPath(slug))`
        (import `draftPath`). If it already exists (`fs.access` succeeds), push a
        warning ("draft already exists at specrunner/drafts/<slug>/request.md;
        skipping restore") and return — do NOT overwrite.
  - [x] Otherwise write the draft verbatim via
        `request/store.write(deps.repoRoot, slug, content)` (or equivalent
        mkdir+writeFile of the new-format path) and push an info message
        ("Restored draft to specrunner/drafts/<slug>/request.md").
- [x] In `cancelSingleJob`, call `await restoreDraftFromBranch(...)` only when
      `restoreDraft` is truthy, placed AFTER the process-kill block and BEFORE
      `await cleanupJobResources(...)`.
- [x] Include `info` in the returned `CancelResult`
      (`...(info.length > 0 ? { info } : {})`).

**Acceptance Criteria**:
- `cancelSingleJob` with `restoreDraft: true` and a worktree containing
  `changes/<slug>/request.md` writes `drafts/<slug>/request.md` with identical
  content and returns exit 0 with a matching `info` entry.
- `cancelSingleJob` without `restoreDraft` performs zero drafts I/O and produces
  byte-identical results to the pre-change implementation.
- An existing destination `request.md` is preserved; a warning is returned and
  exit code is unchanged.
- A missing/unreadable source or empty slug yields a warning + skip and never
  throws.
- Restore is invoked before `cleanupJobResources` (worktree still present at
  read time).

## T-02: Wire the --restore-draft flag through the CLI

- [x] In `src/cli/cancel.ts`, add `restoreDraft: boolean` to `RunCancelOptions`
      and destructure it in `runCancel`.
- [x] Add an exclusivity guard in `runCancel`: if `restoreDraft && allTerminated`,
      `logError` an argument error and `return 2`, mirroring the existing
      `purge && allTerminated` guard.
- [x] Pass `restoreDraft` into the `cancelSingleJob({ ... })` call.
- [x] In `src/cli/command-registry.ts`, add `"restore-draft": { type: "boolean" }`
      to the `cancel` subcommand `flags`, and pass
      `restoreDraft: !!parsed.flags["restore-draft"]` into `runCancel`.
- [x] Update the cancel usage text (the header comment in `src/cli/cancel.ts` and
      the `job cancel` help line in `command-registry.ts`) to mention
      `[--restore-draft]`.

**Acceptance Criteria**:
- `specrunner job cancel <jobId> --restore-draft` reaches `cancelSingleJob` with
  `restoreDraft: true`.
- `specrunner job cancel --all-terminated --restore-draft` exits 2 with an
  argument error and does not call `cancelSingleJob`/`cancelAllTerminated`.
- Existing cancel CLI behavior (force/purge/all-terminated/yes) is unchanged.

## T-03: Tests

- [x] In `tests/unit/core/cancel/runner.test.ts`, extend the `makeJob` fixture
      usage (or add a local helper) to materialise
      `<worktreePath>/specrunner/changes/<slug>/request.md` under the temp dir,
      then add cases:
  - [x] `restoreDraft: true` writes `drafts/<slug>/request.md` with content
        identical to the source and returns an `info` entry.
  - [x] `restoreDraft: false` (and omitted) writes no draft.
  - [x] Pre-existing `drafts/<slug>/request.md` is not overwritten; a warning is
        returned and exit code stays 0.
  - [x] Missing source `request.md` → warning + skip, exit 0, no throw.
  - [x] Restore happens before worktree removal (e.g. assert the draft is written
        even though `worktreeManager.remove` is also called, or order via a spy).
- [x] In `tests/unit/cli/cancel.test.ts`, add a case asserting
      `--all-terminated --restore-draft` returns exit 2 without invoking the
      runner, and that `restoreDraft` is forwarded for single-job cancel.
- [ ] (Optional) Assert the restored draft passes validation by reusing the
      request parser/validate path on the written file.

**Acceptance Criteria**:
- New tests cover restore success, default no-op, collision skip, missing-source
  skip, exclusivity error, and read-before-removal ordering.
- All assertions are deterministic (temp-dir fs + existing spawn/worktree mocks).

## T-04: Verification

- [x] Run `bun run typecheck` and `bun run test`; both pass green.
- [x] Confirm acceptance criteria from request.md:
  - `--restore-draft` cancel produces a `drafts/<slug>/request.md` that
    `specrunner request validate <slug>` accepts.
  - No-option cancel behavior is byte-identical to current.
  - Existing draft is not overwritten.

**Acceptance Criteria**:
- `bun run typecheck && bun run test` exits 0 with no new failures.

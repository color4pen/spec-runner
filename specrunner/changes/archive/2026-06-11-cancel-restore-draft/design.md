# Design: job cancel --restore-draft

## Context

`specrunner job cancel` (`src/core/cancel/runner.ts`) tears down a job: process
kill (running), best-effort cleanup (`git worktree prune`, worktree removal,
local/remote branch deletion), state transition to `canceled`, managed-marker
unlink, and optional `--purge` of the machine-local sidecar. It contains no
reference to `request.md` or `drafts/` — cancelling a job deletes its branch and
worktree, and with them the branch-borne `specrunner/changes/<slug>/request.md`.
The authored request is lost; "redo from scratch" forces rewriting it.

Canonical locations:

- Draft (pre-run): `specrunner/drafts/<slug>/request.md` (main worktree, tracked).
- In-flight authoritative copy: `specrunner/changes/<slug>/request.md` on the
  job's branch, materialised in the job's worktree at
  `<worktreePath>/specrunner/changes/<slug>/request.md`.

The cancel command runs from the **main worktree** (`deps.repoRoot`); the
request to restore lives in the **job's worktree**. The worktree is destroyed
during cleanup, so any read of its `request.md` must happen before removal.

Path helpers already exist: `requestMdPath(slug)` →
`specrunner/changes/<slug>/request.md`, `draftPath(slug)` →
`specrunner/drafts/<slug>/request.md`. `resolveWorktreePathForJob(state, repoRoot)`
already resolves the worktree path via state → liveness sidecar → convention.
`src/core/request/store.ts#write(cwd, slug, content)` writes a new-format draft
(mkdir + writeFile). `getJobSlug(state)` derives the slug.

## Goals / Non-Goals

**Goals**:

- Add an opt-in `--restore-draft` flag to single-job `job cancel` that copies the
  branch's `changes/<slug>/request.md` back to `drafts/<slug>/request.md` in the
  main worktree, read before worktree removal.
- Preserve verbatim content so the restored draft is immediately runnable via
  `specrunner run` and passes `specrunner request validate <slug>`.
- Keep the no-flag path byte-for-byte identical to current behavior.
- Never clobber an existing draft: collision → warning + skip (not an error).
- Treat a missing source (no worktree / no-worktree mode / already cleaned up)
  as warning + skip, consistent with the existing best-effort cleanup pattern.

**Non-Goals**:

- Restoring artifacts other than `request.md` (design / spec / results).
- Changing any other cancel behavior (process kill, PR/branch handling, worktree
  removal, purge, state transition).
- Failure-learning extraction.
- Auto-committing the restored draft (the user owns the working-tree change).
- `--restore-draft` support under `--all-terminated` (bulk path).

## Decisions

### D1: Read the source from the job's worktree filesystem, before cleanup

Restore reads `path.join(resolveWorktreePathForJob(state, repoRoot), requestMdPath(slug))`
with `fs.readFile`, executed in `cancelSingleJob` **after** the process-kill step
and **before** `cleanupJobResources` (which removes the worktree).

Rationale: the request mandates "read before worktree removal", which only has
meaning when reading from the worktree filesystem. Reusing the existing
`resolveWorktreePathForJob` keeps a single source of truth for "where is this
job's worktree". `fs.readFile` against a temp-dir worktree is trivially testable
with the existing harness (no new spawn mock surface).

Alternatives considered:

- `git show <branch>:specrunner/changes/<slug>/request.md` — robust to worktree
  removal and works in no-worktree mode, but ignores the explicit ordering
  constraint, adds a git-spawn dependency, and requires the branch to still
  exist (deleted later in cleanup). Rejected to keep scope and deps minimal;
  no-worktree is handled by D4 (warn + skip).

### D2: Gate behind an optional flag; default path unchanged

`cancelSingleJob` gains an optional `restoreDraft?: boolean` (default `false`).
Restore runs only when `true`. The flag is threaded
`command-registry (--restore-draft) → RunCancelOptions.restoreDraft → cancelSingleJob`.

Rationale: optional-with-default-false makes "no flag = current behavior" the
type-level default and leaves every existing `cancelSingleJob` call site valid
(no churn), satisfying the "behavior completely identical without the option"
criterion. Mirrors the existing `force` / `purge` threading.

### D3: Collision = destination `request.md` exists → warn + skip

Before writing, check `fs.access(path.join(repoRoot, draftPath(slug)))`. If the
destination `request.md` already exists, push a warning and skip the write; do
not overwrite. Success pushes an info message.

Rationale: the overwrite target is the draft `request.md` that `run` consumes;
guarding exactly that file matches requirement "do not overwrite if it already
exists" and keeps the check precise. Legacy flat `drafts/<slug>.md` is not the
write format and is out of scope (Open Question OQ1).

### D4: Source-missing and slug-missing are best-effort warnings, not failures

If `getJobSlug` yields `""`, if the worktree path cannot be resolved, or if the
source `request.md` read fails (ENOENT etc.), push a warning and skip. Cancel's
exit code is unaffected by restore outcome.

Rationale: matches the request-review LOW finding (no-worktree / pre-removed
worktree → warn + skip) and the established best-effort cleanup convention
(failures append warnings, never throw). Restore is an additive convenience; it
must never break cancellation.

### D5: `--restore-draft` is rejected with `--all-terminated` (arg error, exit 2)

`runCancel` adds an exclusivity check: `restoreDraft && allTerminated` → arg
error, mirroring the existing `purge && allTerminated` guard.

Rationale: restore is single-job semantics (one source request per job); the
bulk path operates on sidecars only and has no per-job request context. Erroring
early is consistent with the `--purge` precedent and the request-review MEDIUM
finding.

### D6: Surface restore outcome via `CancelResult.info` / `warnings`

Success → `info` ("Restored draft to specrunner/drafts/<slug>/request.md");
collision / missing source → `warnings`. `cancelSingleJob` accumulates an `info`
array and includes it in the result; the CLI `writeResult` already prints
`info` to stdout and `warnings` to stderr.

## Risks / Trade-offs

- [No-worktree / manually-removed worktree yields no restore] → Mitigation: D4
  warn + skip; documented behavior, not a silent failure. Acceptance focuses on
  the worktree-backed happy path.
- [Restored draft left uncommitted in the main worktree] → Mitigation: out of
  scope by design; consistent with drafts being user-managed working-tree files.
  The info message names the path so the user can act.
- [Reading before cleanup adds an I/O step to the hot path] → Mitigation: gated
  behind the flag; the default path is untouched.

## Open Questions

- OQ1: Should a legacy flat `drafts/<slug>.md` also count as a collision? Current
  decision (D3) checks only the new-format `request.md`. Acceptable since restore
  only ever writes the new format and the new format is the active convention.

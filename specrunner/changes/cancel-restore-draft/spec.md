# Spec: job cancel --restore-draft

## Requirements

### Requirement: `job cancel --restore-draft` restores the branch request.md to drafts/

When `--restore-draft` is passed to a single-job `specrunner job cancel`, the
command SHALL read the job's branch-borne `specrunner/changes/<slug>/request.md`
from the job's worktree **before** the worktree is removed, and write its
verbatim content to `specrunner/drafts/<slug>/request.md` in the main worktree.
The restored draft MUST be byte-identical to the source so that `specrunner run`
and `specrunner request validate <slug>` accept it unchanged.

#### Scenario: restore writes a runnable draft

**Given** a cancellable job whose worktree contains `specrunner/changes/<slug>/request.md`
**When** the user runs `specrunner job cancel <jobId> --restore-draft`
**Then** `specrunner/drafts/<slug>/request.md` exists in the main worktree with
content identical to the source, and `specrunner request validate <slug>` passes

#### Scenario: source is read before worktree removal

**Given** a job whose worktree will be removed during cleanup
**When** cancel runs with `--restore-draft`
**Then** the source `request.md` is read prior to worktree removal so its content
is captured before the worktree (and branch) are destroyed

### Requirement: Default cancel behavior is unchanged without the flag

When `--restore-draft` is not passed, `specrunner job cancel` SHALL behave
exactly as before: no draft is written and no `drafts/` directory is read or
created.

#### Scenario: no flag leaves drafts untouched

**Given** a cancellable job
**When** the user runs `specrunner job cancel <jobId>` without `--restore-draft`
**Then** no `specrunner/drafts/<slug>/request.md` is created or modified and the
cancel outcome matches current behavior

### Requirement: Restore never overwrites an existing draft

When `--restore-draft` is passed and `specrunner/drafts/<slug>/request.md`
already exists, the command SHALL skip the write, emit a warning, and MUST NOT
overwrite the existing draft. This MUST NOT change the cancel exit code.

#### Scenario: existing draft is preserved

**Given** a cancellable job and an existing `specrunner/drafts/<slug>/request.md`
**When** the user runs `specrunner job cancel <jobId> --restore-draft`
**Then** the existing draft is left unmodified, a warning is emitted, and the
cancel completes with its normal exit code

### Requirement: Missing source is a best-effort skip

When `--restore-draft` is passed but the slug cannot be derived, the worktree
path cannot be resolved, or the source `request.md` cannot be read (e.g.
no-worktree mode or an already-removed worktree), the command SHALL emit a
warning and skip the restore without throwing or changing the cancel exit code.

#### Scenario: no source request.md to restore

**Given** a cancellable job whose worktree has no readable `changes/<slug>/request.md`
**When** the user runs `specrunner job cancel <jobId> --restore-draft`
**Then** a warning is emitted, no draft is written, and cancel completes normally

### Requirement: `--restore-draft` is incompatible with `--all-terminated`

`specrunner job cancel` SHALL reject the combination of `--restore-draft` and
`--all-terminated` as an argument error (exit code 2), consistent with the
existing `--purge` + `--all-terminated` guard.

#### Scenario: bulk cancel rejects --restore-draft

**Given** the user combines `--all-terminated` with `--restore-draft`
**When** `specrunner job cancel --all-terminated --restore-draft` is invoked
**Then** the command exits with code 2 and prints an argument error

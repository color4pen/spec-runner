# Spec: request lifecycle 一本化 — draft consume on start

## Requirements

### Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds

The system SHALL delete the canonical draft — both the flat form `specrunner/drafts/<slug>.md` and the directory form `specrunner/drafts/<slug>/` — after, and only after, the change-folder request.md materialization commit for the job succeeds. If job start fails before that commit is created, the draft MUST remain on disk. A git-tracked draft MUST NOT be deleted; the system emits a warning instead (same policy as the archive backstop). The consumed location is derived from the slug's canonical draft path and MUST NOT be derived from the request file path passed to start.

#### Scenario: directory-format draft is consumed on successful start

**Given** a directory-format draft exists at `specrunner/drafts/<slug>/request.md` in the repo root
**And** the draft is not tracked by git
**When** job start materializes `changes/<slug>/request.md` and its commit succeeds
**Then** `specrunner/drafts/<slug>/` no longer exists in the repo root

#### Scenario: flat-format draft is consumed on successful start

**Given** a flat-format draft exists at `specrunner/drafts/<slug>.md` in the repo root
**And** the draft is not tracked by git
**When** job start materializes `changes/<slug>/request.md` and its commit succeeds
**Then** `specrunner/drafts/<slug>.md` no longer exists in the repo root

#### Scenario: start failure before the materialization commit preserves the draft

**Given** a canonical draft exists for the slug
**When** job start fails before the change-folder request.md commit is created (e.g. the commit command returns a non-zero exit code)
**Then** job start reports failure
**And** the canonical draft still exists in the repo root

#### Scenario: a git-tracked draft is warned about, not deleted

**Given** a canonical draft for the slug that is tracked by git
**When** job start materializes and commits the change-folder request.md successfully
**Then** the tracked draft is not deleted
**And** a warning instructs the operator to remove it manually

#### Scenario: starting from a non-canonical request path does not consume that file

**Given** job start is invoked with a request file located outside the canonical draft locations
**And** no canonical draft exists for the slug
**When** job start materializes and commits the change-folder request.md successfully
**Then** the file passed to start is left untouched
**And** no draft deletion occurs

### Requirement: Resume shall not recopy the draft into the change folder

The system SHALL treat `specrunner/changes/<slug>/request.md` as the single canonical request after job start. Resume MUST NOT copy any draft content over the change-folder request.md on any runtime path (local worktree, local no-worktree, managed). An operator edit to `changes/<slug>/request.md` applied via `resume --apply-canon` MUST survive subsequent resumes.

#### Scenario: operator-edited request.md survives a subsequent resume

**Given** the change-folder request.md holds operator-edited content applied via `--apply-canon`
**And** a draft with different content still exists in the repo root
**When** the job is resumed
**Then** the change-folder request.md content is unchanged
**And** it is not overwritten with the draft content

### Requirement: cancel --restore-draft shall restore the draft from the change-folder request.md

When `cancel --restore-draft` runs, the system SHALL recreate the draft `specrunner/drafts/<slug>/request.md` from the worktree's `specrunner/changes/<slug>/request.md`. Because the draft is consumed at start, the normal cancel path MUST NOT hit the "draft already exists; skipping restore" branch.

#### Scenario: cancel --restore-draft recreates the draft from the worktree request.md

**Given** a running job whose canonical draft was consumed at start
**And** the worktree holds `changes/<slug>/request.md`
**When** the operator runs `cancel --restore-draft`
**Then** `specrunner/drafts/<slug>/request.md` is recreated with the worktree request.md content

### Requirement: archive draft cleanup shall remain as a backstop

The archive step's draft cleanup SHALL remain in place and MUST be a no-op when the draft was already consumed at start. Its behavior for a still-present draft (both formats, tracked-warning) is unchanged.

#### Scenario: archiving a job whose draft was consumed at start is a no-op for draft cleanup

**Given** a job whose canonical draft was consumed at start (no draft present in the repo root)
**When** the job is archived
**Then** the archive draft-cleanup step deletes nothing and reports no error

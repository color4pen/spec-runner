# Spec: archive-resume-when-unmerged

## Requirements

### Requirement: archive/resume lookup SHALL include archived states

`JobStateStore.list` calls in `src/core/archive/orchestrator.ts` and `src/core/archive/merge-then-archive.ts` SHALL pass `{ includeArchived: true }`, so that a job with status `archived` is resolvable by slug in both code paths.

#### Scenario: non-with-merge archive on already-archived job returns idempotently

**Given** a job with the target slug exists at `specrunner/changes/archive/` with status `archived`
**When** `job archive <slug>` is executed (without `--with-merge`)
**Then** the orchestrator resolves the job, detects its terminal status, logs `Already finished (archived)`, and returns exitCode 0 without re-running any archive side effects

#### Scenario: with-merge archive on archived+merged job completes post-merge cleanup

**Given** a job with the target slug exists at `specrunner/changes/archive/` with status `archived` and its PR is in MERGED state
**When** `job archive --with-merge <slug>` is executed
**Then** merge-then-archive resolves the job, detects the `MERGED && archived` condition, calls `runPostMergeCleanup`, and returns exitCode 0

#### Scenario: with-merge archive on archived+unmerged job proceeds to merge flow

**Given** a job with the target slug exists at `specrunner/changes/archive/` with status `archived` and its PR is still open
**When** `job archive --with-merge <slug>` is executed
**Then** merge-then-archive resolves the job, does NOT return `No job found`, and proceeds to the archive-record → CI-wait → merge flow

### Requirement: cancel / inbox / exit-guard list calls SHALL NOT include archived states

The `JobStateStore.list` calls in `src/core/cancel/runner.ts`, `src/core/inbox/run-inbox.ts`, and `src/core/lifecycle/exit-guard.ts` MUST remain unchanged (no `includeArchived` option added). Archived jobs MUST NOT be returned by these callers.

#### Scenario: cancel does not operate on archived jobs

**Given** a job with status `archived`
**When** the cancel runner calls `JobStateStore.list`
**Then** the archived job is not included in the result (no `includeArchived` option passed at the call site)

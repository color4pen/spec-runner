# Spec: job-list-archive-skip

## Requirements

### Requirement: `JobStateStore.list` SHALL skip archive scan by default

`JobStateStore.list` MUST accept an optional `opts` parameter with an `includeArchived` boolean field. When `includeArchived` is `false` or absent, the function SHALL NOT read from `specrunner/changes/archive/`. When `includeArchived` is `true`, the function SHALL include archived states in its return value.

#### Scenario: default list skips archive directory

**Given** a repo with active jobs and archived jobs under `specrunner/changes/archive/`
**When** `JobStateStore.list(repoRoot)` is called with no options
**Then** no filesystem operations are performed on any path under `specrunner/changes/archive/`

#### Scenario: opt-in returns archived states

**Given** a repo with one active job and one archived job
**When** `JobStateStore.list(repoRoot, { includeArchived: true })` is called
**Then** both jobs are present in the returned array

### Requirement: `job ls` default and `--active` SHALL NOT load archived states

`runPs` MUST call `JobStateStore.list` without `includeArchived: true` when neither `--all` nor `--status archived` is specified.

#### Scenario: default `job ls` with no flags

**Given** a repo with archived jobs
**When** `runPs({})` is called
**Then** zero entries from `specrunner/changes/archive/` are loaded

#### Scenario: `--all` includes archived

**Given** a repo with archived jobs
**When** `runPs({ all: true })` is called
**Then** archived jobs appear in the result

#### Scenario: `--status archived` includes archived

**Given** a repo with archived jobs
**When** `runPs({ status: 'archived' })` is called
**Then** archived jobs appear in the result

### Requirement: inbox tick SHALL NOT load archived states

`run-inbox.ts` MUST call `JobStateStore.list` without `includeArchived: true`, so that each tick's cost is independent of archive size.

#### Scenario: inbox tick with large archive

**Given** a repo with 326 archived jobs and 2 active jobs
**When** `runInbox` executes a tick
**Then** `JobStateStore.list` is called without `includeArchived: true`, loading only active job states

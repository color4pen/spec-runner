# Design: SpecRunner Directory Rename

## Design Decisions

### Why `specrunner/` instead of `openspec-workflow/`?

The SpecRunner CLI is a **user-facing production tool** with its own consistent naming convention:
- Binary: `specrunner`
- Config: `~/.config/specrunner/config.json`
- State: `~/.local/share/specrunner/jobs/`

The `openspec-workflow/` directory contains **dev tooling artifacts** (ADRs, instincts, learned-patterns, review-lessons, constraints) that are not part of the runtime behavior. Mixing user-facing request directories with internal development documentation creates a namespace leak where production code depends on a dev-only namespace.

By moving to `specrunner/requests/`, we:
- Align repository structure with CLI naming
- Separate user-facing workflow state from internal dev documentation
- Make clear ownership boundaries (SpecRunner owns `specrunner/`, openspec owns `openspec/`, dev tooling owns `openspec-workflow/`)

The `openspec-workflow/` directory will be retained **unchanged** and will continue to serve as the home for dev tooling. Only the `requests/` subdirectory is being relocated.

### Why make `awaiting-merge` a JobStatus value instead of a filesystem directory?

`awaiting-merge` represents a **lifecycle state** ("PR created, awaiting human merge"), not a distinct working location. The filesystem already captures the necessary information:
- **Work in progress**: `specrunner/requests/active/<slug>/`
- **Completed work**: `specrunner/requests/merged/<slug>/`

The transition from "work in progress" to "waiting for merge" is a **state machine transition** in JobState.status, not a filesystem relocation. Introducing a filesystem directory for this transient state would:
- Require additional `git mv` operations (active → awaiting-merge → merged)
- Create synchronization risks between filesystem location and JobState.status
- Add complexity to `specrunner finish` target resolution

Instead, `specrunner finish` will:
1. Create the PR from `active/<slug>/`
2. Update JobState.status to `awaiting-merge` (in-memory state machine transition)
3. Leave the directory at `active/<slug>/` until the PR is merged
4. After merge confirmation, perform a single `git mv active/<slug>/ merged/<slug>/` and update status to `merged`

This design will be fully implemented in the separate `job-status-lifecycle` change. The current change only removes the filesystem directory references and prepares the codebase for the status-based model.

### Why delete `canceled` references entirely?

The SpecRunner CLI does not currently implement a `cancel` command, and `canceled` was never a populated directory (0 entries in the filesystem). The `canceled` lifecycle state is out of scope for the current feature set.

Removing references to `canceled`:
- Eliminates warnings from `specrunner doctor` about a missing directory that was never intended to exist
- Reduces code complexity (fewer directory checks, simpler auto-detection logic)
- Avoids premature design of a feature that hasn't been specified

If `cancel` functionality is added in the future, it can be reintroduced with proper design and spec (likely as a JobStatus value with a dedicated `canceled/` directory if truly needed, or as a soft delete via status field).

### Why only `active/` and `merged/` directories?

These two directories represent the **minimal viable filesystem model** for the current SpecRunner workflow:

1. **active/**: Work in progress. Contains `request.md` and any local working files. Input to `specrunner run`.
2. **merged/**: Completed work. Output of `specrunner finish` after successful merge. Archive location.

All transient states (`awaiting-merge`, `in-review`, `fixing-build`) are captured in JobState.status, not in filesystem locations. This keeps the directory structure simple and stable.

The legacy `done/` directory (5 entries from pre-CLI openspec-workflow skill workflow) will be ignored by doctor checks and can be manually migrated by the user to `merged/` at their convenience.

## Tradeoffs

### Chosen: Breaking change with manual migration

**Decision**: Make this a breaking change. Old paths (`openspec-workflow/requests/...`) will **not** continue to work after merge. User must manually migrate filesystem before merging the PR.

**Alternative rejected**: Support both old and new paths with a deprecation period.

**Rationale**: 
- This is a single-user dogfooding repository with full control over migration timing
- Supporting dual paths would require maintaining complex fallback logic in multiple places (run.ts, resolve-target.ts, workflow-structure.ts, move-requests-dir.ts)
- A clean cutover is simpler to reason about and eliminates the risk of "which path won?" ambiguities
- The user can coordinate migration and merge as a single atomic operation

**Risk mitigation**: User performs filesystem migration (via `git mv`) in a separate commit on main **before** merging this change. Migration can be verified with `specrunner doctor` before proceeding.

### Chosen: Filesystem migration is user responsibility

**Decision**: This change only updates source code, tests, and specs. It does **not** include automated migration of the 29 existing request directories.

**Alternative rejected**: Include a migration script or automatic migration in `specrunner doctor`.

**Rationale**:
- Migration is a one-time operation for a single repository
- Automated migration adds complexity and risk (what if user has uncommitted changes in `openspec-workflow/requests/active/`?)
- User can perform migration at the most appropriate time (before merge, after merge, or iteratively)
- Manual `git mv` preserves full rename history for `git log --follow`

**Risk mitigation**: Acceptance criteria include clear documentation of the manual migration steps. The PR description will include a migration checklist.

### Chosen: Remove TC-131/TC-132/TC-133 `awaiting-merge` auto-detection tests

**Decision**: Rewrite these tests to validate `active/` auto-detection instead of deleting them entirely.

**Alternative rejected**: Delete the tests and reduce coverage.

**Rationale**:
- Auto-detection from cwd is still a valid feature, just with a different directory
- Tests verify important edge cases (0 entries → error, 2+ entries → error, 1 entry → success)
- Rewriting is minimal effort (change directory name in test setup)

## Open Questions

None. The request fully specifies the scope, acceptance criteria, and out-of-scope items.

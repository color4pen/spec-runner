# Spec: round-invalidation-source-scoped

## Requirements

### Requirement: `approvedAtCommit` SHALL be the reviewed source revision, excluding the round's own findings commit

When a parallel review round approves a member, the value stored in that member's
`approvedAtCommit` MUST be the HEAD captured after member execution but BEFORE the
round commits its own findings artifacts (`commitRoundArtifacts`). It MUST NOT be the
revision produced by the round's findings commit. Members do not commit under
`roundOwnsGitEffects`, so this captured HEAD equals the source revision the member
reviewed.

#### Scenario: approvedAtCommit is the pre-findings-commit revision

**Given** a parallel review round with a pending member whose executor returns `approved`
**And** a runtime whose `captureHeadSha` returns the current HEAD, and whose
`commitRoundArtifacts` advances HEAD to a distinct "round-commit revision"
**When** the round runs and persists reviewer statuses
**Then** the member's `approvedAtCommit` equals the HEAD captured before `commitRoundArtifacts` was called
**And** the member's `approvedAtCommit` is not the "round-commit revision"

---

### Requirement: Round invalidation SHALL exclude pipeline-managed change-folder paths from the touched-file set before activation matching

Before an approved member's touched files are matched against its activation paths in a
parallel review round, the engine MUST remove every path under the change folder
(`changesDirRel()` = `specrunner/changes/`) from the touched-file set obtained from
`listChangedFiles(approvedAtCommit, ...)`. The exclusion MUST be applied only at the
round invalidation site; the `listChangedFiles` seam MUST remain unchanged so that other
consumers (scope-check, runtime capability gate) are unaffected. The path exclusion MUST
match a path that equals `specrunner/changes` or begins with `specrunner/changes/`, and
MUST NOT match a same-prefix sibling such as `specrunner/changes-other/...`.

#### Scenario: broad-activation reviewer is not invalidated by findings-only changes

**Given** an approved member whose `activationPaths` is broad enough to match the change
folder (e.g. `["specrunner/changes/**"]` or `["**"]`)
**And** `listChangedFiles(approvedAtCommit, ...)` returns only change-folder paths
(e.g. `specrunner/changes/<slug>/<name>-result-001.md`)
**When** the round computes invalidations
**Then** the member remains `approved` and is not re-executed in the round

#### Scenario: a same-prefix sibling path is not excluded

**Given** a touched-file set that includes `specrunner/changes-not-a-child/file.ts`
**When** the change-folder exclusion filter is applied
**Then** `specrunner/changes-not-a-child/file.ts` is retained in the source-scoped result

---

### Requirement: True source changes SHALL still invalidate an approved reviewer

When an approved member's activation source path (e.g. `src/**`) is touched between
`approvedAtCommit` and HEAD, the round MUST invalidate the member (revert `approved` to
`pending`) exactly as before. Excluding change-folder paths MUST NOT suppress invalidation
driven by a genuine source change.

#### Scenario: fixer touching a source activation path invalidates the reviewer

**Given** an approved member with `activationPaths: ["src/**"]`
**And** `listChangedFiles(approvedAtCommit, ...)` returns both a source path
(`src/foo.ts`) and a change-folder path (`specrunner/changes/<slug>/<name>-result-001.md`)
**When** the round computes invalidations
**Then** the member is reverted to `pending` and re-executed in the round

---

### Requirement: An always-activate reviewer SHALL always be invalidated regardless of the source-scoped touched files

A member whose `activationPaths` is `undefined` (always-activate) MUST be invalidated on
every round after any fixer run, independent of the touched-file set. Removing
change-folder paths from the touched-file set MUST NOT change this: even when the
source-scoped touched-file set is empty, an always-activate member MUST still be
invalidated (behavior preservation).

#### Scenario: always-activate reviewer invalidates even with only findings changed

**Given** an approved member with `activationPaths: undefined` (always-activate)
**And** `listChangedFiles(approvedAtCommit, ...)` returns only change-folder paths
(so the source-scoped touched set is empty)
**When** the round computes invalidations
**Then** the member is reverted to `pending` and re-executed in the round

---

### Requirement: The `listChangedFiles` seam behavior SHALL remain unchanged

The change MUST NOT alter `listChangedFiles` (`RuntimeStrategy` / `LocalRuntime`) or its
callers other than the round invalidation site. Scope-check and runtime-capability-gate
consumers of `listChangedFiles` MUST continue to observe the same behavior, and their
existing tests MUST pass without modification.

#### Scenario: scope-check consumers are unaffected

**Given** the existing scope-check and runtime-capability-gate tests that exercise
`listChangedFiles`
**When** the change is applied
**Then** those tests pass unchanged (the seam returns the same file list, un-filtered)

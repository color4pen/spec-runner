# Spec: post-merge-integrity-check

## Requirements

### Requirement: Post-merge integrity command is configurable

The system SHALL read an optional post-merge integrity command list from
`.specrunner/config.json` as `archive.postMergeVerify`, an array of `ShellCommand`
(each element being a string `"cmd"` or an object `{ name?, run }`). When the key is
absent or an empty array, `job archive --with-merge` MUST behave exactly as before
(no integrity check, no extra git fetch, no worktree, no command execution). Config
validation MUST reject a non-array value and any element that is neither a non-empty
string nor an object with a non-empty `run`.

#### Scenario: Absent config preserves legacy behavior

**Given** `.specrunner/config.json` has no `archive.postMergeVerify` key (or an empty array)
**When** `job archive --with-merge <slug>` merges the PR
**Then** no integrity check runs (no `git fetch`, no worktree add, no command execution) and the existing merge → cleanup flow completes unchanged

#### Scenario: Valid command list passes validation

**Given** `archive.postMergeVerify` is `["bun install --frozen-lockfile"]`
**When** the config is validated
**Then** validation succeeds and the command list is available to `job archive --with-merge`

#### Scenario: Invalid command list is rejected

**Given** `archive.postMergeVerify` is a non-array, or contains an empty string or an object without a non-empty `run`
**When** the config is validated
**Then** validation throws `CONFIG_INVALID`

### Requirement: Integrity check runs on the merge result of this execution

After `job archive --with-merge` successfully squash-merges the PR in this execution,
and before post-merge cleanup, the system SHALL execute the configured
`archive.postMergeVerify` commands against the merge result reflected on the base
branch (the merged commit materialized in an ephemeral checkout), when the command
list is non-empty. The check MUST NOT run on the already-merged resume path nor on the
merged-during-wait path (those merges are not attributable to this execution). The base
working tree MUST NOT be dirtied: the local base branch and working directory are not
checked out, reset, or committed.

#### Scenario: Commands run against the merged base after this execution's merge

**Given** `archive.postMergeVerify` is non-empty and the PR is squash-merged by this `--with-merge` execution
**When** the merge succeeds
**Then** the system fetches the base branch, materializes the merged commit in an ephemeral detached worktree, and runs the configured commands in that worktree before cleanup

#### Scenario: Passing check completes archive as before

**Given** `archive.postMergeVerify` is non-empty and every command exits 0 on the merged base
**When** `job archive --with-merge <slug>` runs
**Then** post-merge cleanup runs and the command returns exit code 0, and the ephemeral worktree is removed

#### Scenario: Resume path does not re-run the integrity check

**Given** the PR is already `MERGED` and the job status is `archived` (a resume after merge)
**When** `job archive --with-merge <slug>` runs
**Then** the integrity check is not executed and the command runs post-merge cleanup directly

#### Scenario: Merge that occurred during wait is not attributed to this execution

**Given** the PR became `MERGED` during the check-wait loop (merged by another process)
**When** `job archive --with-merge <slug>` observes the merge
**Then** the integrity check is not executed and the command runs post-merge cleanup directly

### Requirement: Failed integrity check escalates without rollback and reports the merge honestly

When a configured integrity command exits non-zero on the merged base, the system MUST
NOT merge-cleanup and MUST return an escalation (exit code 1). The merge MUST NOT be
rolled back or reverted, and the escalation MUST report the PR as merged (merged is
merged). The escalation content MUST include (a) the fact that this merge broke the
base-branch integrity check, attributed by PR number and merge commit SHA, (b) the
failing command's output, and (c) remediation guidance (e.g. regenerate the lockfile and
push a fix directly to the base branch).

#### Scenario: Failing check produces an attributed escalation

**Given** `archive.postMergeVerify` is `["bun install --frozen-lockfile"]` and it exits non-zero on the merged base for PR #42
**When** `job archive --with-merge <slug>` runs
**Then** the command returns exit code 1 with an escalation whose detected-state names PR #42 and the merge commit SHA, includes the failing command's output, and whose recommended action describes fixing and pushing to the base branch

#### Scenario: Merge is not rolled back on failure

**Given** the integrity check failed after a successful squash merge
**When** the escalation is emitted
**Then** no revert or rollback git operation is performed, the escalation states the PR was MERGED, and post-merge cleanup is not run in this execution

#### Scenario: Resume after an integrity failure converges via cleanup

**Given** an earlier execution merged the PR, failed the integrity check, and left the job archived
**When** `job archive --with-merge <slug>` is re-run (after a human fixes the base branch)
**Then** the already-merged resume path runs post-merge cleanup and returns exit code 0 without re-running the integrity check

### Requirement: Infrastructure failures do not block or falsely pass

When the integrity check cannot be performed because a pre-command infrastructure step
fails (git fetch of the base branch, merge-commit SHA resolution, or ephemeral worktree
creation), the system MUST NOT block the archive and MUST NOT report the check as passed.
It SHALL emit a warning that the base branch was not verified (with the reason) and
continue to post-merge cleanup. Only a non-zero exit from an actually-executed command
constitutes an integrity failure (which escalates).

#### Scenario: Fetch failure warns and continues

**Given** `archive.postMergeVerify` is non-empty but `git fetch` of the base branch fails after the merge
**When** `job archive --with-merge <slug>` runs
**Then** a warning states the base branch was not verified with the reason, no escalation is emitted, and post-merge cleanup runs to completion

#### Scenario: Ephemeral worktree cleanup is best-effort

**Given** the integrity check completed (pass or fail) and the ephemeral worktree removal fails
**When** the command finishes
**Then** a warning is emitted and the result (success or the integrity escalation) is unchanged by the removal failure

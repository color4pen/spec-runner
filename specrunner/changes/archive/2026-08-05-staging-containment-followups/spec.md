# Spec: staging containment follow-ups — staged byte-size guard + artifact hygiene discipline

## Requirements

### Requirement: A byte-size guard SHALL halt guarded staging before commit when the staged byte total exceeds `pipeline.maxStagedBytes`

In guarded staging mode, after write-scope enforcement and exclusion have produced the stage set
(`stagePaths`), and independently of the existing file-count guard, the pipeline SHALL measure the
total worktree byte size of the paths to stage and SHALL halt (escalation) BEFORE `git add`,
`git commit`, or `git push` when that total exceeds `pipeline.maxStagedBytes` (default
`52428800` = 50 MiB). The measurement point SHALL be the same as the file-count guard: after
exclusion (`applyStagingExclusions`) and before `git add`. This applies to guarded steps only
(`implementer`, `build-fixer`, `code-fixer`, `test-materialize`, `adr-gen`); scoped staging is
unaffected. The default and existing behavior of the file-count guard (`pipeline.maxStagedFiles`)
and of `pipeline.stagingExcludePatterns` SHALL NOT change.

#### Scenario: over-byte stage set halts before commit (file count under its own limit)

**Given** a guarded step whose post-exclusion stage set has a file count at or below `maxStagedFiles`
but whose total worktree byte size exceeds `maxStagedBytes`
**When** `commitAndPush` runs the guarded branch
**Then** the step halts with error code `STAGED_BYTES_LIMIT_EXCEEDED`, and no `git add`, `git commit`,
or `git push` is invoked

#### Scenario: at-or-below byte threshold commits and pushes as before

**Given** a guarded step whose post-exclusion stage set is at or below both `maxStagedFiles` and
`maxStagedBytes`
**When** `commitAndPush` runs the guarded branch
**Then** staging, commit, and push proceed exactly as in the legacy guarded flow

### Requirement: Staged-byte measurement SHALL lstat each staged path, treat not-in-worktree paths as zero, and SHALL NOT fail open on other measurement errors

The byte total SHALL be computed by `lstat`-ing each staged path resolved against the worktree cwd.
A path that does not exist in the worktree (e.g. a delete-pending path enumerated by `git status`)
SHALL contribute `0` bytes and SHALL NOT be treated as a measurement failure. Any other measurement
failure (a non-`ENOENT` error) SHALL NOT be silently treated as zero and SHALL NOT allow the guard to
be bypassed (no fail-open); it SHALL cause the guarded staging to halt fail-closed before commit.
Measurement SHALL use `lstat` (not `stat`) so symbolic links are measured as the link entry and are
not followed.

#### Scenario: delete-pending path does not misfire the guard

**Given** a guarded step whose stage set includes a delete-pending path (present in `git status` but
absent from the worktree) plus present files whose sizes sum to at or below `maxStagedBytes`
**When** `commitAndPush` runs the guarded branch
**Then** the delete-pending path contributes `0` bytes, the guard does not fire, and commit and push
proceed

#### Scenario: measurement failure fails closed

**Given** a guarded step whose stage-set size measurement raises a non-`ENOENT` error for a path
**When** `commitAndPush` runs the guarded branch
**Then** the step halts before commit (fail-closed), and no `git commit` or `git push` is invoked

### Requirement: The byte-size halt error SHALL carry the total, the threshold, a size breakdown, and remedies, on the file-count guard's escalation path

The byte-size halt SHALL raise a distinct typed error (code `STAGED_BYTES_LIMIT_EXCEEDED`) constructed
in the same shape and on the same escalation path/style as `stagingLimitExceededError` (it SHALL NOT
be added to `EXIT_CODE_MAP`; it halts via the pipeline escalation path). The error message SHALL
include the measured total bytes, the configured threshold, a breakdown of the largest contributors
by size (aggregated per first-level directory), and the remedies: declare `stagingExcludePatterns` /
add to the target repo's `.gitignore` for scratch artifacts, or raise `pipeline.maxStagedBytes` for a
legitimately large change.

#### Scenario: byte-limit error message is actionable

**Given** the byte-size guard fires for a guarded step
**When** the `STAGED_BYTES_LIMIT_EXCEEDED` error is constructed
**Then** its message (or hint) contains the total byte count, the threshold, the largest contributors
by size, and names both remedies (`stagingExcludePatterns` / `.gitignore`, and `maxStagedBytes`)

### Requirement: `pipeline.maxStagedBytes` SHALL be a validated positive integer

Config validation SHALL reject `pipeline.maxStagedBytes` unless it is a positive integer; `0`, a
negative number, and a non-integer SHALL fail with error code `CONFIG_INVALID`. Omitting the field
SHALL validate successfully; the runtime default (`52428800`) applies at resolution time, not at the
config layer. The field SHALL be documented in `docs/configuration.md` alongside `maxStagedFiles`.

#### Scenario: invalid maxStagedBytes is rejected

**Given** a config with `pipeline.maxStagedBytes` set to `0`, a negative number, or a non-integer
**When** the config is validated
**Then** validation throws an error with code `CONFIG_INVALID`

#### Scenario: valid or omitted maxStagedBytes is accepted

**Given** a config with `pipeline.maxStagedBytes: 104857600`, or a config that omits the field
**When** the config is validated
**Then** validation succeeds and the field is preserved when present and absent when omitted (no
default injected at the config layer)

### Requirement: The file-count guard and the byte-size guard SHALL be evaluated independently

Both guards SHALL be evaluated for a guarded stage set; exceeding EITHER threshold SHALL halt. The
file-count guard's existing judgement (point, default `2000`, error code `STAGING_LIMIT_EXCEEDED`,
and message) SHALL be unchanged. A stage set may pass the file-count guard and still halt on the
byte-size guard, and vice versa.

#### Scenario: file count under limit but bytes over limit still halts

**Given** a guarded stage set whose file count is at or below `maxStagedFiles` but whose byte total
exceeds `maxStagedBytes`
**When** `commitAndPush` runs the guarded branch
**Then** the step halts with `STAGED_BYTES_LIMIT_EXCEEDED` (the byte guard fires even though the
file-count guard would not)

### Requirement: The shared commit-discipline fragment SHALL instruct producer agents on generated-artifact hygiene

The shared `COMMIT_DISCIPLINE` fragment SHALL, in addition to its existing git-operation prohibition,
instruct the agent NOT to emit build outputs, generated artifacts, or scratch files into locations
that become tracked/staged; that when a build's output location is fixed inside the repo the agent
SHALL confirm it is `.gitignore`d and, if not, SHALL include the `.gitignore` addition in the change;
and that temporary files SHALL be placed in already-ignored locations. Because the guarded producer
steps (`implementer`, `build-fixer`, `code-fixer`, and the other producers) compose their system
prompts from this single fragment, the discipline SHALL take effect for all of them from one edit.

#### Scenario: artifact-hygiene discipline is present in producer prompts

**Given** the `COMMIT_DISCIPLINE` fragment and the composed system prompts for `implementer`,
`build-fixer`, and `code-fixer`
**When** their text is inspected
**Then** each contains the generated-artifact / scratch-file hygiene instruction (build/generated
outputs are not emitted into tracked locations, and `.gitignore` is the escape hatch)

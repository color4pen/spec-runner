# Spec: Git非依存 artifact-output profile

## Requirements

### Requirement: The artifact-output profile shall not invoke git or GitHub from SpecRunner itself

An artifact-output run MUST NOT spawn any `git` or `gh` subprocess from SpecRunner's own code paths, and MUST NOT hold or use any GitHub API client. The subprocess seam used by the run SHALL be wrapped by a guard that refuses to execute a command whose executable basename is `git` or `gh`, failing closed with a dedicated error instead of executing it. Subprocesses spawned internally by an agent process (Claude Code CLI / Codex) are outside this boundary and SHALL be documented as such.

#### Scenario: The minimal vertical run spawns no git command

**Given** a source directory that is not inside any git repository
**And** a recording spawn function injected into the artifact-output run
**When** the run completes the full vertical (baseline snapshot → candidate → agent → verification → change derivation → review → artifact)
**Then** the recorded spawn calls contain no invocation whose executable basename is `git` or `gh`

#### Scenario: A git invocation attempted through the guarded seam fails closed

**Given** an artifact-output run whose guarded subprocess seam is available
**When** a caller attempts to execute `git status` through that seam
**Then** the underlying spawn function is not called
**And** the guard raises an error identifying the denied command

#### Scenario: A .git directory in the source is not consulted as authority

**Given** a source directory that contains a `.git` directory
**When** the artifact-output run takes the baseline snapshot
**Then** no git command is spawned
**And** the snapshot manifest records the applied exclusions including the `.git` default exclusion

### Requirement: The run shall leave the source directory unchanged on success and on failure

The artifact-output run SHALL treat the source directory as read-only. The run MUST recompute the source digest when the run terminates — whether it completes, halts, or fails — and MUST compare it against the baseline digest taken at the start. When the digests differ, the run SHALL record a `source-mutated` outcome and MUST NOT finalize an artifact.

#### Scenario: Source is unchanged after a successful run

**Given** a source directory with files, a symlink, and a binary file
**When** the artifact-output run completes successfully and the agent added, modified, and deleted files in the candidate workspace
**Then** the source directory digest equals the baseline digest recorded at run start

#### Scenario: Source is unchanged after a failed run

**Given** an artifact-output run whose verification step fails
**When** the run terminates
**Then** the source directory digest equals the baseline digest recorded at run start
**And** the run record status is a non-success terminal status

#### Scenario: Source mutated during the run is detected

**Given** an artifact-output run in progress
**When** a file in the source directory is modified by an external actor before the run terminates
**Then** the run terminates with a `source-mutated` outcome
**And** no finalized artifact directory exists

### Requirement: Revision identity shall be a recomputable, machine-independent snapshot digest

The snapshot digest SHALL be derived only from: the snapshot schema version, the applied exclusion rules, and, for each entry, its kind (`file` / `symlink` / `dir`), its source-root-relative POSIX path, its mode representation (executable bit for files, symlink marker, directory marker) and its content digest (file content bytes; symlink target bytes; absent for directories). Entries SHALL be ordered by UTF-8 byte order of the path. The digest MUST NOT depend on timestamps, absolute paths, directory traversal order, ownership, or umask. Digests SHALL be rendered as `sha256:<hex>`.

#### Scenario: Two independent snapshots of identical trees produce identical digests

**Given** two directories with identical entries, contents, and modes, created at different times and at different absolute paths
**When** a snapshot is taken of each
**Then** both snapshot digests are equal

#### Scenario: An executable bit change alters the digest

**Given** a snapshot of a directory containing a regular file with mode `100644`
**When** the file's executable bit is set and a new snapshot is taken
**Then** the new snapshot digest differs from the previous digest

#### Scenario: An empty directory is part of the identity

**Given** a directory tree containing an empty subdirectory
**When** the snapshot is taken and then the empty subdirectory is removed and a second snapshot is taken
**Then** the two snapshot digests differ

#### Scenario: Symlinks are identified by their target, not by the target's content

**Given** a directory containing a symlink pointing to a sibling file inside the source root
**When** the snapshot is taken
**Then** the symlink entry kind is `symlink`
**And** the entry's content digest is derived from the link target string, not from the referenced file's content

### Requirement: Snapshot and comparison failures shall never be reported as "no change"

Snapshot acquisition SHALL return a discriminated result that is either a complete snapshot or an `unavailable` outcome carrying a reason and the failing paths. Change-set derivation SHALL likewise return either a success result or an `unavailable` outcome. A partial snapshot MUST NOT be returned, and an empty change set MUST NOT be produced as a consequence of an I/O error, a permission error, an undecodable path, or an unsupported entry kind.

#### Scenario: An unreadable file makes the snapshot unavailable

**Given** a source directory containing a file that cannot be read
**When** a snapshot of that directory is attempted
**Then** the result is the `unavailable` outcome
**And** the reason identifies the unreadable path
**And** no snapshot digest is produced

#### Scenario: An unsupported entry kind makes the snapshot unavailable

**Given** a source directory containing an entry that is neither a regular file, a symlink, nor a directory
**When** a snapshot of that directory is attempted
**Then** the result is the `unavailable` outcome listing that path as unsupported

#### Scenario: A symlink escaping the source root makes the snapshot unavailable

**Given** a source directory containing a symlink whose target resolves outside the source root
**When** a snapshot of that directory is attempted
**Then** the result is the `unavailable` outcome identifying the escaping symlink
**And** no candidate workspace is materialized

#### Scenario: An unavailable change set does not become an empty change set

**Given** a baseline snapshot and a candidate directory that can no longer be snapshotted
**When** the change set is derived
**Then** the result is the `unavailable` outcome
**And** the caller does not receive an empty change list

### Requirement: The change set shall be derived from snapshot comparison and shall cover non-text changes

The change set SHALL classify each differing path as `added`, `modified`, or `deleted`, derived solely from the baseline and candidate snapshots. Rename inference MUST NOT be performed; a moved path SHALL appear as a `deleted` entry plus an `added` entry. An entry whose kind changed SHALL be represented as a `deleted` entry plus an `added` entry. A change consisting only of a mode change SHALL be reported as `modified`. Binary files, symlinks, directories, and deletions SHALL appear in the change set.

#### Scenario: Added, modified, and deleted files are all derived

**Given** a baseline snapshot and a candidate in which one file was created, one file's content was edited, and one file was removed
**When** the change set is derived
**Then** the created path is classified `added`
**And** the edited path is classified `modified`
**And** the removed path is classified `deleted`

#### Scenario: A binary change appears in the change set

**Given** a candidate in which a binary file's bytes were changed
**When** the change set is derived
**Then** the binary path appears as `modified`

#### Scenario: A mode-only change appears as modified

**Given** a candidate in which a file's executable bit was set but its content is byte-identical
**When** the change set is derived
**Then** the path appears as `modified`
**And** the entry records the baseline mode and the candidate mode

#### Scenario: A moved file is represented as delete plus add

**Given** a candidate in which a file was moved to a new path with identical content
**When** the change set is derived
**Then** the old path is classified `deleted`
**And** the new path is classified `added`
**And** no rename entry is produced

### Requirement: Changes not representable as a text patch shall not be dropped from the artifact

Every change-set entry SHALL appear in `manifest.json` with an explicit patch-representability classification. Entries classified as not included in the text patch (binary content, over-size content, symlink, directory, mode-only change) MUST still be represented completely — through the payload for content-bearing entries, and through manifest metadata (including symlink targets and modes) otherwise. When an entry can be represented neither in the patch nor in the payload, the run MUST fail closed and MUST NOT finalize an artifact.

#### Scenario: A binary change is omitted from the patch but present in the payload

**Given** a candidate in which a binary file was modified
**When** the artifact is finalized
**Then** the manifest entry for that path records a patch classification indicating binary omission
**And** the payload contains the candidate bytes for that path

#### Scenario: A symlink change is recorded in the manifest

**Given** a candidate in which a symlink was added
**When** the artifact is finalized
**Then** the manifest entry records kind `symlink` and the link target
**And** the entry's patch classification indicates that a text patch is not applicable

#### Scenario: A deletion is present in both patch and manifest

**Given** a candidate in which a text file was deleted
**When** the artifact is finalized
**Then** the manifest contains a `deleted` entry for that path
**And** `changes.patch` contains a deletion hunk for that path

#### Scenario: An unrepresentable entry prevents finalization

**Given** a change set containing an entry that can be represented neither in the patch nor in the payload
**When** artifact finalization is attempted
**Then** finalization fails closed
**And** no finalized artifact directory exists

### Requirement: The artifact shall be a single output unit finalized atomically and never auto-applied

A successful run SHALL produce one artifact directory containing `manifest.json`, `changes.patch`, the payload, the verification record, the review record, and apply instructions that state the presence or absence of unsupported entries. The artifact SHALL be written to a staging location and moved into place only after all contents are complete. The run MUST NOT write any part of the artifact into the source directory, and the apply instructions SHALL state that applying requires the target's current digest to equal the manifest's baseline digest.

#### Scenario: A successful run produces the complete artifact set

**Given** a successful artifact-output run
**When** the run terminates
**Then** the artifact directory contains the manifest, the patch, the payload, the verification record, the review record, and the apply instructions

#### Scenario: A failure before finalization leaves no artifact directory

**Given** an artifact-output run that fails after the change set is derived but before finalization completes
**When** the run terminates
**Then** no finalized artifact directory exists
**And** the run record and the baseline snapshot evidence still exist

#### Scenario: Apply instructions declare the baseline-digest precondition

**Given** a finalized artifact
**When** the apply instructions are read
**Then** they state that the artifact is not applied automatically
**And** they state that applying requires the target digest to match the manifest baseline digest

### Requirement: Verification and review records shall be bound to the candidate revision they evaluated

The run SHALL freeze the candidate revision by taking a snapshot immediately before verification and before review, and SHALL re-snapshot immediately after each of them. A record SHALL be written with the frozen candidate digest and the baseline digest only when the before and after digests are equal. When they differ, the run SHALL halt with a `revision-drift` outcome and MUST NOT finalize an artifact.

#### Scenario: Verification and review records carry the candidate digest

**Given** a successful artifact-output run
**When** the artifact is inspected
**Then** the verification record contains the baseline digest and the candidate digest
**And** the review record contains the same candidate digest
**And** the manifest's candidate digest equals the digest in both records

#### Scenario: Candidate mutation during verification halts the run

**Given** an artifact-output run whose verification step mutates the candidate workspace
**When** the post-verification snapshot is compared with the frozen digest
**Then** the run halts with a `revision-drift` outcome
**And** no finalized artifact directory exists

### Requirement: Git-dependent operations shall be enumerated by preflight before execution starts

Before any workspace is materialized and before any step runs, the run SHALL evaluate the selected pipeline against the execution profile's capability set and produce an effective-pipeline report listing supported steps and unsupported steps with the missing capabilities for each. When the report declares the pipeline not executable under the profile, the run MUST stop before materializing a candidate workspace. Entry routes that the profile cannot support (issue-originated start and issue linkage) SHALL be rejected by the same preflight.

#### Scenario: Unsupported steps are listed before execution

**Given** the artifact-output profile and a pipeline whose steps include publishing to a remote
**When** preflight is evaluated
**Then** the report lists the publishing step as unsupported with its missing capabilities
**And** the report lists the remaining steps as supported

#### Scenario: A non-executable pipeline stops before any workspace is created

**Given** a preflight report that declares the pipeline not executable under the artifact-output profile
**When** the run is started
**Then** the run stops with the preflight report as its reason
**And** no candidate workspace directory was created

#### Scenario: Issue-originated entry is rejected by preflight

**Given** an artifact-output run request that originates from an issue or declares an issue linkage
**When** preflight is evaluated
**Then** the entry route is reported as unsupported for this profile

#### Scenario: The existing git profile reports no unsupported steps

**Given** the git-pr profile
**When** preflight is evaluated for each registered pipeline
**Then** the unsupported list is empty for every registered pipeline
**And** every pipeline is reported as executable

### Requirement: The artifact-output profile shall declare its lifecycle limits instead of implying parity

The run SHALL record its lifecycle state — running, completed, halted, or failed — in a run record inside the run root, together with the baseline digest, the candidate digest when available, and the measured metrics. The profile SHALL declare that resume is not supported, and the run record MUST state this explicitly. A candidate workspace left behind by a crashed run MUST NOT be reused as the input of another run. Evidence that survives cleanup SHALL be the run record and the finalized artifact.

#### Scenario: Run record declares resume as unsupported

**Given** any artifact-output run
**When** the run record is read after termination
**Then** it declares that resume is not supported for this profile

#### Scenario: A halted run records its terminal state and evidence

**Given** an artifact-output run that halts during review
**When** the run terminates
**Then** the run record status is a halted state with a reason
**And** the baseline snapshot evidence file still exists
**And** no finalized artifact directory exists

#### Scenario: Run evidence is not stored only in the agent-writable area

**Given** a completed artifact-output run
**When** the run root layout is inspected
**Then** the run record and the baseline snapshot evidence are outside the candidate workspace directory

### Requirement: Agent and reviewer context shall be derived from snapshots instead of git history

The context supplied to the agent and the reviewer SHALL be built from the snapshot pair and the derived change set, and SHALL contain the baseline digest, the candidate digest, the change summary, and the list of entries not representable in the text patch. The absence of revision history MUST be stated explicitly rather than represented by empty content.

#### Scenario: Reviewer context carries the candidate revision and change summary

**Given** a derived change set with added, modified, and deleted entries
**When** the snapshot-derived context is built
**Then** it contains the baseline digest and the candidate digest
**And** it lists each changed path with its change classification
**And** it lists entries whose changes are not representable as a text patch

#### Scenario: Missing history is stated, not blank

**Given** the artifact-output profile
**When** the snapshot-derived context is built
**Then** the history section states that this profile has no revision history
**And** the section is not an empty string

### Requirement: The profile's guarantees and unsupported operations shall be documented in the CLI and README

The CLI SHALL provide an operator guide topic for the artifact-output profile that explains how the profile differs from `--no-worktree`, which guarantees it provides, which guarantees it does not provide, and which operations are unsupported. The unsupported-operation list in that topic SHALL be derived from the profile capability table so that the two cannot diverge. The README SHALL describe the same distinction and state the profile's current preview status.

#### Scenario: The guide topic lists every unsupported operation from the capability table

**Given** the artifact-output profile capability table
**When** the guide topic body is rendered
**Then** every unsupported operation declared in the table appears in the rendered body

#### Scenario: The guide topic distinguishes the profile from --no-worktree

**Given** the artifact-output guide topic
**When** its body is read
**Then** it states that `--no-worktree` runs in the repository root and still uses git
**And** it states that the artifact-output profile does not use git as authority

#### Scenario: README documents the profile and its preview status

**Given** the README
**When** the artifact-output section is read
**Then** it describes the source-directory input and the artifact output
**And** it states that the profile is not yet wired to `job start`

### Requirement: Existing git profiles shall be unaffected by this change

This change SHALL be additive. The existing local and managed runtimes, the workspace materializer, the pipeline registry, and the pipeline engine MUST NOT change behavior. Modules implementing the artifact-output profile MUST NOT be imported by the existing runtime, pipeline, or step modules.

#### Scenario: Existing runtime modules do not import the new profile modules

**Given** the source tree after this change
**When** imports of the artifact-output and snapshot modules are searched for
**Then** no module under the runtime, pipeline, or step directories imports them

#### Scenario: The default job start path is unchanged

**Given** the CLI flag definitions for job start
**When** they are inspected
**Then** the previously defined flags are unchanged
**And** no flag was removed or given new semantics

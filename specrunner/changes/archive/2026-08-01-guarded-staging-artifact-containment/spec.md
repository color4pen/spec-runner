# Spec: guarded staging build-artifact containment

## Requirements

### Requirement: Guarded staging SHALL exclude paths matching `pipeline.stagingExcludePatterns`

In guarded staging mode, the pipeline SHALL remove from the stage set every enumerated changed path
that matches at least one glob in `pipeline.stagingExcludePatterns`. Excluded paths SHALL NOT be
staged, committed, or restored — they remain in the worktree. When `pipeline.stagingExcludePatterns`
is absent, the stage set SHALL be the full enumerated change set (unchanged legacy behavior). Glob
matching SHALL use the shared `matchesGlob` implementation. This applies to guarded steps only
(`implementer`, `build-fixer`, `code-fixer`, `test-materialize`, `adr-gen`); scoped staging is
unaffected.

#### Scenario: untracked artifact trees are excluded when configured

**Given** a guarded step whose worktree changes include untracked trees `.cargo-tmp/…` and `vendor/…`
plus a real source edit `src/lib.rs`
**And** `pipeline.stagingExcludePatterns` is `["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"]`
**When** `commitAndPush` runs the guarded branch
**Then** `git add` is invoked with a pathspec that includes `src/lib.rs` and excludes every
`.cargo-tmp/` and `vendor/` path, and the excluded files remain in the worktree

#### Scenario: no exclude patterns configured stages everything (legacy)

**Given** a guarded step with the same worktree changes
**And** `pipeline.stagingExcludePatterns` is absent
**When** `commitAndPush` runs the guarded branch
**Then** `git add` is invoked with a pathspec covering all enumerated changed paths, including the
`.cargo-tmp/` and `vendor/` paths

### Requirement: Write-scope enforcement SHALL precede exclusion

The protected-canon violation check (`findWriteScopeViolations`) SHALL run on the full enumerated
change set before any exclusion is applied. An exclude pattern that matches a protected-canon path
SHALL NOT prevent the violation from being detected; it only removes the path from staging. A guarded
step that writes a protected-canon path SHALL halt with `WRITE_SCOPE_VIOLATION` regardless of
`pipeline.stagingExcludePatterns`.

#### Scenario: exclude pattern covering a canon path does not open a fail-open

**Given** a guarded step whose worktree changes include an undeclared modification to
`specrunner/changes/<slug>/design.md`
**And** `pipeline.stagingExcludePatterns` is `["specrunner/changes/**"]`
**When** `commitAndPush` runs the guarded branch
**Then** the step halts with error code `WRITE_SCOPE_VIOLATION` and no commit or push occurs

### Requirement: A volume guard SHALL halt guarded staging before commit when the stage count exceeds `pipeline.maxStagedFiles`

After exclusion, if the number of paths to stage exceeds `pipeline.maxStagedFiles` (default 2000),
the pipeline SHALL halt (escalation) before staging, committing, or pushing. The halt error SHALL
carry a distinct code and a message that includes the total stage count and the top directories by
file count, and that names the two remedies: declare `stagingExcludePatterns` / add to `.gitignore`
for scratch artifacts, or raise `maxStagedFiles` for a legitimate large change. When the
post-exclusion count is at or below the threshold, staging SHALL proceed and commit as before. The
count SHALL reflect individual files (guarded enumeration uses untracked-all mode), so a fully
untracked directory of many files is counted as its member files, not as one entry.

#### Scenario: over-threshold stage set halts with an actionable message

**Given** a guarded step whose post-exclusion stage set contains more paths than `maxStagedFiles`,
spread across directories such as `.cargo-tmp/` and `vendor/`
**When** `commitAndPush` runs the guarded branch
**Then** the step halts with the staging-limit error code, no `git commit` or `git push` is invoked,
and the error message contains the total count and a per-directory breakdown of the largest
contributors

#### Scenario: at-or-below threshold commits as before

**Given** a guarded step whose post-exclusion stage set size is ≤ `maxStagedFiles`
**When** `commitAndPush` runs the guarded branch
**Then** staging, commit, and push proceed exactly as in the legacy guarded flow

#### Scenario: exclusion brings an otherwise-over-limit set under the threshold

**Given** a guarded step whose full change set exceeds `maxStagedFiles` only because of untracked
artifact trees
**And** `pipeline.stagingExcludePatterns` removes those trees, leaving a stage set ≤ `maxStagedFiles`
**When** `commitAndPush` runs the guarded branch
**Then** the step does not halt and commits the surviving paths

### Requirement: `pipeline.stagingExcludePatterns` and `pipeline.maxStagedFiles` SHALL be validated

Config validation SHALL reject `pipeline.stagingExcludePatterns` unless it is an array of one or more
non-empty strings, and SHALL reject `pipeline.maxStagedFiles` unless it is a positive integer.
Violations SHALL fail with error code `CONFIG_INVALID`. Omitting either field SHALL validate
successfully (defaults apply at runtime: empty exclusions, threshold 2000).

#### Scenario: invalid staging config is rejected

**Given** a config with `pipeline.stagingExcludePatterns: []`, or an element that is an empty string
or a non-string, or `pipeline.maxStagedFiles` set to `0`, a negative number, or a non-integer
**When** the config is validated
**Then** validation throws an error with code `CONFIG_INVALID`

#### Scenario: valid staging config is accepted

**Given** a config with `pipeline.stagingExcludePatterns: ["vendor/**"]` and
`pipeline.maxStagedFiles: 5000`, or a config that omits both fields
**When** the config is validated
**Then** validation succeeds and the fields (when present) are preserved on the resolved config

### Requirement: `matchesGlob` SHALL be a single shared implementation

`matchesGlob` SHALL exist as one implementation in a shared util module, imported by both the
bite-evidence test-file selection and the guarded-staging exclusion. Neither consumer SHALL define
its own `matchesGlob` body. No new runtime dependency (glob library) SHALL be added.

#### Scenario: both consumers import the single implementation

**Given** the source of the bite-evidence test-file-selection module and the guarded-staging module
**When** their import structure is inspected
**Then** both obtain `matchesGlob` from a module specifier ending in `glob-match.js`, and neither
defines a local `function matchesGlob`

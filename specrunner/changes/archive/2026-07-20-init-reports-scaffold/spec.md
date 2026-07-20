# Spec: init が実行結果を報告する

## Requirements

### Requirement: init SHALL stop with a non-zero exit outside a git repository

`specrunner init` SHALL treat "current working directory is a git repository" as a
precondition. When the precondition is not met, the command MUST stop with a non-zero
exit code, MUST NOT create or modify any filesystem artifact (including the global
config file), and MUST print to stderr a prescription that requires running inside a
git repository. The command MUST NOT run `git init` on the user's behalf. A missing or
unrunnable `git` binary MUST be reported as an error in the same way (no silent skip).

The git-repository check MUST run before global config resolution and before any
provider prompt, so that no config is written and no prompt is shown when the
precondition fails.

#### Scenario: non-git directory stops with non-zero exit and writes nothing

**Given** the current working directory is not inside any git repository
**When** `specrunner init` runs
**Then** the command returns a non-zero exit code
**And** stderr contains a prescription requiring a git repository (mentioning `git init` or moving into an existing repository)
**And** no global config file is created
**And** no `specrunner/drafts`, `specrunner/changes`, or `.gitignore` is created in the directory

#### Scenario: reverting the fix regresses the non-git guard

**Given** the T1 test that asserts a non-zero exit in a non-git directory
**When** the git-repository guard is disabled (init proceeds as before)
**Then** the T1 test fails because `init` exits 0 in a non-git directory

#### Scenario: unavailable git binary is reported as an error

**Given** the `git` binary cannot be executed (not found on PATH)
**When** `specrunner init` runs
**Then** the command returns a non-zero exit code
**And** stderr contains an error explaining git is required
**And** no filesystem artifact is created

### Requirement: init SHALL report each artifact as created or already-exists to stdout

Inside a git repository, `specrunner init` SHALL report the outcome for each of the
four artifacts — `global config`, `.gitignore`, `specrunner/drafts`, and
`specrunner/changes` — individually to stdout. Each line MUST use the form
`<label>: <status>` where `<status>` is `created` when init created or modified the
artifact in this run, and `already exists` when the artifact was already present and
unchanged. The command MUST NOT collapse the report into a single one-line summary.

#### Scenario: fresh git repository reports every artifact created

**Given** the current working directory is a git repository with no prior specrunner setup
**And** no global config file exists yet
**When** `specrunner init` runs
**Then** stdout reports `global config` as `created`
**And** stdout reports `.gitignore` as `created`
**And** stdout reports `specrunner/drafts` as `created`
**And** stdout reports `specrunner/changes` as `created`
**And** the command returns exit 0

### Requirement: init SHALL be idempotent and report already-exists on a fully initialized repository

Re-running `specrunner init` in a fully initialized git repository SHALL report every
artifact as `already exists`, return exit 0, and leave the filesystem unchanged.

#### Scenario: second run reports all already-exists with no filesystem change

**Given** a git repository where `specrunner init` has already completed successfully
**And** the global config already exists
**When** `specrunner init` runs again
**Then** stdout reports `global config`, `.gitignore`, `specrunner/drafts`, and `specrunner/changes` each as `already exists`
**And** the command returns exit 0
**And** the contents of `.gitignore`, `specrunner/drafts`, and `specrunner/changes` are unchanged

### Requirement: init SHALL complete and report a half-initialized repository

When the global config already exists but the project scaffold is missing (a
half-initialized state), `specrunner init` SHALL create the missing scaffold and
report the created artifacts as `created`, rather than emitting only a `Skipping`
line. Artifacts that already exist SHALL be reported as `already exists`.

#### Scenario: config exists but scaffold missing is completed and reported

**Given** a git repository where the global config already exists
**And** `specrunner/drafts`, `specrunner/changes`, and the `.specrunner/*` gitignore entries do not exist
**When** `specrunner init` runs
**Then** stdout reports `global config` as `already exists`
**And** stdout reports `specrunner/drafts` as `created`
**And** stdout reports `specrunner/changes` as `created`
**And** stdout reports `.gitignore` as `created`
**And** the command returns exit 0

### Requirement: README Quick Start SHALL state the git-repository precondition

The README Quick Start SHALL make the git-repository precondition explicit, including a
`git init` step (or equivalent instruction to run inside a git repository), before
`specrunner init`.

#### Scenario: Quick Start includes the git-repository precondition

**Given** the README Quick Start section
**When** a new user follows it top to bottom
**Then** the steps include being inside a git repository (a `git init` step or equivalent) before `specrunner init`

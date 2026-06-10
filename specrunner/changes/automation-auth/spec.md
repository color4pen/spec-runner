# Spec: automation-auth

## Requirements

### Requirement: login MUST NOT silently overwrite a stored GitHub token

`specrunner login` MUST detect an existing GitHub token in `credentials.json` before saving and
MUST NOT overwrite it unless the operator explicitly passes `--force`. Without `--force` the command
SHALL preserve the existing token, skip the device flow, emit a warning, and exit 0.

#### Scenario: stored token present, no --force

**Given** `credentials.json` already contains a non-empty `github.token`
**And** `--force` is not passed
**When** the operator runs `specrunner login`
**Then** the device flow does not run
**And** no write to `credentials.json` occurs
**And** a warning explains that the existing token was preserved and that `--force` is required to overwrite
**And** the command exits 0

#### Scenario: stored token present, with --force

**Given** `credentials.json` already contains a non-empty `github.token`
**And** `--force` is passed
**When** the operator runs `specrunner login`
**Then** the device flow runs
**And** the newly obtained token replaces `github.token` in `credentials.json`
**And** the command exits 0

#### Scenario: no stored token

**Given** `credentials.json` has no `github.token`
**And** no GitHub token is present in the environment
**When** the operator runs `specrunner login`
**Then** the device flow runs and the token is saved
**And** no overwrite warning is emitted
**And** the command exits 0

### Requirement: login SHALL warn when an environment GitHub token is active

`specrunner login` SHALL detect when `GH_TOKEN` or `GITHUB_TOKEN` is set in the environment and SHALL
warn that the environment token takes precedence over the credentials file, so the operator understands
the saved token will not be the resolved token until the environment variable is unset. The command
SHALL still proceed, because the environment token lives in the environment and is never lost by saving
to the credentials file.

#### Scenario: GH_TOKEN active during login

**Given** `GH_TOKEN` is set to a non-empty value in the environment
**And** `credentials.json` has no `github.token`
**When** the operator runs `specrunner login`
**Then** a warning states that `GH_TOKEN` takes precedence over the credentials file
**And** the device flow runs and the token is saved
**And** the environment variable value is unchanged
**And** the command exits 0

#### Scenario: GITHUB_TOKEN active during login

**Given** `GITHUB_TOKEN` is set to a non-empty value in the environment
**And** `credentials.json` has no `github.token`
**When** the operator runs `specrunner login`
**Then** a warning states that `GITHUB_TOKEN` takes precedence over the credentials file
**And** the device flow runs and the token is saved
**And** the command exits 0

### Requirement: doctor SHALL surface the resolved GitHub token source

`specrunner doctor` SHALL display the source from which the GitHub token is resolved — one of `env`,
`gh`, or `credentials` — so an operator can tell whether the interactive door (credentials) or the
automation door (environment variable) is currently in effect. When the source is `env`, the diagnosis
SHALL additionally name the specific environment variable (`GH_TOKEN` or `GITHUB_TOKEN`) that supplied
the token.

#### Scenario: token resolved from credentials

**Given** the GitHub token is resolved from `credentials.json`
**When** the operator runs `specrunner doctor`
**Then** the token check reports source `credentials`

#### Scenario: token resolved from gh subprocess

**Given** the GitHub token is resolved from the `gh auth token` subprocess
**When** the operator runs `specrunner doctor`
**Then** the token check reports source `gh`

#### Scenario: token resolved from environment variable

**Given** the GitHub token is resolved from `GH_TOKEN` in the environment
**When** the operator runs `specrunner doctor`
**Then** the token check reports source `env`
**And** the diagnosis names `GH_TOKEN` as the environment variable that supplied the token

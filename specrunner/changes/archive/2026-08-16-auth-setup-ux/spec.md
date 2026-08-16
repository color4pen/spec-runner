# Spec: auth/setup UX

## Requirements

### Requirement: login SHALL be GitHub-only and reject the removed `--provider` flag

`specrunner login` SHALL run only the GitHub Device Flow. The `--provider` flag SHALL NOT
appear as a normal flag or in the login help surface. An invocation of the removed
`login --provider ...` SHALL be captured as a deprecation and MUST exit non-zero while
directing the user to `specrunner credentials set claude-code`.

#### Scenario: --provider is absent from login help surface

**Given** the login command definition and its usage text
**When** the help/flag surface for `login` is inspected
**Then** `--provider` is not a registered normal flag and does not appear in the login usage text

#### Scenario: legacy `login --provider claude` is captured with migration guidance

**Given** a user runs `specrunner login --provider claude`
**When** the CLI parses the arguments
**Then** the CLI exits with a non-zero code
**And** the emitted message names `credentials set claude-code` as the replacement

### Requirement: login SHALL decide the Device Flow by the validity of the runtime-resolved token

`login` SHALL resolve the highest-priority GitHub token and its source using the same
resolution order used at runtime (GH_TOKEN → GITHUB_TOKEN → `gh auth token` → credentials.json)
and MUST verify that token's validity before deciding whether to run the Device Flow.

#### Scenario: valid top-priority token skips the Device Flow

**Given** the highest-priority resolved GitHub token is confirmed valid
**And** `--force` was not supplied
**When** `specrunner login` runs
**Then** the Device Flow is not started
**And** the resolved source is displayed
**And** the command exits 0

#### Scenario: invalid token from an env/gh source fails without a Device Flow

**Given** the highest-priority resolved GitHub token is invalid
**And** its source is GH_TOKEN, GITHUB_TOKEN, or `gh auth token`
**When** `specrunner login` runs
**Then** the Device Flow is not started
**And** the command directs the user to fix or unset that authentication source
**And** the command exits non-zero

#### Scenario: invalid token from credentials.json proceeds to the Device Flow

**Given** the highest-priority resolved GitHub token is invalid
**And** its source is credentials.json
**When** `specrunner login` runs
**Then** the GitHub Device Flow is started to refresh the stored credential

#### Scenario: no resolvable token proceeds to the Device Flow

**Given** no GitHub token is resolvable from any source
**When** `specrunner login` runs
**Then** the GitHub Device Flow is started

#### Scenario: validity cannot be confirmed does not overwrite silently

**Given** the highest-priority resolved GitHub token cannot be validated because the GitHub API is unreachable or times out
**And** `--force` was not supplied
**When** `specrunner login` runs
**Then** the Device Flow is not started
**And** the command advises checking connectivity and exits non-zero

#### Scenario: --force always runs the Device Flow

**Given** any resolution/validity state
**When** `specrunner login --force` runs
**Then** the GitHub Device Flow is started and the stored credential is overwritten

### Requirement: `credentials set <name>` SHALL store secrets to credentials.json without echoing input

`specrunner credentials set claude-code` and `specrunner credentials set anthropic-api-key`
SHALL persist the provided secret into credentials.json with 0600 permissions. Secret input
MUST NOT be echoed: on a TTY the input is read silently, and on a non-TTY it is read from stdin.

#### Scenario: credentials set claude-code stores the Claude Code token

**Given** a user runs `specrunner credentials set claude-code` and supplies a token
**When** the command completes
**Then** the token is written to `anthropic.claudeCodeOAuthToken` in credentials.json (mode 0600)
**And** the command points the user to `specrunner doctor` for verification

#### Scenario: credentials set anthropic-api-key stores the API key

**Given** a user runs `specrunner credentials set anthropic-api-key` and supplies a key
**When** the command completes
**Then** the key is written to `anthropic.apiKey` in credentials.json (mode 0600)

#### Scenario: secret input is not echoed

**Given** a user supplies a secret to `credentials set`
**When** the value is read on a TTY (silent) or from a non-TTY stdin
**Then** the secret value is never written to the output stream

#### Scenario: storing one secret preserves other stored credentials

**Given** credentials.json already contains a github token
**When** a user runs `specrunner credentials set anthropic-api-key`
**Then** the existing github token remains intact in credentials.json

### Requirement: guidance MUST reference only real, current commands

The codebase MUST NOT direct users to the removed `login --provider anthropic` or
`login --provider claude`. Any doctor hint that references a `specrunner` command MUST name a
command that exists in the current CLI.

#### Scenario: no dead `login --provider anthropic` guidance remains

**Given** the source tree under `src/`
**When** it is scanned for the string `login --provider anthropic`
**Then** no occurrence is found

#### Scenario: doctor hints reference registered commands only

**Given** the doctor check hints that reference a `specrunner` command
**When** each referenced command path is checked against the command registry
**Then** every referenced command (and subcommand) exists in the registry

### Requirement: doctor SHALL treat headless Claude credential absence as a warning, not a failure

The doctor check for a headless Claude Code credential SHALL report `warn` (not `fail`) when the
credential is unset, and its hint MUST note that the credential is only needed for cron / inbox use
and MUST name `credentials set claude-code`.

#### Scenario: unset headless Claude credential is a warn with a scoped note

**Given** no Claude Code OAuth token is resolvable
**When** the doctor check for the headless Claude credential runs
**Then** the result status is `warn`
**And** the hint states it is only needed for cron / inbox runs
**And** the hint names `specrunner credentials set claude-code`

### Requirement: doctor readiness SHALL be determined by fail == 0

The doctor human output SHALL report readiness based on `fail == 0`. When no checks fail, it MUST
print `Ready to run.` and a single next step even if warnings remain; when any check fails, it MUST
NOT print `Ready to run.`.

#### Scenario: warnings remain but no failures shows Ready plus next step

**Given** doctor results contain at least one warn and zero fail
**When** the human output is formatted
**Then** the output contains `Ready to run.`
**And** the output names `specrunner request new` as the next step

#### Scenario: a failing check suppresses Ready

**Given** doctor results contain at least one fail
**When** the human output is formatted
**Then** the output does not contain `Ready to run.`

### Requirement: init MUST NOT silently ignore the provider flag when a global config exists

When a global config already exists and the provider flag is supplied, `init` MUST output that the
flag was ignored and where to change the setting, and MUST NOT overwrite the existing config.

#### Scenario: provider flag under an existing global config emits a notice

**Given** a global config already exists
**When** a user runs `init` with the provider flag set
**Then** `init` outputs that the flag was ignored and names the config file to edit
**And** the existing config is left unchanged

### Requirement: README Quick Start SHALL present a doctor-centered setup flow

The README Quick Start section SHALL guide users through init → doctor → set up only what is missing
→ doctor → first job, and MUST NOT present `specrunner login` as an unconditional required step.

#### Scenario: Quick Start centers on doctor

**Given** the README Quick Start section
**When** it is read
**Then** it references `specrunner doctor` as the step that reports what is missing
**And** it does not present `specrunner login` as an unconditional required step

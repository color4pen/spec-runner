# Spec:

## Requirements

### Requirement: Claude Code OAuth token shall be stored as a file-backed credential

SpecRunner SHALL support storing a Claude Code OAuth token in `~/.config/specrunner/credentials.json` under a distinct credential key for Claude Code OAuth authentication.

#### Scenario: login stores the Claude Code token

**Given** the user has generated a long-lived token with `claude setup-token`  
**When** the user runs the Claude provider login flow and enters a non-empty token  
**Then** SpecRunner writes the token to `credentials.json` under `anthropic.claudeCodeOAuthToken`  
**And** the file write preserves the existing credentials file permission and atomic-write behavior.

#### Scenario: login does not overwrite without force

**Given** `credentials.json` already contains `anthropic.claudeCodeOAuthToken`  
**When** the user runs the Claude provider login flow without force  
**Then** SpecRunner retains the existing token  
**And** tells the user how to overwrite it.

### Requirement: Local Claude Code runs shall resolve credentials without crontab secrets

Local runtime execution SHALL pass `CLAUDE_CODE_OAUTH_TOKEN` to the Claude Agent SDK from `credentials.json` when the process environment does not already provide the upstream env var.

#### Scenario: credentials token is injected when env is absent

**Given** `credentials.json` contains `anthropic.claudeCodeOAuthToken`  
**And** `CLAUDE_CODE_OAUTH_TOKEN` is not set in the process environment  
**When** SpecRunner starts a local Claude Code agent run  
**Then** the SDK `options.env` includes `CLAUDE_CODE_OAUTH_TOKEN` with the stored token value.

#### Scenario: environment token has precedence

**Given** `credentials.json` contains `anthropic.claudeCodeOAuthToken`  
**And** `CLAUDE_CODE_OAUTH_TOKEN` is set in the process environment  
**When** SpecRunner starts a local Claude Code agent run  
**Then** the SDK `options.env` uses the environment token value  
**And** does not replace it with the stored credential.

#### Scenario: process environment is not mutated

**Given** `credentials.json` contains `anthropic.claudeCodeOAuthToken`  
**When** SpecRunner starts a local Claude Code agent run  
**Then** SpecRunner MUST inject the token only into the SDK env object  
**And** MUST NOT mutate `process.env`.

### Requirement: Credential requirements shall declare the Claude Code OAuth token

The runtime credential matrix SHALL include a local-runtime requirement for the Claude Code OAuth token using credential key `anthropic.claudeCodeOAuthToken` and env var `CLAUDE_CODE_OAUTH_TOKEN`.

#### Scenario: local runtime requirements include Claude Code OAuth

**Given** runtime credential requirements are requested for `local`  
**When** SpecRunner evaluates the requirements matrix  
**Then** the returned requirements include `github.token`  
**And** include `anthropic.claudeCodeOAuthToken` with env var `CLAUDE_CODE_OAUTH_TOKEN`.

#### Scenario: managed runtime requirements are unchanged

**Given** runtime credential requirements are requested for `managed`  
**When** SpecRunner evaluates the requirements matrix  
**Then** the returned requirements include `github.token` and `anthropic.apiKey`  
**And** do not include `anthropic.claudeCodeOAuthToken`.

### Requirement: Doctor shall report Claude Code credential source

`specrunner doctor` SHALL report whether the Claude Code OAuth credential resolves from env, from `credentials.json`, or is unset, without printing the secret value.

#### Scenario: doctor reports env source

**Given** `CLAUDE_CODE_OAUTH_TOKEN` is set in the environment  
**When** the user runs `specrunner doctor`  
**Then** doctor reports the Claude Code credential source as env  
**And** the token value is not present in human or JSON output.

#### Scenario: doctor reports credentials source

**Given** `CLAUDE_CODE_OAUTH_TOKEN` is unset  
**And** `credentials.json` contains `anthropic.claudeCodeOAuthToken`  
**When** the user runs `specrunner doctor`  
**Then** doctor reports the Claude Code credential source as credentials.json  
**And** the token value is not present in human or JSON output.

#### Scenario: doctor reports unset source

**Given** `CLAUDE_CODE_OAUTH_TOKEN` is unset  
**And** `credentials.json` does not contain `anthropic.claudeCodeOAuthToken`  
**When** the user runs `specrunner doctor`  
**Then** doctor reports the Claude Code credential as unset  
**And** provides guidance to run `claude setup-token` and store the token with SpecRunner login.

### Requirement: Existing environment-variable operation shall remain compatible

SpecRunner MUST preserve current behavior for users who already provide `CLAUDE_CODE_OAUTH_TOKEN` through crontab or another environment mechanism.

#### Scenario: existing crontab env continues to work

**Given** a user already sets `CLAUDE_CODE_OAUTH_TOKEN` before invoking SpecRunner  
**When** SpecRunner runs the local Claude Code agent  
**Then** SpecRunner passes that existing env value through to the SDK  
**And** does not require the token to be present in `credentials.json`.

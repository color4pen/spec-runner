# Test Cases: headless Claude credential を file-backed にして headless 実行を安全化する

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 13, should: 4, could: 1

---

### TC-001: login stores Claude Code token

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Claude Code OAuth token shall be stored as a file-backed credential > Scenario: login stores the Claude Code token

---

### TC-002: login does not overwrite without force

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Claude Code OAuth token shall be stored as a file-backed credential > Scenario: login does not overwrite without force

---

### TC-003: credentials token is injected when env is absent

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Local Claude Code runs shall resolve credentials without crontab secrets > Scenario: credentials token is injected when env is absent

---

### TC-004: environment token has precedence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Local Claude Code runs shall resolve credentials without crontab secrets > Scenario: environment token has precedence

---

### TC-005: process environment is not mutated

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Local Claude Code runs shall resolve credentials without crontab secrets > Scenario: process environment is not mutated

---

### TC-006: local runtime requirements include Claude Code OAuth

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Credential requirements shall declare the Claude Code OAuth token > Scenario: local runtime requirements include Claude Code OAuth

---

### TC-007: managed runtime requirements are unchanged

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Credential requirements shall declare the Claude Code OAuth token > Scenario: managed runtime requirements are unchanged

---

### TC-008: doctor reports env source

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Doctor shall report Claude Code credential source > Scenario: doctor reports env source

---

### TC-009: doctor reports credentials source

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Doctor shall report Claude Code credential source > Scenario: doctor reports credentials source

---

### TC-010: doctor reports unset source

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Doctor shall report Claude Code credential source > Scenario: doctor reports unset source

---

### TC-011: existing crontab env continues to work

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Existing environment-variable operation shall remain compatible > Scenario: existing crontab env continues to work

---

### TC-012: CredentialsFile accepts Claude Code OAuth token alongside existing fields

**Category**: unit
**Priority**: must
**Source**: design.md > D1, tasks.md > T-01 Acceptance Criteria

**GIVEN** a credentials payload that already contains `github.token` and `anthropic.apiKey`
**WHEN** a Claude Code OAuth token is added at `anthropic.claudeCodeOAuthToken` as a string
**THEN** the payload validates successfully
**AND** the existing GitHub token and Anthropic API key remain present and unchanged

---

### TC-013: malformed Claude Code token is rejected by credential validation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria, tasks.md > T-06 Acceptance Criteria

**GIVEN** a credentials payload where `anthropic.claudeCodeOAuthToken` is present but not a string
**WHEN** credentials validation runs
**THEN** validation fails
**AND** the failure does not expose the token value
**AND** other credential fields are still validated according to existing rules

---

### TC-014: saving Claude credentials preserves atomic write and 0600 mode

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** an existing credentials file containing `github.token` and `anthropic.apiKey`
**WHEN** `saveCredentials` stores `anthropic.claudeCodeOAuthToken`
**THEN** the write still uses the atomic-write path
**AND** the resulting file mode is no looser than `0600`
**AND** the existing GitHub token and Anthropic API key remain in the file

---

### TC-015: login with `--force` overwrites an existing Claude token

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `credentials.json` already contains `anthropic.claudeCodeOAuthToken`
**WHEN** the user runs `specrunner login --provider claude --force` and enters a new token
**THEN** the stored token is replaced with the new value
**AND** the command does not retain the previous token

---

### TC-016: login warns when `CLAUDE_CODE_OAUTH_TOKEN` is already set

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `CLAUDE_CODE_OAUTH_TOKEN` is already set in the process environment
**WHEN** the user runs `specrunner login --provider claude`
**THEN** the CLI warns that the environment variable will take precedence over the stored credential
**AND** the warning does not print the secret value

---

### TC-017: empty Claude login input is rejected

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** the Claude login prompt is shown
**WHEN** the user submits an empty token or whitespace-only input
**THEN** the command rejects the input
**AND** no credential is written to `credentials.json`
**AND** the token value is not echoed to logs

---

### TC-018: CLI help mentions the Claude provider flow

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** the user asks for `specrunner login --help`
**WHEN** the help output is rendered
**THEN** it mentions the Claude provider selector
**AND** it points users at `claude setup-token` for generating the OAuth token

## Result
```yaml
result: completed
total: 18
automated: 18
manual: 0
must: 13
should: 4
could: 1
blocked_reasons: []
```

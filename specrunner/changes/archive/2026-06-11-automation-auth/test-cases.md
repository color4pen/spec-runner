# Test Cases: automation-auth

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 12
- **Manual**: 3
- **Priority**: must: 7, should: 7, could: 1

---

### TC-001: login — stored token present, no --force

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login MUST NOT silently overwrite a stored GitHub token > Scenario: stored token present, no --force

---

### TC-002: login — stored token present, with --force

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login MUST NOT silently overwrite a stored GitHub token > Scenario: stored token present, with --force

---

### TC-003: login — no stored token

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: login MUST NOT silently overwrite a stored GitHub token > Scenario: no stored token

---

### TC-004: login — GH_TOKEN active during login

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: login SHALL warn when an environment GitHub token is active > Scenario: GH_TOKEN active during login

---

### TC-005: login — GITHUB_TOKEN active during login

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: login SHALL warn when an environment GitHub token is active > Scenario: GITHUB_TOKEN active during login

---

### TC-006: doctor — token resolved from credentials

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL surface the resolved GitHub token source > Scenario: token resolved from credentials

---

### TC-007: doctor — token resolved from gh subprocess

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL surface the resolved GitHub token source > Scenario: token resolved from gh subprocess

---

### TC-008: doctor — token resolved from GH_TOKEN environment variable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL surface the resolved GitHub token source > Scenario: token resolved from environment variable

---

### TC-009: doctor — env source names GITHUB_TOKEN when GH_TOKEN is absent

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-04

**GIVEN** `GITHUB_TOKEN` is set to a non-empty value in the environment
**AND** `GH_TOKEN` is not set
**WHEN** the operator runs `specrunner doctor`
**THEN** the token check reports source `env`
**AND** the details line names `GITHUB_TOKEN` as the environment variable that supplied the token

---

### TC-010: login — stored token present AND env token active, no --force

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02, T-03

**GIVEN** `credentials.json` contains a non-empty `github.token`
**AND** `GH_TOKEN` is set to a non-empty value in the environment
**AND** `--force` is not passed
**WHEN** the operator runs `specrunner login`
**THEN** a warning about env token precedence is emitted
**AND** a warning about the existing stored token being preserved is emitted
**AND** the device flow does not run
**AND** no write to `credentials.json` occurs
**AND** the command exits 0

---

### TC-011: runLogin accepts injectable env for test isolation

**Category**: unit
**Priority**: should
**Source**: design.md > D2 Risk mitigation / tasks.md > T-02, T-03

**GIVEN** `runLogin` is called with `opts.env` set to an empty object `{}`
**WHEN** `GH_TOKEN` and `GITHUB_TOKEN` exist in `process.env` on the host machine
**THEN** no env-precedence warning is emitted
**AND** the behavior is determined solely by the injected empty env

---

### TC-012: --force flag wired from CLI through to runLogin

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (command-registry.ts --force flag)

**GIVEN** the login command is registered in `command-registry.ts` with a `--force` boolean flag
**WHEN** the CLI is invoked with `specrunner login --force`
**THEN** `runLogin` is called with `{ force: true }`

---

### TC-013: README contains 3-door authentication table

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D1

**GIVEN** `README.md` has been updated
**WHEN** a reviewer reads the GitHub authentication section
**THEN** a table listing 3 authentication doors is present: interactive `login`, GitHub Actions (`GITHUB_TOKEN`), and self-hosted server/cron (`GH_TOKEN` + fine-grained PAT)
**AND** each door shows its context, token type, and setup method
**AND** the fine-grained PAT door notes the maximum 1-year expiry
**AND** the table is consistent with `resolveGitHubToken`'s priority order (`GH_TOKEN` first)

---

### TC-014: README Environment Variables table includes GH_TOKEN and GITHUB_TOKEN

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `README.md` has been updated
**WHEN** a reviewer reads the Environment Variables reference table
**THEN** `GH_TOKEN` is listed with its purpose and priority
**AND** `GITHUB_TOKEN` is listed with its purpose and priority
**AND** descriptions align with the priority order documented in the 3-door table

---

### TC-015: README references doctor source check as diagnostic guidance

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** `README.md` has been updated
**WHEN** a reviewer reads the authentication section
**THEN** a line directs operators to run `specrunner doctor` to confirm which token source is currently resolved

---

## Result

```yaml
result: completed
total: 15
automated: 12
manual: 3
must: 7
should: 7
could: 1
blocked_reasons: []
```

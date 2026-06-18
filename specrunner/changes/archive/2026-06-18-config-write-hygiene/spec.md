# Spec: config-write-hygiene

## Requirements

### Requirement: saveConfig shall not strip the github field

`saveConfig` in `src/config/store.ts` SHALL NOT delete the `github` key from the object before writing. The `agent`, `timeout`, and `anthropic` keys SHALL continue to be stripped (legacy schema fields).

#### Scenario: GHES config survives saveConfig

**Given** a `SpecRunnerConfig` object with `github: { host: "ghes.example.com", apiBaseUrl: "https://ghes.example.com/api/v3" }`
**When** `saveConfig(cfg)` is called
**Then** the written JSON contains `github.host` and `github.apiBaseUrl` unchanged

#### Scenario: Legacy fields are still stripped

**Given** a `SpecRunnerConfig` object with legacy `agent`, `timeout`, and `anthropic` fields present in memory
**When** `saveConfig(cfg)` is called
**Then** the written JSON does not contain `agent`, `timeout`, or `anthropic` keys

---

### Requirement: init shall not overwrite an existing global config

`runInit` in `src/cli/init.ts` SHALL generate the global config scaffold only when `~/.config/specrunner/config.json` (XDG-resolved path) does not exist. If the file already exists, `runInit` SHALL NOT call `loadConfig` or `saveConfig`. In both cases, the project scaffold (`.gitignore`, `specrunner/drafts/`, `specrunner/changes/`) SHALL be created idempotently.

#### Scenario: First-time init creates global config

**Given** `~/.config/specrunner/config.json` does not exist
**When** `runInit({})` is called
**Then** `config.json` is created with `version: 1` and `steps.defaults` populated, exit code is 0

#### Scenario: Repeated init does not overwrite

**Given** `~/.config/specrunner/config.json` exists with `github: { host: "ghes.example.com" }`
**When** `runInit({})` is called
**Then** `config.json` is not modified (the `github` field is preserved), exit code is 0

#### Scenario: Project scaffold is created regardless

**Given** the CWD is a git repository and `~/.config/specrunner/config.json` already exists
**When** `runInit({})` is called
**Then** `specrunner/drafts/` and `specrunner/changes/` directories exist, exit code is 0

---

### Requirement: login shall not overwrite an existing global config

`runLogin` in `src/cli/login.ts` SHALL save the config scaffold only when `~/.config/specrunner/config.json` does not exist. If the file already exists, `runLogin` SHALL NOT call `saveConfig`. Token storage to `credentials.json` is unaffected by this condition.

#### Scenario: login with no existing config creates scaffold

**Given** `~/.config/specrunner/config.json` does not exist and device flow succeeds
**When** `runLogin({})` is called
**Then** `config.json` is created with `version: 1`, token is saved to `credentials.json`, exit code is 0

#### Scenario: login with existing config preserves it

**Given** `~/.config/specrunner/config.json` exists with `github: { host: "ghes.example.com" }`
**And** device flow succeeds
**When** `runLogin({})` is called
**Then** `config.json` is not modified, token is saved to `credentials.json`, exit code is 0

---

### Requirement: login.ts stale comment shall be updated

The comment on the `saveConfig` call in `src/cli/login.ts` (currently `// Save config scaffold (without github field — secrets go to credentials file)`) SHALL be replaced with a comment that accurately describes the create-only scaffold behavior.

#### Scenario: Stale comment is absent after the change

**Given** `src/cli/login.ts` has been updated per this change
**When** the file is read
**Then** the phrase "without github field" does not appear in any comment in the file

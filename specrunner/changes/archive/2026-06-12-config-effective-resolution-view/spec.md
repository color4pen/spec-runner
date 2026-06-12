# Spec: Effective Step Config Resolution View

## Requirements

### Requirement: The CLI shall display effective step execution config with source attribution

The system SHALL provide a read-only CLI command that displays each standard agent step's effective `model`, `maxTurns`, and `timeoutMs`, and for each field it SHALL identify the winning source layer and resolution level.

#### Scenario: project defaults are visible for inherited values

**Given** a project local config defines `steps.defaults.model: "gpt-5.5"`
**And** no higher-priority candidate defines `implementer.model`
**When** the user runs `specrunner config effective --type bug-fix`
**Then** the `implementer` row shows `model` as `"gpt-5.5"`
**And** the `model` source identifies `project` and `steps.defaults.model`.

#### Scenario: user global step request-type setting beats project defaults

**Given** user global config defines `steps.design.byRequestType.bug-fix.model: "claude-sonnet-4-6"`
**And** project local config defines `steps.defaults.model: "gpt-5.5"`
**When** the user runs `specrunner config effective --type bug-fix`
**Then** the `design` row shows `model` as `"claude-sonnet-4-6"`
**And** the `model` source identifies `user` and `steps.design.byRequestType.bug-fix.model`
**And** the output makes clear that this is a higher-priority level than `steps.defaults.model`.

### Requirement: Request type shall affect displayed resolution

The command MUST accept an optional request type flag. When the flag is present, the system SHALL resolve `byRequestType` candidates for that request type. When the flag is absent, the system SHALL skip `byRequestType` candidates and label the display as request-type-less resolution.

#### Scenario: request type changes byRequestType result

**Given** config defines `steps.design.byRequestType.bug-fix.model: "claude-sonnet-4-6"`
**And** config defines `steps.design.byRequestType.new-feature.model: "gpt-5.5"`
**When** the user runs `specrunner config effective --type bug-fix`
**Then** the `design` model is `"claude-sonnet-4-6"`.

**When** the user runs `specrunner config effective --type new-feature`
**Then** the `design` model is `"gpt-5.5"`.

#### Scenario: omitted request type skips byRequestType

**Given** config defines `steps.design.byRequestType.bug-fix.model: "claude-sonnet-4-6"`
**And** config defines `steps.defaults.model: "gpt-5.5"`
**When** the user runs `specrunner config effective`
**Then** the output labels `requestType` as `none`
**And** the `design` model is resolved from `steps.defaults.model`, not from `steps.design.byRequestType.bug-fix.model`.

### Requirement: Fallbacks shall be displayed as explicit sources

When a field is not configured in user global or project local config, the system SHALL display the fallback source as `stepdef` for step definition defaults or `sdk` for SDK defaults.

#### Scenario: unconfigured step uses hardcoded model

**Given** neither user global config nor project local config defines a model for `conformance`
**When** the user runs `specrunner config effective --type bug-fix`
**Then** the `conformance` row shows the model from the hardcoded step definition
**And** the `model` source identifies `stepdef`.

#### Scenario: unconfigured nullable field uses SDK default

**Given** neither config nor the step definition defines `timeoutMs` for a step
**When** the user runs `specrunner config effective --json`
**Then** that step's `timeoutMs.value` is `null`
**And** that step's `timeoutMs.source.layer` is `sdk`.

### Requirement: The command shall not change execution semantics

The implementation MUST NOT change the behavior of config loading, config merging, config schema validation, or runtime step execution resolution.

#### Scenario: traced values match existing resolver values

**Given** any valid config fixture used by the new trace tests
**When** the trace API resolves a step and request type
**Then** the effective values in the trace match `getStepExecutionConfig` for `model`, `maxTurns`, and `timeoutMs`.

### Requirement: JSON output shall be stable for tests and tooling

The command SHALL support `--json` output containing request type context and per-step field source records.

#### Scenario: JSON contains field-level source records

**Given** a valid config
**When** the user runs `specrunner config effective --type bug-fix --json`
**Then** stdout is valid JSON
**And** each step record contains `step`, `model`, `maxTurns`, and `timeoutMs`
**And** each field record contains `value` and `source`
**And** each `source` contains at least `layer` and `level`.

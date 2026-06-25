# Spec: provider-aware init

## Requirements

### Requirement: init shall accept a provider selection

`specrunner init` SHALL accept the provider via a `--provider anthropic|openai` flag.
When the flag is omitted and stdin is a TTY, init SHALL prompt the user interactively
to choose a provider. When the flag is omitted and stdin is not a TTY, init SHALL
default to `anthropic` to preserve current behavior. An invalid `--provider` value
MUST be rejected by the CLI flag layer (allowed values: `anthropic`, `openai`).

#### Scenario: explicit flag selects openai

**Given** no specrunner global config exists
**When** the user runs `specrunner init --provider openai`
**Then** init resolves the provider to `openai` without prompting

#### Scenario: TTY prompt with no flag

**Given** no specrunner global config exists and stdin is a TTY
**When** the user runs `specrunner init` and answers the provider prompt with the OpenAI choice
**Then** init resolves the provider to `openai`

#### Scenario: non-TTY defaults to anthropic

**Given** no specrunner global config exists and stdin is not a TTY (e.g. CI)
**When** the user runs `specrunner init` with no `--provider` flag
**Then** init resolves the provider to `anthropic`

### Requirement: init shall write provider-aware default models into the scaffold

When init generates a new global config scaffold, it SHALL write the selected
provider's default model into `steps.defaults.model`. For the `openai` provider it
SHALL additionally write `steps.design.model` with the provider's high-quality
design model. For the `anthropic` provider the generated config MUST be identical to
the legacy scaffold (only `steps.defaults` is written; no `steps.design` section),
relying on the design step's built-in default model.

#### Scenario: openai scaffold contains provider models

**Given** no specrunner global config exists
**When** the user runs `specrunner init --provider openai`
**Then** the generated config contains `steps.defaults.model` = `gpt-5.4-mini`
**And** the generated config contains `steps.design.model` = `gpt-5.5`

#### Scenario: anthropic scaffold is identical to legacy

**Given** no specrunner global config exists
**When** the user runs `specrunner init --provider anthropic`
**Then** the generated config contains `steps.defaults.model` = `claude-sonnet-4-6`
**And** the generated config contains no `steps.design` section

### Requirement: init shall not modify an existing config

When a specrunner global config already exists, init SHALL NOT prompt for a provider
and MUST NOT rewrite the config, regardless of whether `--provider` is supplied.

#### Scenario: existing config is preserved with provider flag

**Given** a specrunner global config already exists on disk
**When** the user runs `specrunner init --provider openai`
**Then** the config file content is unchanged
**And** no provider prompt is shown

### Requirement: the built-in model registry shall track current OpenAI models

The built-in model registry MUST NOT contain the deprecated OpenAI models `o3`,
`gpt-5.1`, `gpt-5.2-codex`, and `gpt-5.3-codex`. The registry SHALL contain the
current OpenAI models `gpt-5.4-mini` and `gpt-5.3-codex-spark`, in addition to the
existing `gpt-5.4` and `gpt-5.5`. All Anthropic entries MUST remain unchanged.

#### Scenario: deprecated models removed

**Given** the built-in model registry
**When** it is inspected
**Then** it does not contain `o3`, `gpt-5.1`, `gpt-5.2-codex`, or `gpt-5.3-codex`

#### Scenario: current models present

**Given** the built-in model registry
**When** it is inspected
**Then** `gpt-5.4-mini` and `gpt-5.3-codex-spark` resolve to provider `openai`
**And** `gpt-5.4` and `gpt-5.5` still resolve to provider `openai`

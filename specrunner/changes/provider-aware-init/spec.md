# Spec: provider-aware-init

## Requirements

### Requirement: init shall write provider-appropriate default models to the config scaffold

When generating a new global config scaffold, `specrunner init` SHALL select default models
from a provider-keyed table (`PROVIDER_DEFAULTS`) according to the `--provider` flag value and
write them into the scaffold's `steps` section. The flag value MUST be one of `anthropic` or
`openai`; any other value MUST be rejected by the flag parser before `runInit` executes.

#### Scenario: openai provider writes both defaults and design models

**Given** no global config exists
**When** the user runs `specrunner init --provider openai`
**Then** the generated config contains `steps.defaults.model: "gpt-5.4-mini"`
**And** the generated config contains `steps.design.model: "gpt-5.5"`

#### Scenario: anthropic provider writes only defaults model

**Given** no global config exists
**When** the user runs `specrunner init --provider anthropic`
**Then** the generated config contains `steps.defaults.model: "claude-sonnet-4-6"`
**And** the generated config does NOT contain a `steps.design` key

#### Scenario: invalid provider value is rejected

**Given** the user runs `specrunner init --provider gemini`
**When** the CLI parses the flags
**Then** a flag parse error is raised and `runInit` is not invoked

### Requirement: init shall default to the anthropic provider when the flag is omitted

When `--provider` is omitted, `specrunner init` SHALL behave as if `--provider anthropic` was
given, producing a config byte-identical to the legacy scaffold (no `steps.design` key, no
`provider` field).

#### Scenario: no flag reproduces the legacy scaffold

**Given** no global config exists
**When** the user runs `specrunner init` with no `--provider` flag
**Then** the generated config contains `steps.defaults.model: "claude-sonnet-4-6"`
**And** the generated config does NOT contain a `steps.design` key
**And** the generated config does NOT contain a `provider` field

### Requirement: init shall not modify an existing config regardless of provider

When a global config already exists, `specrunner init` MUST NOT rewrite it, irrespective of the
`--provider` flag. Project scaffold creation (`.gitignore`, `drafts/`, `changes/`) remains
idempotent and unaffected.

#### Scenario: existing config is preserved under --provider openai

**Given** a global config already exists with `steps.defaults.model: "claude-sonnet-4-6"`
**When** the user runs `specrunner init --provider openai`
**Then** the config file content is unchanged

### Requirement: the model registry shall reflect the current Codex model set

`BUILTIN_MODEL_REGISTRY` MUST NOT contain the deprecated OpenAI models `o3`, `gpt-5.1`,
`gpt-5.2-codex`, `gpt-5.3-codex`, and MUST contain `gpt-5.4`, `gpt-5.5`, `gpt-5.4-mini`,
`gpt-5.3-codex-spark`, each mapped to provider `openai`. Anthropic entries are unchanged.

#### Scenario: deprecated openai models are absent

**Given** the built-in model registry
**When** it is inspected
**Then** `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` are not present

#### Scenario: current openai models are present

**Given** the built-in model registry
**When** it is inspected
**Then** `gpt-5.4-mini` and `gpt-5.3-codex-spark` are present with provider `openai`

### Requirement: every provider default model shall be resolvable via the model registry

Each model name listed in `PROVIDER_DEFAULTS` (both `defaults` and `design` roles, all providers)
SHALL exist in `BUILTIN_MODEL_REGISTRY` so that `resolveProvider` never throws `CONFIG_INVALID`
for a freshly `init`-generated scaffold.

#### Scenario: openai default models resolve to the openai provider

**Given** the merged model registry for a bare config
**When** `resolveProvider` is called for `PROVIDER_DEFAULTS.openai.defaults` and `.design`
**Then** each call returns `"openai"` without throwing

# Spec: モデルカタログ更新 (Claude 5 / GPT-5.6)

## Requirements

### Requirement: registry SHALL recognize Claude 5 and GPT-5.6 models

`BUILTIN_MODEL_REGISTRY` MUST contain the six new models so that
`resolveProvider(name, mergeModelRegistry(config))` returns the correct provider
without throwing `CONFIG_INVALID`. Existing registry entries MUST remain present
and unchanged.

- anthropic: `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`
- openai: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`

#### Scenario: new anthropic models resolve to "anthropic"

**Given** a bare config with no user `models` override
**When** `resolveProvider(name, mergeModelRegistry(config))` is called with `name` in
{ `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5` }
**Then** it returns `"anthropic"` for each, without throwing

#### Scenario: new openai models resolve to "openai"

**Given** a bare config with no user `models` override
**When** `resolveProvider(name, mergeModelRegistry(config))` is called with `name` in
{ `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` }
**Then** it returns `"openai"` for each, without throwing

#### Scenario: existing models remain resolvable

**Given** a bare config with no user `models` override
**When** `resolveProvider` is called for a pre-existing registry model such as
`gpt-5.4-mini`, `gpt-5.5`, or `claude-sonnet-4-5`
**Then** it returns the same provider as before this change (openai / openai / anthropic)

### Requirement: cost computation SHALL use the request-specified rates for new and corrected models

`MODEL_PRICING` MUST contain the six new rows and the corrected `gpt-5.5` row so
that `computeCostUsd(model, usage)` returns a value derived from the following
per-MTok rates (USD/MTok). The `gpt-5.5` row MUST be the corrected value, not the
former o3-tier approximation.

| key | input | output | cacheRead | cacheWrite |
|---|---|---|---|---|
| claude-opus-5 | 5.0 | 25.0 | 0.5 | 6.25 |
| claude-sonnet-5 | 3.0 | 15.0 | 0.3 | 3.75 |
| claude-fable-5 | 10.0 | 50.0 | 1.0 | 12.5 |
| gpt-5.6-sol | 5.0 | 30.0 | 0.5 | 0 |
| gpt-5.6-terra | 2.0 | 12.0 | 0.2 | 0 |
| gpt-5.6-luna | 0.2 | 1.2 | 0.02 | 0 |
| gpt-5.5 (corrected) | 5.0 | 30.0 | 0.5 | 0 |

#### Scenario: computeCostUsd returns request-specified cost for each new model

**Given** a usage of `{ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadInputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000 }`
**When** `computeCostUsd(model, usage)` is called for each new model
**Then** it returns the sum `input + output + cacheRead + cacheWrite` per the table above:

| model | expected USD |
|---|---|
| claude-opus-5 | 36.75 |
| claude-sonnet-5 | 22.05 |
| claude-fable-5 | 73.5 |
| gpt-5.6-sol | 35.5 |
| gpt-5.6-terra | 14.2 |
| gpt-5.6-luna | 1.42 |

#### Scenario: corrected gpt-5.5 cost reflects the real price, not the o3 approximation

**Given** a usage of `{ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadInputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000 }`
**When** `computeCostUsd("gpt-5.5", usage)` is called
**Then** it returns `35.5` (input 5 + output 30 + cacheRead 0.5 + cacheWrite 0),
not the former `52.5` produced by the o3-tier approximation (10 + 40 + 2.5 + 0)

#### Scenario: every built-in registry model has pricing

**Given** the updated `BUILTIN_MODEL_REGISTRY`
**When** `lookupPricing(name)` is called for every entry
**Then** it returns a non-null result for every model (no registry entry is missing a pricing row)

### Requirement: openai scaffold defaults SHALL migrate to the GPT-5.6 successors

`PROVIDER_DEFAULTS.openai` MUST be `{ defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }`,
and `specrunner init --provider openai` MUST scaffold a config whose
`steps.defaults.model` is `gpt-5.6-luna` and whose `steps.design.model` is `gpt-5.6-sol`.
The anthropic scaffold behavior MUST remain unchanged.

#### Scenario: PROVIDER_DEFAULTS.openai holds the successor models

**Given** the updated `model-registry.ts`
**When** `PROVIDER_DEFAULTS.openai` is read
**Then** `defaultModel` is `"gpt-5.6-luna"` and `designModel` is `"gpt-5.6-sol"`

#### Scenario: openai init scaffold writes the successor models

**Given** a fresh repo with no existing global config
**When** `runInit({ provider: "openai", repoRoot })` runs
**Then** the written config has `steps.defaults.model === "gpt-5.6-luna"` and
`steps.design.model === "gpt-5.6-sol"`

#### Scenario: anthropic init scaffold is unaffected

**Given** a fresh repo with no existing global config
**When** `runInit({ provider: "anthropic", repoRoot })` runs
**Then** the written config has `steps.defaults.model === "claude-sonnet-4-6"` and no
`steps.design` block (unchanged legacy behavior)

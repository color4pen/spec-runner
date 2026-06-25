# Test Cases: provider-aware-init

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 24
- **Manual**: 1
- **Priority**: must: 17, should: 6, could: 2

---

### TC-001: explicit flag selects openai

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall accept a provider selection > Scenario: explicit flag selects openai

---

### TC-002: TTY prompt with no flag

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall accept a provider selection > Scenario: TTY prompt with no flag

---

### TC-003: non-TTY defaults to anthropic

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall accept a provider selection > Scenario: non-TTY defaults to anthropic

---

### TC-004: openai scaffold contains provider models

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall write provider-aware default models into the scaffold > Scenario: openai scaffold contains provider models

---

### TC-005: anthropic scaffold is identical to legacy

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall write provider-aware default models into the scaffold > Scenario: anthropic scaffold is identical to legacy

---

### TC-006: existing config is preserved with provider flag

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall not modify an existing config > Scenario: existing config is preserved with provider flag

---

### TC-007: deprecated models removed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the built-in model registry shall track current OpenAI models > Scenario: deprecated models removed

---

### TC-008: current models present

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the built-in model registry shall track current OpenAI models > Scenario: current models present

---

### TC-009: PROVIDER_DEFAULTS constants have correct values

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `PROVIDER_DEFAULTS` is imported from `src/config/model-registry.ts`
**WHEN** the `anthropic` and `openai` entries are inspected
**THEN** `anthropic.defaultModel === "claude-sonnet-4-6"` and `openai.defaultModel === "gpt-5.4-mini"` and `openai.designModel === "gpt-5.5"`

---

### TC-010: PROVIDER_DEFAULTS.anthropic has no designModel

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D1

**GIVEN** `PROVIDER_DEFAULTS` is imported from `src/config/model-registry.ts`
**WHEN** `PROVIDER_DEFAULTS.anthropic` is inspected
**THEN** `designModel` is `undefined` (design step falls through to design.ts built-in `claude-opus-4-6[1m]`)

---

### TC-011: PROVIDER_DEFAULTS and ProviderDefaults exported from model-registry.ts

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/config/model-registry.ts` with the new additions
**WHEN** `ProviderDefaults` type and `PROVIDER_DEFAULTS` constant are imported in `init.ts`
**THEN** imports resolve without error and both identifiers are accessible at the call site

---

### TC-012: anthropic registry entries unchanged after update

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `BUILTIN_MODEL_REGISTRY` after the OpenAI deprecated-model removal and new-model additions
**WHEN** the anthropic entries are enumerated
**THEN** every anthropic model that existed before the change still exists with the same `provider` value and no anthropic entries have been added or removed

---

### TC-013: gpt-5.4 and gpt-5.5 remain in registry after update

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `BUILTIN_MODEL_REGISTRY` after deprecated models are removed
**WHEN** `gpt-5.4` and `gpt-5.5` are looked up
**THEN** both resolve with `provider === "openai"` and are not accidentally removed

---

### TC-014: deprecated model removal — affected test fixtures pass with gpt-5.4

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria, design.md > Risks

**GIVEN** `tests/config/schema.test.ts`, `tests/core/doctor/checks/runtime/codex-cli.test.ts`, and `tests/adapter/dispatching/agent-runner.test.ts` have had `"o3"` references replaced with `"gpt-5.4"`
**WHEN** the test suite runs
**THEN** all four affected test files pass with the same assertion intent as before (registry provider resolution / schema validation / doctor hasOpenAiSteps judgment / openai dispatch routing to CodexAgentRunner)

---

### TC-015: resolveInitProvider — explicit flag takes precedence over TTY

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = "openai"` and `io = { isTTY: true, ask: async () => "1" }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"openai"` immediately without calling `io.ask`

---

### TC-016: resolveInitProvider — non-TTY defaults to anthropic

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = undefined` and `io = { isTTY: false, ask: jest.fn() }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"anthropic"` without calling `io.ask`

---

### TC-017: resolveInitProvider — TTY input "2" resolves to openai

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = undefined` and `io = { isTTY: true, ask: async () => "2" }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"openai"`

---

### TC-018: resolveInitProvider — TTY empty input resolves to anthropic

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = undefined` and `io = { isTTY: true, ask: async () => "" }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"anthropic"` (empty = accept default)

---

### TC-019: resolveInitProvider — TTY input "openai" resolves to openai

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = undefined` and `io = { isTTY: true, ask: async () => "openai" }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"openai"`

---

### TC-020: resolveInitProvider — TTY input "o" resolves to openai

**Category**: unit
**Priority**: could
**Source**: design.md > D3

**GIVEN** `resolveInitProvider` is called with `flagProvider = undefined` and `io = { isTTY: true, ask: async () => "o" }`
**WHEN** `resolveInitProvider` is invoked
**THEN** it returns `"openai"` (leading-character shorthand)

---

### TC-021: provider resolution is skipped when config already exists

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D3

**GIVEN** a specrunner global config already exists on disk and `runInit` is called with `provider: "openai"` and a fake `ask` spy
**WHEN** `runInit` executes
**THEN** `ask` is never called, the config file content is unchanged, and no prompt is emitted

---

### TC-022: no literal provider condition strings in init.ts

**Category**: unit
**Priority**: could
**Source**: design.md > D1, tasks.md > T-04

**GIVEN** the implemented `src/cli/init.ts`
**WHEN** the source is inspected
**THEN** no literal `if (provider === "openai")` or `if (provider === "anthropic")` expressions appear; all provider branching is expressed solely through the `PROVIDER_DEFAULTS` table lookup and `designModel` defined-check

---

### TC-023: --provider invalid value rejected at CLI flag layer

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria, design.md > D4

**GIVEN** the `COMMANDS.init.flags` entry with `provider: { type: "string", values: ["anthropic", "openai"] }`
**WHEN** `specrunner init --provider gcp` is executed
**THEN** the CLI flag layer rejects the value before `runInit` is called and reports an invalid-value error

---

### TC-024: login command provider flag behavior unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria, design.md > D4

**GIVEN** `command-registry.ts` after the init `--provider` flag addition
**WHEN** the login command's `provider` flag entry is inspected
**THEN** its allowed values remain `["github", "claude"]` and its behavior is unaffected by the init change

---

### TC-025: typecheck passes after all changes

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** all source changes applied — `model-registry.ts` (PROVIDER_DEFAULTS + registry update), `init.ts` (provider resolution + scaffold writing), `command-registry.ts` (flag addition), and all affected test fixtures
**WHEN** `bun run typecheck` is executed
**THEN** it exits with code 0 and reports no type errors

---

## Result

```yaml
result: completed
total: 25
automated: 24
manual: 1
must: 17
should: 6
could: 2
blocked_reasons: []
```

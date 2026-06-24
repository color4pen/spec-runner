# Test Cases: provider-aware-init

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 16
- **Manual**: 1
- **Priority**: must: 11, should: 5, could: 1

---

### TC-001: openai provider writes both defaults and design models

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall write provider-appropriate default models to the config scaffold > Scenario: openai provider writes both defaults and design models

---

### TC-002: anthropic provider writes only defaults model (no steps.design key)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall write provider-appropriate default models to the config scaffold > Scenario: anthropic provider writes only defaults model

---

### TC-003: invalid provider value is rejected by flag parser

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: init shall write provider-appropriate default models to the config scaffold > Scenario: invalid provider value is rejected

---

### TC-004: no provider flag reproduces the legacy scaffold

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall default to the anthropic provider when the flag is omitted > Scenario: no flag reproduces the legacy scaffold

---

### TC-005: existing config is preserved under --provider openai

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall not modify an existing config regardless of provider > Scenario: existing config is preserved under --provider openai

---

### TC-006: deprecated openai models are absent from BUILTIN_MODEL_REGISTRY

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the model registry shall reflect the current Codex model set > Scenario: deprecated openai models are absent

---

### TC-007: current openai models are present in BUILTIN_MODEL_REGISTRY

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the model registry shall reflect the current Codex model set > Scenario: current openai models are present

---

### TC-008: openai default models resolve to the openai provider via resolveProvider

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: every provider default model shall be resolvable via the model registry > Scenario: openai default models resolve to the openai provider

---

### TC-009: PROVIDER_DEFAULTS.anthropic has no design field

**Category**: unit
**Priority**: must
**Source**: design.md > D3: anthropic 時は steps.design を scaffold に書かない

**GIVEN** the exported `PROVIDER_DEFAULTS` constant from `src/config/model-registry.ts`
**WHEN** `PROVIDER_DEFAULTS.anthropic` is inspected
**THEN** the `design` key is absent (undefined)
**AND** `PROVIDER_DEFAULTS.anthropic.defaults` equals `"claude-sonnet-4-6"`

---

### TC-010: every model in PROVIDER_DEFAULTS exists in BUILTIN_MODEL_REGISTRY

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 (invariant comment) / design.md > D2

**GIVEN** `PROVIDER_DEFAULTS` (all providers) and `BUILTIN_MODEL_REGISTRY`
**WHEN** each model name referenced in `PROVIDER_DEFAULTS` (both `defaults` and `design` across all providers) is looked up in `BUILTIN_MODEL_REGISTRY`
**THEN** every lookup succeeds (no key is absent)

---

### TC-011: anthropic entries in BUILTIN_MODEL_REGISTRY are unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `BUILTIN_MODEL_REGISTRY` after the registry update
**WHEN** all keys with `provider: "anthropic"` are enumerated
**THEN** the set of anthropic model names is identical to the pre-change registry (no anthropic entries added or removed)

---

### TC-012: gpt-5.4 and gpt-5.5 remain in BUILTIN_MODEL_REGISTRY

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `BUILTIN_MODEL_REGISTRY` after the registry update
**WHEN** the keys `"gpt-5.4"` and `"gpt-5.5"` are inspected
**THEN** both keys exist with `provider: "openai"`

---

### TC-013: existing config is not overwritten when --provider anthropic is given

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a global config file already exists with `steps.defaults.model: "claude-sonnet-4-6"`
**WHEN** `runInit({ provider: "anthropic" })` is called
**THEN** the config file content is byte-identical to the original (no write occurs)

---

### TC-014: CLI handler passes provider: "openai" to runInit

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** the CLI command registry with the `--provider` flag registered for `init`
**WHEN** `specrunner init --provider openai` is invoked (or the command handler is called with `flags["provider"] = "openai"`)
**THEN** `runInit` receives `{ provider: "openai" }` (provider value is forwarded without modification)

---

### TC-015: CLI handler passes undefined to runInit when no provider flag is given

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** the CLI command registry for `init`
**WHEN** `specrunner init` is invoked with no `--provider` flag
**THEN** `runInit` receives `{ provider: undefined }` (not defaulted at CLI layer)
**AND** the resulting scaffold is anthropic-compatible (`steps.defaults.model: "claude-sonnet-4-6"`, no `steps.design` key)

---

### TC-016: deprecated model fixtures replaced — affected test files remain green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** the 4 test files that used `"o3"` or `"gpt-5.3-codex"` as valid OpenAI model fixtures:
  `tests/config/model-registry.test.ts`, `tests/config/schema.test.ts`,
  `tests/adapter/dispatching/agent-runner.test.ts`,
  `tests/core/doctor/checks/runtime/codex-cli.test.ts`
**WHEN** all occurrences of deprecated model names in these files are replaced with `"gpt-5.4-mini"` (or equivalent current model) and `bun run test` is executed
**THEN** all four test files pass with no test failures
**AND** no occurrence of `"o3"`, `"gpt-5.1"`, `"gpt-5.2-codex"`, `"gpt-5.3-codex"` remains in these files

---

### TC-017: pricing.ts is not modified

**Category**: manual
**Priority**: could
**Source**: design.md > Non-Goals / Open Questions (MODEL_PRICING not in scope)

**GIVEN** the final diff for this change
**WHEN** `src/core/usage/pricing.ts` is inspected
**THEN** the file is unmodified — no entries for `gpt-5.4-mini` or `gpt-5.3-codex-spark` have been added
**AND** `tests/core/usage/pricing.test.ts` is also unmodified

---

## Result

```yaml
result: completed
total: 17
automated: 16
manual: 1
must: 11
should: 5
could: 1
blocked_reasons: []
```

# Test Cases: provider SDK を dynamic import + optionalDependencies 化し、未使用 provider のバイナリ 190MB を install から外せるようにする

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 9
- **Manual**: 2
- **Priority**: must: 7, should: 4, could: 0

---

### TC-001: OpenAI provider does not require Claude SDK at startup

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Provider SDKs shall load only after provider selection > Scenario: OpenAI provider does not require Claude SDK at startup

### TC-002: Claude provider does not require Codex SDK at startup

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Provider SDKs shall load only after provider selection > Scenario: Claude provider does not require Codex SDK at startup

### TC-003: Missing Claude SDK

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Missing selected provider SDK shall produce install guidance > Scenario: Missing Claude SDK

### TC-004: Missing Codex SDK

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Missing selected provider SDK shall produce install guidance > Scenario: Missing Codex SDK

### TC-005: Package metadata separates managed and local provider dependencies

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Optional dependency metadata shall exclude unused provider binaries from default hard dependency resolution > Scenario: Package metadata separates managed and local provider dependencies

### TC-006: Existing test suite remains green

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: Installed-SDK behavior shall remain unchanged > Scenario: Existing test suite remains green

### TC-007: Built CLI starts without eager provider SDK crash

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Bundled CLI shall preserve dynamic external provider loading > Scenario: Built CLI starts without eager provider SDK crash

### TC-008: Claude SDK loader translates absent package import into SpecRunnerError with install hint

**Category**: unit
**Priority**: must
**Source**: design.md > D1, D5; tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/adapter/claude-code/sdk-loader.ts` is exercised with a mocked dynamic import that fails as if `@anthropic-ai/claude-agent-sdk` were absent
**WHEN** the loader is asked for the default Claude runtime values
**THEN** it throws `SpecRunnerError` with the missing-provider SDK code
**AND** the error identifies `@anthropic-ai/claude-agent-sdk`
**AND** the hint tells the user to install the Claude provider package

### TC-009: Codex SDK loader preserves non-missing import failures as non-optional-dependency errors

**Category**: unit
**Priority**: should
**Source**: design.md > D5; tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/adapter/codex/sdk-loader.ts` is exercised with a mocked dynamic import that throws a non-module-not-found error from inside the SDK
**WHEN** the loader attempts to resolve the Codex runtime constructor
**THEN** the thrown error is not rewritten as a missing optional dependency
**AND** the original failure information remains available to the caller

### TC-010: queryOneShot lazily loads Claude SDK only when no queryFn is injected

**Category**: unit
**Priority**: should
**Source**: design.md > D6; tasks.md > T-02, T-05 Acceptance Criteria

**GIVEN** `queryOneShot` is called with an injected `queryFn`
**WHEN** the one-shot path executes
**THEN** the injected function is used and the Claude SDK loader is not invoked
**AND** when `queryFn` is omitted, the default path resolves the Claude SDK through the loader at execution time

### TC-011: DispatchingAgentRunner evaluates only the selected provider path after provider resolution

**Category**: integration
**Priority**: should
**Source**: design.md > D3; tasks.md > T-03 Acceptance Criteria

**GIVEN** a `DispatchingAgentRunner` instance resolves a model to provider `openai`
**WHEN** the runner starts execution
**THEN** only the Codex provider path is imported or constructed for that instance
**AND** the Claude provider path is not evaluated before Codex execution
**AND** when the provider resolves to non-`openai`, only the Claude path is evaluated

## Result

```yaml
result: completed
total: 11
automated: 9
manual: 2
must: 7
should: 4
could: 0
blocked_reasons: []
```

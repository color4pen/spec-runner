# Spec: Provider SDK Optional Dependencies

## Requirements

### Requirement: Provider SDKs shall load only after provider selection

The system SHALL avoid resolving local provider SDK packages during CLI startup or module evaluation, and SHALL resolve a provider SDK only when execution reaches the provider selected for the current model.

#### Scenario: OpenAI provider does not require Claude SDK at startup

**Given** a local runtime execution resolves the configured model to provider `openai`
**When** the dispatching runner starts the step
**Then** the system loads the Codex provider path
**And** the system does not require `@anthropic-ai/claude-agent-sdk` before the Codex path runs

#### Scenario: Claude provider does not require Codex SDK at startup

**Given** a local runtime execution resolves the configured model to a non-`openai` provider
**When** the dispatching runner starts the step
**Then** the system loads the Claude provider path
**And** the system does not require `@openai/codex-sdk` before the Claude path runs

### Requirement: Missing selected provider SDK shall produce install guidance

The system MUST convert a missing selected-provider SDK package into a clear `SpecRunnerError` instead of surfacing a raw module resolution crash.

#### Scenario: Missing Claude SDK

**Given** the selected provider path requires `@anthropic-ai/claude-agent-sdk`
**And** that package is not installed or its dynamic import is mocked to fail as absent
**When** the local Claude provider path starts
**Then** the system throws a `SpecRunnerError`
**And** the error identifies `@anthropic-ai/claude-agent-sdk`
**And** the error hint tells the user how to install that package

#### Scenario: Missing Codex SDK

**Given** the selected provider path requires `@openai/codex-sdk`
**And** that package is not installed or its dynamic import is mocked to fail as absent
**When** the local OpenAI/Codex provider path starts
**Then** the system throws a `SpecRunnerError`
**And** the error identifies `@openai/codex-sdk`
**And** the error hint tells the user how to install that package

### Requirement: Optional dependency metadata shall exclude unused provider binaries from default hard dependency resolution

The package metadata MUST list local provider SDK packages as optional dependencies rather than hard dependencies.

#### Scenario: Package metadata separates managed and local provider dependencies

**Given** the package is prepared for publication
**When** `package.json` is read
**Then** `@anthropic-ai/claude-agent-sdk` is listed under `optionalDependencies`
**And** `@openai/codex-sdk` is listed under `optionalDependencies`
**And** `@anthropic-ai/sdk` remains under `dependencies`

### Requirement: Installed-SDK behavior shall remain unchanged

The system SHALL preserve current local provider behavior when both provider SDK packages are installed.

#### Scenario: Existing test suite remains green

**Given** both `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` are installed
**When** `bun run typecheck` and `bun run test` are executed
**Then** both commands pass without requiring test rewrites unrelated to provider SDK loading

### Requirement: Bundled CLI shall preserve dynamic external provider loading

The distribution bundle MUST keep provider SDK resolution compatible with optional dependencies.

#### Scenario: Built CLI starts without eager provider SDK crash

**Given** `bun run build` has produced `dist/specrunner.js`
**When** the built CLI is inspected and smoke-tested
**Then** provider SDK package specifiers remain external dynamic imports
**And** the built CLI does not crash before provider selection in the normal installed-SDK environment

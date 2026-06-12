# Tasks: Provider SDK Optional Dependencies

## T-01: Add provider SDK loader seams

- [x] Add a Claude SDK loader module under `src/adapter/claude-code/` that dynamically imports `@anthropic-ai/claude-agent-sdk` and returns the runtime values needed by `agent-runner.ts` and `query-one-shot.ts`.
- [x] Add a Codex SDK loader module under `src/adapter/codex/` that dynamically imports `@openai/codex-sdk` and returns the `Codex` constructor or a narrow factory.
- [x] Normalize absent top-level package failures into `SpecRunnerError` with code `PROVIDER_SDK_MISSING` or an equivalent new named error code.
- [x] Ensure the error hint includes the exact missing package and an install command for the selected provider.
- [x] Ensure non-missing-package import failures are not mislabeled as missing optional dependencies.

**Acceptance Criteria**:
- The provider SDK package names appear in runtime code only inside loader dynamic imports or type-only references.
- Loader tests can inject or mock import failure without deleting real `node_modules`.
- Missing Claude SDK and missing Codex SDK errors identify different packages and provider paths.

## T-02: Remove static provider SDK imports from adapters

- [x] Update `src/adapter/claude-code/agent-runner.ts` so module evaluation does not require `@anthropic-ai/claude-agent-sdk`.
- [x] Preserve existing `_queryFn` and `_createMcpServerFn` test injection behavior in `ClaudeCodeRunner`.
- [x] Update `src/adapter/claude-code/query-one-shot.ts` so the default query function is resolved lazily through the Claude loader only when no `queryFn` is injected.
- [x] Update `src/adapter/codex/agent-runner.ts` so module evaluation does not require `@openai/codex-sdk`.
- [x] Keep adapter behavior unchanged when SDKs are installed.

**Acceptance Criteria**:
- Importing each adapter module in a test does not synchronously resolve the provider SDK package.
- Existing adapter tests pass with both SDKs installed.
- Existing injection-based tests still avoid real SDK calls.

## T-03: Make dispatching import only the selected provider path

- [x] Update `src/adapter/dispatching/agent-runner.ts` so it resolves provider first, then lazily imports or constructs only the selected provider runner.
- [x] Preserve current `resolveProvider` behavior: `provider === "openai"` routes to Codex, all other providers route to Claude.
- [x] Cache lazily constructed provider runners per `DispatchingAgentRunner` instance, as the current Codex path does.
- [x] Keep the public `AgentRunner` and `RuntimeStrategy.createAgentRunner()` contracts unchanged.

**Acceptance Criteria**:
- Selecting an OpenAI model does not evaluate the Claude SDK loader before Codex execution.
- Selecting a Claude model does not evaluate the Codex SDK loader before Claude execution.
- Existing dispatching tests remain green or are updated only for the new lazy-loading boundary.

## T-04: Move local provider SDKs to optionalDependencies

- [x] Move `@anthropic-ai/claude-agent-sdk` from `dependencies` to `optionalDependencies` in `package.json`.
- [x] Move `@openai/codex-sdk` from `dependencies` to `optionalDependencies` in `package.json`.
- [x] Keep `@anthropic-ai/sdk` and `zod` in `dependencies`.
- [x] Update the package-manager lockfile using the repository's normal install command.
- [x] Do not edit README or install documentation in this change.

**Acceptance Criteria**:
- `package.json` has both local provider SDKs under `optionalDependencies`.
- `package.json` no longer has those two packages under `dependencies`.
- The lockfile is consistent with `package.json`.

## T-05: Add missing selected-provider SDK tests

- [x] Add focused tests for the Claude local provider path where the Claude SDK loader simulates an absent `@anthropic-ai/claude-agent-sdk`.
- [x] Add focused tests for the OpenAI/Codex provider path where the Codex SDK loader simulates an absent `@openai/codex-sdk`.
- [x] Assert the thrown error is a `SpecRunnerError`, has the new missing-provider SDK code, and includes package-specific install guidance.
- [x] Add or update a `queryOneShot` test proving default Claude SDK loading failure produces the same guided error when no `queryFn` is injected.
- [x] Avoid tests that physically remove packages from `node_modules`; use mocks or injectable loader functions.

**Acceptance Criteria**:
- The acceptance criterion "SDK module absence is fixed by tests" is covered for both provider-selected runner paths.
- Tests fail if a raw module resolution error leaks to the caller.
- Tests pass without contacting real provider APIs.

## T-06: Verify installed-SDK behavior and bundled CLI behavior

- [x] Run `bun run typecheck`.
- [x] Run `bun run test`.
- [x] Run `bun run build`.
- [x] Inspect `dist/specrunner.js` to confirm `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` remain external dynamic imports rather than bundled static imports.
- [x] Execute a minimal bundle-level smoke check that imports or starts the built CLI in an environment where both SDKs are installed, confirming startup does not crash before provider selection.

**Acceptance Criteria**:
- `typecheck && test` is green.
- Existing tests are green with both SDKs installed.
- `dist/specrunner.js` is verified for dynamic external provider SDK loading.
- Bundle-level startup does not regress in the normal installed-SDK environment.

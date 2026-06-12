# Design: Provider SDK Optional Dependencies

## Context

SpecRunner currently ships both local provider SDKs as hard dependencies:

- `@anthropic-ai/claude-agent-sdk`
- `@openai/codex-sdk`

Those SDK packages bring provider-specific agent execution binaries that dominate install size, while SpecRunner itself is small. Users who only run one provider still install the other provider's binary because both SDKs are listed under `dependencies` and are statically imported by local runtime adapters.

Current static import sites:

- `src/adapter/claude-code/agent-runner.ts` imports `query`, `createSdkMcpServer`, and SDK message/result types from `@anthropic-ai/claude-agent-sdk`.
- `src/adapter/claude-code/query-one-shot.ts` imports `query` and SDK message/result types from `@anthropic-ai/claude-agent-sdk`.
- `src/adapter/codex/agent-runner.ts` imports `Codex` from `@openai/codex-sdk`.
- `src/adapter/dispatching/agent-runner.ts` statically imports `CodexAgentRunner`, while provider selection itself already happens at runtime via `resolveProvider`.

`tsup.config.ts` already marks `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, and `@openai/codex-sdk` as external. That means the bundle should preserve runtime module resolution rather than embedding these SDKs, but the implementer must still verify the emitted `dist/specrunner.js` works with the new dynamic import flow.

The managed runtime dependency `@anthropic-ai/sdk` remains out of scope.

This change should start after `codex-adapter-parity` is incorporated because `src/adapter/codex/agent-runner.ts` is a known overlap point.

## Goals / Non-Goals

**Goals**:

- Load `@anthropic-ai/claude-agent-sdk` only when the Claude local provider path actually runs.
- Load `@openai/codex-sdk` only when the OpenAI/Codex local provider path actually runs.
- Move both local provider SDKs from `dependencies` to `optionalDependencies`.
- Convert missing selected-provider SDK failures into a clear `SpecRunnerError` that names the missing package and gives the install command.
- Preserve behavior when both SDKs are installed.
- Verify the bundled CLI still resolves the selected provider through dynamic import.

**Non-Goals**:

- Do not change managed runtime dependency handling for `@anthropic-ai/sdk`.
- Do not update README size/install documentation in this change.
- Do not redesign provider/model resolution.
- Do not change local runtime execution semantics beyond SDK loading and missing-provider error handling.

## Decisions

### D1. Introduce provider SDK loader modules as the only runtime import boundary

Create small loader modules, for example:

- `src/adapter/claude-code/sdk-loader.ts`
- `src/adapter/codex/sdk-loader.ts`

Each loader owns the dynamic `import("<provider package>")`, normalizes module-not-found errors, and exposes the minimal runtime values needed by the adapter.

Rationale: Centralizing dynamic import keeps adapter code readable and gives tests a single seam for simulating an absent SDK. This is preferable to scattering `try/catch import()` blocks through `run()` and one-shot query logic.

Alternatives considered:

- Inline `await import()` at each call site. Rejected because missing-provider error handling would be duplicated and easier to drift.
- Keep static imports and rely only on `optionalDependencies`. Rejected because Node/Bun would still fail during module evaluation when an optional SDK is absent.

### D2. Keep SDK type usage type-only or replace it with local structural types

Adapter files must not import provider SDK runtime values statically. Type references may remain only as `import type` if TypeScript emits no runtime import and the package is still available in the development install. Where practical, prefer local structural types already used by the Codex adapter and local SDK result shapes for the narrow fields SpecRunner reads.

Rationale: The runtime goal is absence tolerance. Type-only imports are erased, but local structural types reduce coupling and make tests easier to run without depending on SDK type availability at runtime.

Alternatives considered:

- Remove all provider SDK type references immediately. Acceptable but not required if it makes the patch larger than needed.
- Use `require.resolve` probes. Rejected for ESM/Bun portability and because actual import remains the behavior that matters.

### D3. Lazily construct provider adapters after provider resolution

`DispatchingAgentRunner` should avoid static imports of provider adapters that themselves may dynamically load optional SDKs. The dispatching runner should route by `resolveProvider`, then lazily import and instantiate the selected adapter.

For the Claude path, constructor injection of an already-created `ClaudeCodeRunner` may remain only if its module is safe to evaluate without the Claude SDK installed. If making `ClaudeCodeRunner` SDK-free at module evaluation is awkward, dispatching should also lazily import the Claude adapter.

Rationale: Provider resolution is already runtime data. The selected provider is the earliest safe point to require that provider's optional SDK.

Alternatives considered:

- Only make `CodexAgentRunner` lazy because it is currently lazy-constructed. Rejected because `ClaudeCodeRunner` and `queryOneShot` also have static SDK imports and must not crash process startup.

### D4. Convert both local provider SDK packages to optional dependencies

Move `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` from `dependencies` to `optionalDependencies`. Keep `@anthropic-ai/sdk` and `zod` in `dependencies`.

Rationale: Both local provider SDKs carry large provider-specific binaries, and both are selected at runtime. Making both optional gives users the symmetrical ability to install only the provider they use. Keeping only one optional would reduce one path's footprint but leave the other path as an unconditional install-size tax.

Alternatives considered:

- Make only `@openai/codex-sdk` optional because Claude is the historical default. Rejected because users who only use OpenAI should not install the Claude binary.
- Move all Anthropic packages to optional dependencies. Rejected because managed runtime `@anthropic-ai/sdk` is explicitly out of scope and materially smaller.

### D5. Raise a provider-specific setup error for missing selected SDKs

When the selected provider SDK dynamic import fails because the package is absent, throw `SpecRunnerError` with a new error code such as `PROVIDER_SDK_MISSING`. The error message should say which provider could not run, and the hint should name the package and a concrete command, for example:

- Claude local provider: `bun add @anthropic-ai/claude-agent-sdk`
- OpenAI/Codex local provider: `bun add @openai/codex-sdk`

The loader must only translate module-not-found errors for the target package. Other import-time errors inside the SDK should propagate unchanged or be wrapped without pretending the package is absent.

Rationale: Missing selected-provider SDK is an environment setup problem, not an internal crash. A dedicated code and hint lets CLI error handling produce actionable output.

Alternatives considered:

- Let raw `ERR_MODULE_NOT_FOUND` surface. Rejected because it is confusing and does not tell users which optional provider package to install.
- Preflight all optional SDKs at startup. Rejected because it would defeat optional provider installs.

### D6. Preserve one-shot Claude query behavior while making its SDK load lazy

`queryOneShot` should keep its `queryFn` injection behavior. If `queryFn` is not supplied, it should obtain the default query function through the Claude SDK loader at execution time.

Rationale: One-shot commands use the Claude Agent SDK independently of pipeline `AgentRunner`. They need the same missing-package behavior without forcing a process-start import.

Alternatives considered:

- Route one-shot queries through `ClaudeCodeRunner`. Rejected because `queryOneShot` has a smaller command-oriented contract and currently avoids full pipeline run context.

### D7. Verify the tsup output, not only TypeScript source behavior

Because the CLI is distributed as `dist/specrunner.js`, implementation verification must include a bundle-level check. With the current tsup `external` list, expected output is that provider SDK specifiers remain external and are reached through dynamic import at runtime.

Rationale: Source tests can pass while a bundler transform breaks optional dependency behavior. The acceptance criteria explicitly require bundle verification.

Alternatives considered:

- Trust `tsup.config.ts` because the SDKs are already external. Rejected because the implementation changes the import shape and must be proven in the produced artifact.

## Risks / Trade-offs

[Risk] Dynamic import shifts some errors from process startup to first provider use. -> Mitigation: add focused tests for missing selected-provider SDK and unchanged installed-SDK paths.

[Risk] The loader may incorrectly classify a transitive import failure as the top-level provider SDK missing. -> Mitigation: module-not-found detection must check the missing package name or error text includes the target package specifier.

[Risk] Type-only SDK imports could still cause TypeScript failures in a local checkout where optional dependencies were omitted. -> Mitigation: prefer local structural types for SDK message/result shapes where feasible, and keep CI/dev install with optional dependencies for normal tests.

[Risk] `queryOneShot` is not routed through `DispatchingAgentRunner` and could be missed. -> Mitigation: include it in tasks and tests as a separate Claude SDK lazy-load call site.

[Risk] Optional dependencies can be skipped by package-manager flags in CI. -> Mitigation: normal CI should install optional dependencies for full test coverage; missing-SDK behavior should be covered through loader mocks, not by mutating `node_modules`.

## Migration Plan

1. Implement dynamic SDK loader modules and update provider adapters to use them.
2. Move local provider SDKs to `optionalDependencies` and update the lockfile with the repository's package manager.
3. Add tests that mock loader/import failure for Claude and Codex selected-provider paths.
4. Run `bun run typecheck` and `bun run test` with both SDKs installed.
5. Run `bun run build`, then verify `dist/specrunner.js` preserves dynamic external SDK loading and can execute the selected provider path in an installed-SDK environment.

Rollback is straightforward: move the SDK packages back to `dependencies` and restore static imports if optional loading causes release-blocking issues.

## Open Questions

- Confirm the exact package manager lockfile update needed in this repository before implementation.
- Confirm whether `codex-adapter-parity` has landed before editing `src/adapter/codex/agent-runner.ts`.

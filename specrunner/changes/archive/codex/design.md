# Design: Codex Provider Support

## Overview

Add `CodexAgentRunner` implementing the `AgentRunner` port using `@openai/codex-sdk`.
Add `DispatchingAgentRunner` that routes each step to the correct adapter based on
model-to-provider resolution. Extend config with a `models` registry.

The `AgentRunner` port contract is unchanged — existing `ClaudeCodeRunner` and `ManagedAgentRunner`
are untouched. `LocalRuntime.createAgentRunner()` switches from returning `ClaudeCodeRunner`
directly to returning `DispatchingAgentRunner`, which defaults to Claude for all existing configs.

---

## New File Structure

```
src/
├── adapter/
│   ├── shared/
│   │   └── prompt-builder.ts       # Extract buildAdditionalInstructions (shared by Claude + Codex)
│   ├── codex/
│   │   └── agent-runner.ts         # CodexAgentRunner implements AgentRunner
│   └── dispatching/
│       └── agent-runner.ts         # DispatchingAgentRunner implements AgentRunner
├── config/
│   ├── model-registry.ts           # BUILTIN_MODEL_REGISTRY, mergeModelRegistry, resolveProvider
│   └── schema.ts                   # +ModelEntry, +ModelsConfig, +models field, +validateConfig guards
└── core/doctor/checks/runtime/
    └── codex-cli.ts                # codexCliCheck: DoctorCheck
```

Modified:
- `src/adapter/claude-code/agent-runner.ts` — import buildAdditionalInstructions from shared
- `src/core/runtime/local.ts` — createAgentRunner() returns DispatchingAgentRunner
- `src/core/doctor/checks/index.ts` — add codexCliCheck

---

## Design Decisions

### D1: CodexAgentRunner mirrors ClaudeCodeRunner

`CodexAgentRunner` follows the same structural pattern as `ClaudeCodeRunner`:
- Builds prompt via `buildAdditionalInstructions` (branch, slug, cwd, projectContext) + `step.enrichContext()` + `step.buildMessage()`
- Resolves execution config via `getStepExecutionConfig()` (same 4-level chain)
- AbortController for wall-clock timeout
- Reads result file from local filesystem via `fs.readFile()` when `resultFilePath` is defined;
  falls back to `turn.finalResponse` when `resultFilePath` is null
- Maps `Turn.usage` → `ModelUsage` (`cacheCreationInputTokens: 0` — field absent in Codex SDK)

Codex-specific:
- `new Codex({ apiKey }).startThread({ workingDirectory, sandboxMode: "workspace-write", model, skipGitRepoCheck: true })`
- `thread.run(prompt, { signal: abortController.signal })` — synchronous turn (no streaming)
- `turn.items.filter(i => i.type === "file_change")` → log changed paths
- No `allowedTools` — Codex uses `sandboxMode` for access control

### D2: sandboxMode is always "workspace-write"

All pipeline steps require file write (result.md, source code) and Bash execution.
No step is read-only. Prompt-level instructions ("do not modify source code") control behavior
within the sandbox, consistent with the existing Claude `allowedTools` pattern for review steps.

### D3: Shared prompt builder

`buildAdditionalInstructions(ctx: AgentRunContext): string` is extracted to
`src/adapter/shared/prompt-builder.ts` to avoid duplication. `ClaudeCodeRunner` is updated
to import from there. `CodexAgentRunner` imports the same function.

**`StepContext` construction is a future common helper candidate**: Both `ClaudeCodeRunner` and
`CodexAgentRunner` build a `StepContext` with identical hard-coded values (`request.type: "feature"`,
`title: ""`, `baseBranch: "main"`, etc.). This duplication is accepted for this change because the
`StepContext` shape is still evolving. A `buildStepContext(ctx: AgentRunContext): StepContext` helper
in `src/adapter/shared/` should be extracted when a third adapter is added or when the shape
stabilises.

### D4: DispatchingAgentRunner — lazy Codex init

`ClaudeCodeRunner` is created eagerly (always needed for default configs).
`CodexAgentRunner` is created lazily on the first step that routes to OpenAI, reading
`process.env.OPENAI_API_KEY` at that point. This ensures users who only use Claude
are never affected by a missing `OPENAI_API_KEY`.

`DispatchingAgentRunner` constructor takes a pre-built `ClaudeCodeRunner` so the
`RuntimeStrategy` interface signature (`createAgentRunner(): AgentRunner`) is unchanged.

Routing logic in `run(ctx)`:
1. `getStepExecutionConfig(ctx.config, ctx.step.name, stepDefaults)` → resolved model
2. `mergeModelRegistry(ctx.config)` → lookup provider
3. Unknown model → throw `{ code: "CONFIG_INVALID" }`
4. `"anthropic"` → delegate to `claudeRunner`
5. `"openai"` → lazy-init `codexRunner` (reads `OPENAI_API_KEY`; throws `MISSING_OPENAI_API_KEY` if absent), delegate

**Double-call of `getStepExecutionConfig` is intentional**: `DispatchingAgentRunner` calls it
to resolve the model name for provider routing; `CodexAgentRunner` (and `ClaudeCodeRunner`) call
it again internally to obtain the full resolved config (model, maxTurns, timeoutMs). Each adapter
owns its own config resolution so that `DispatchingAgentRunner` stays a thin routing layer without
threading config state through the call. The redundant computation is a deliberate trade-off for
cleaner separation of concerns.

**`OPENAI_API_KEY` check strategy**: A `specrunner doctor` check for `OPENAI_API_KEY` is
intentionally **not added**. `DispatchingAgentRunner` enforces the key at step dispatch time via
lazy init (step 5 above), throwing `MISSING_OPENAI_API_KEY` if absent. This is sufficient because:
(a) users who only use Claude never need the key, and (b) an eager doctor check would require
resolving all step models at startup even for users who never run OpenAI steps. The `codexCliCheck`
(D7) covers the binary availability side of the dependency.

### D5: Model registry

`src/config/model-registry.ts` owns:
- `BUILTIN_MODEL_REGISTRY` — const, covers all models listed in the request
- `mergeModelRegistry(config)` — `{ ...BUILTIN, ...(config.models ?? {}) }` (user overrides win)
- `resolveProvider(modelName, merged)` — throws `CONFIG_INVALID` for unknown names

The `models` field in `SpecRunnerConfig` is `optional`. When absent, only built-in models
are available. Users can add new models or override provider assignments without redeploying.

### D6: validateConfig() guards

Two new guards added after existing steps validation:

1. **Unknown model guard**: For each `config.steps[stepName].model` that is defined,
   verify it exists in `mergeModelRegistry(config)`. Throw `CONFIG_INVALID` if not found.
   Applies to `defaults.model` and per-step `model` values.

2. **managed + OpenAI guard**: If `config.runtime === "managed"` and any step resolves to
   `provider: "openai"`, throw `CONFIG_INVALID: "OpenAI models are not supported with managed runtime"`.

**Note**: `schema.ts` MUST import `BUILTIN_MODEL_REGISTRY` from `model-registry.ts` at the
top level. `model-registry.ts` imports from `schema.ts` as `import type` only (the
`SpecRunnerConfig` type is not emitted to JS), so there is no circular runtime dependency.
The literal-set duplication approach documented in earlier drafts is rejected in favour of
a single source of truth in `model-registry.ts`.

### D7: Doctor codex-cli check

`codexCliCheck` (category: `"runtime"`, `required: true`) is added to `allChecks` after `gitVersionCheck`.

Logic:
1. Read `steps` and `models` from `ctx.config.get()`. Merge with `BUILTIN_MODEL_REGISTRY`.
2. If no step model resolves to `provider: "openai"` → return `{ status: "pass", message: "codex CLI not required (no OpenAI steps configured)" }`.
3. Otherwise, `execFile("codex", ["--version"])` → pass or fail with install hint.

The check is skipped (pass) when no OpenAI models are configured so existing users see no
new failure in `specrunner doctor`.

**`required: true` is intentional**: When OpenAI steps ARE configured, the absence of the `codex`
CLI binary is a hard blocker — the pipeline will fail immediately at the first OpenAI step. In that
case `required: true` correctly causes `specrunner doctor` to exit 1, alerting the user before they
start a run. Users who have not configured any OpenAI steps receive an unconditional pass, so they
are unaffected. The check therefore behaves as `required: false` for non-OpenAI users in practice.

---

## Interface Contracts

### CodexAgentRunner

```typescript
// src/adapter/codex/agent-runner.ts
export interface CodexAgentRunnerDeps {
  apiKey: string;
  _codexFactory?: (opts: { apiKey: string }) => CodexInstance; // for testing
}

export class CodexAgentRunner implements AgentRunner {
  constructor(deps: CodexAgentRunnerDeps);
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}
```

`CodexInstance` is the minimal interface extracted from `@openai/codex-sdk`:
```typescript
interface CodexInstance {
  startThread(opts: StartThreadOptions): CodexThread;
}
interface CodexThread {
  run(prompt: string, opts?: { signal?: AbortSignal }): Promise<Turn>;
}
```

Use real `Codex` from `@openai/codex-sdk` as default; inject mock in tests.

### DispatchingAgentRunner

```typescript
// src/adapter/dispatching/agent-runner.ts
export class DispatchingAgentRunner implements AgentRunner {
  constructor(claudeRunner: ClaudeCodeRunner);
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}
```

### mergeModelRegistry / resolveProvider

```typescript
// src/config/model-registry.ts
export type Provider = "anthropic" | "openai";
export interface ModelEntry { provider: Provider }
export interface ModelsConfig { [modelName: string]: ModelEntry }

export const BUILTIN_MODEL_REGISTRY: ModelsConfig;
export function mergeModelRegistry(config: SpecRunnerConfig): ModelsConfig;
export function resolveProvider(modelName: string, merged: ModelsConfig): Provider; // throws CONFIG_INVALID
```

### SpecRunnerConfig addition

```typescript
// src/config/schema.ts additions
export interface ModelEntry { provider: "anthropic" | "openai" }
export interface ModelsConfig { [modelName: string]: ModelEntry }

// added to SpecRunnerConfig:
models?: ModelsConfig;

// added to RawConfig:
models?: Record<string, unknown>;
```

---

## Backward Compatibility

- Existing configs without `models` or `steps[*].model` → `DispatchingAgentRunner` calls
  `getStepExecutionConfig()` → resolves to step's hardcoded model → looks up in `BUILTIN_MODEL_REGISTRY`
  → `"anthropic"` → delegates to `ClaudeCodeRunner`. Zero behavior change.
- `RuntimeStrategy.createAgentRunner()` signature is unchanged.
- `PipelineDeps` / `StepExecutor` are unchanged.
- `ManagedAgentRunner` is unchanged (already bypasses dispatch; managed runtime is unchanged).

---

## Out of Scope

Per request:
- `request/generator.ts` / `request/reviewer.ts` Codex support
- Managed runtime Codex support (validateConfig() rejects it)
- Non-Codex OpenAI providers (Gemini, Mistral, etc.)
- Streaming intermediate events across providers
- Codex MCP server mode / Agents SDK integration

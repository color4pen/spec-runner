# Delta Spec: Codex Provider Support

This file captures new requirements introduced by this change.
These will be archived into baseline specs after merge.

---

## New Spec: `codex-runtime`

**Purpose**: Define the `CodexAgentRunner` adapter that implements `AgentRunner` using
`@openai/codex-sdk` for local runtime execution via the OpenAI Codex provider.

| # | Requirement |
|---|-------------|
| 1 | `CodexAgentRunner` MUST implement the `AgentRunner` port (`run(ctx): Promise<AgentRunResult>`). |
| 2 | `CodexAgentRunner` MUST build prompts using `buildAdditionalInstructions` (branch, slug, cwd, projectContext) + `step.enrichContext()` + `step.buildMessage()`, mirroring `ClaudeCodeRunner`. |
| 3 | `CodexAgentRunner` MUST use `sandboxMode: "workspace-write"` for all steps. |
| 4 | `CodexAgentRunner` MUST set `skipGitRepoCheck: true` on every thread. |
| 5 | `CodexAgentRunner` MUST read result content from local filesystem (`fs.readFile`) when `step.resultFilePath()` is non-null; otherwise use `Turn.finalResponse`. |
| 6 | `CodexAgentRunner` MUST map `Turn.usage` to `ModelUsage` with `cacheCreationInputTokens: 0` (no Codex equivalent). |
| 7 | `CodexAgentRunner` MUST pass `AbortSignal` from an `AbortController` to `thread.run()` to support timeout cancellation. |
| 8 | `CodexAgentRunner` MUST log changed file paths from `Turn.items` (type `"file_change"`) for observability. |

---

## New Spec: `dispatching-agent-runner`

**Purpose**: Define `DispatchingAgentRunner`, which routes step execution to the
appropriate adapter (`ClaudeCodeRunner` or `CodexAgentRunner`) based on model-to-provider
resolution. Enables per-step provider selection without changing the `AgentRunner` port or
`RuntimeStrategy` interface.

| # | Requirement |
|---|-------------|
| 1 | `DispatchingAgentRunner` MUST implement the `AgentRunner` port. |
| 2 | `DispatchingAgentRunner` MUST resolve the step's model via `getStepExecutionConfig()` then look up its provider in the merged model registry. |
| 3 | `DispatchingAgentRunner` MUST delegate to `ClaudeCodeRunner` for `provider: "anthropic"` steps. |
| 4 | `DispatchingAgentRunner` MUST delegate to `CodexAgentRunner` for `provider: "openai"` steps. |
| 5 | `DispatchingAgentRunner` MUST create `CodexAgentRunner` lazily on the first OpenAI step, reading `OPENAI_API_KEY` from the environment at that time. |
| 6 | `DispatchingAgentRunner` MUST throw `{ code: "MISSING_OPENAI_API_KEY" }` when `OPENAI_API_KEY` is absent and an OpenAI step is dispatched. |
| 7 | `DispatchingAgentRunner` MUST throw `{ code: "CONFIG_INVALID" }` for model names absent from the merged registry. |
| 8 | `LocalRuntime.createAgentRunner()` MUST return `DispatchingAgentRunner`. |

---

## Updated Spec: `cli-config-store` (additions to requirement set)

| # | Requirement |
|---|-------------|
| + | `SpecRunnerConfig` MAY include a `models` field (`ModelsConfig`) mapping model names to `{ provider: "anthropic" \| "openai" }`. |
| + | `BUILTIN_MODEL_REGISTRY` MUST cover the current Claude and Codex/GPT model families as a code-level constant; users need not define built-in models in `config.json`. |
| + | `mergeModelRegistry(config)` MUST merge `BUILTIN_MODEL_REGISTRY` with `config.models`, with user entries taking precedence. |
| + | `validateConfig()` MUST reject `config.models[name].provider` values other than `"anthropic"` or `"openai"` with `code: "CONFIG_INVALID"`. |
| + | `validateConfig()` MUST reject `config.steps[*].model` values not present in the merged model registry with `code: "CONFIG_INVALID"`. |
| + | `validateConfig()` MUST reject `runtime: "managed"` combined with any step whose model resolves to `provider: "openai"` with `code: "CONFIG_INVALID"`. |
| + | `OPENAI_API_KEY` presence is NOT checked at config validation or doctor time. `DispatchingAgentRunner` enforces it lazily at first OpenAI step dispatch, throwing `{ code: "MISSING_OPENAI_API_KEY" }` (see `dispatching-agent-runner` spec #6). A dedicated doctor check is intentionally omitted to avoid burdening users who never use OpenAI steps. |

---

## Updated Spec: `cli-commands` (doctor section addition)

| # | Requirement |
|---|-------------|
| + | `specrunner doctor` MUST include a `codex-cli` check (category: `runtime`, required: `true`). |
| + | The `codex-cli` check MUST return `status: "pass"` without executing any binary check when no configured step uses an OpenAI model. |
| + | The `codex-cli` check MUST return `status: "fail"` with an install hint when at least one step uses an OpenAI model and the `codex` CLI binary is not found in `PATH`. |

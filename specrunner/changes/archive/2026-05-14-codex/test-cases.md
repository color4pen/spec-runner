# Test Cases: Codex Provider Support

Reference: request.md, design.md, tasks.md in this folder.

---

## TC-01: CodexAgentRunner — successful run with resultFilePath defined

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-5, T4, acceptance criteria

**GIVEN** a `CodexAgentRunner` with an injected mock `_codexFactory` that returns a mock `CodexThread`  
**AND** the mock `thread.run()` returns a `Turn` with `finalResponse: "agent text"`, non-empty `items`, and `usage`  
**AND** the step's `resultFilePath(state, stepCtx)` returns a relative path to a file that exists on disk  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.completionReason` is `"success"`  
**AND** `AgentRunResult.resultContent` equals the content of the result file (read via `fs.readFile`)  
**AND** `AgentRunResult.resultContent` does NOT equal `turn.finalResponse`

---

## TC-02: CodexAgentRunner — successful run with resultFilePath null

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-5, T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory`  
**AND** `thread.run()` returns a `Turn` with `finalResponse: "final agent text"`  
**AND** the step's `resultFilePath` returns `null`  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.completionReason` is `"success"`  
**AND** `AgentRunResult.resultContent` equals `"final agent text"` (i.e., `turn.finalResponse`)

---

## TC-03: CodexAgentRunner — timeout handling

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-8, T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory`  
**AND** `thread.run()` hangs until the `AbortSignal` fires  
**AND** `resolvedConfig.timeoutMs` is set to a small value (e.g., 100 ms)  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.completionReason` is `"timeout"`  
**AND** `AgentRunResult.error.code` is `"STEP_TIMEOUT"`  
**AND** `AgentRunResult.resultContent` is `null`

---

## TC-04: CodexAgentRunner — SDK throws non-timeout error

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory`  
**AND** `thread.run()` throws a generic `Error("network failure")`  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.completionReason` is `"error"`  
**AND** `AgentRunResult.error.code` is `"CODEX_SDK_ERROR"`  
**AND** `AgentRunResult.resultContent` is `null`

---

## TC-05: CodexAgentRunner — result file not found on disk

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-5, T4

**GIVEN** a `CodexAgentRunner` with a mock that returns a successful `Turn`  
**AND** the step's `resultFilePath` returns a path that does NOT exist on disk  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.completionReason` is `"error"`  
**AND** `AgentRunResult.error.code` is `"RESULT_FILE_NOT_FOUND"`

---

## TC-06: CodexAgentRunner — Turn.usage mapped to ModelUsage correctly

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-7, T4

**GIVEN** a `CodexAgentRunner` with a mock that returns a `Turn` with:
- `usage.input_tokens: 1000`
- `usage.cached_input_tokens: 200`
- `usage.output_tokens: 500`
- step's `resultFilePath` returns `null`  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.modelUsage[modelName].inputTokens` is `1000`  
**AND** `AgentRunResult.modelUsage[modelName].outputTokens` is `500`  
**AND** `AgentRunResult.modelUsage[modelName].cacheReadInputTokens` is `200`  
**AND** `AgentRunResult.modelUsage[modelName].cacheCreationInputTokens` is `0`

---

## TC-07: CodexAgentRunner — Turn.usage is null → modelUsage is undefined

- **Category**: CodexAgentRunner
- **Priority**: should
- **Source**: Req-7, T4

**GIVEN** a `CodexAgentRunner` with a mock that returns a `Turn` with `usage: null`  
**AND** step's `resultFilePath` returns `null`  
**WHEN** `runner.run(ctx)` is called  
**THEN** `AgentRunResult.modelUsage` is `undefined` (or absent)

---

## TC-08: CodexAgentRunner — enrichContext called when defined on step

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-3, T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory`  
**AND** the step has an `enrichContext` method (e.g., spec-review's baseline diff injection)  
**WHEN** `runner.run(ctx)` is called  
**THEN** `step.enrichContext()` is called exactly once before `step.buildMessage()`  
**AND** the enriched `dynamicContext` is passed to `step.buildMessage()`

---

## TC-09: CodexAgentRunner — prompt contains branch, slug, projectContext

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-3, T1, T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory` that captures the prompt passed to `thread.run()`  
**AND** `ctx.branch` is `"change/codex-ecff3ff4"`  
**AND** `ctx.slug` is `"codex"`  
**AND** `ctx.projectContext` is `"<project context text>"`  
**WHEN** `runner.run(ctx)` is called  
**THEN** the captured prompt contains `"change/codex-ecff3ff4"`  
**AND** the captured prompt contains `"codex"`  
**AND** the captured prompt contains `"<project context text>"`

---

## TC-10: CodexAgentRunner — file change items logged to stderr

- **Category**: CodexAgentRunner
- **Priority**: should
- **Source**: Req-6, T4

**GIVEN** a `CodexAgentRunner` with a mock that returns a `Turn` whose `items` include one `FileChangeItem` with `changes: [{ path: "src/foo.ts", kind: "update" }]`  
**AND** step's `resultFilePath` returns `null`  
**WHEN** `runner.run(ctx)` is called  
**THEN** `process.stderr` output contains `"src/foo.ts"`

---

## TC-11: CodexAgentRunner — startThread called with correct options

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: Req-2, Req-4, Req-9, T4

**GIVEN** a `CodexAgentRunner` with a mock `_codexFactory` that captures `startThread` options  
**WHEN** `runner.run(ctx)` is called  
**THEN** `startThread` was called with `sandboxMode: "workspace-write"`  
**AND** `startThread` was called with `skipGitRepoCheck: true`  
**AND** `startThread` was called with `workingDirectory: ctx.cwd`  
**AND** `startThread` was called with `model` equal to the resolved model from config

---

## TC-12: Model Registry — mergeModelRegistry with no user models

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-10, T2

**GIVEN** a `SpecRunnerConfig` with no `models` field  
**WHEN** `mergeModelRegistry(config)` is called  
**THEN** the result equals `BUILTIN_MODEL_REGISTRY` (all built-in models, no extras)

---

## TC-13: Model Registry — mergeModelRegistry with user override

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-10, T2

**GIVEN** a `SpecRunnerConfig` with `models: { "claude-sonnet-4-6": { provider: "openai" } }`  
**WHEN** `mergeModelRegistry(config)` is called  
**THEN** the result's `"claude-sonnet-4-6"` entry has `provider: "openai"` (user wins over built-in)  
**AND** all other built-in entries remain unchanged

---

## TC-14: Model Registry — mergeModelRegistry with new user model

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-10, T2

**GIVEN** a `SpecRunnerConfig` with `models: { "gpt-7-turbo": { provider: "openai" } }`  
**WHEN** `mergeModelRegistry(config)` is called  
**THEN** the result contains `"gpt-7-turbo": { provider: "openai" }`  
**AND** all built-in entries are also present

---

## TC-15: Model Registry — resolveProvider for known anthropic model

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-11, T2

**GIVEN** a merged registry containing `"claude-sonnet-4-6": { provider: "anthropic" }`  
**WHEN** `resolveProvider("claude-sonnet-4-6", merged)` is called  
**THEN** the return value is `"anthropic"`

---

## TC-16: Model Registry — resolveProvider for known openai model

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-11, T2

**GIVEN** a merged registry containing `"o3": { provider: "openai" }`  
**WHEN** `resolveProvider("o3", merged)` is called  
**THEN** the return value is `"openai"`

---

## TC-17: Model Registry — resolveProvider for unknown model throws CONFIG_INVALID

- **Category**: Model Registry
- **Priority**: must
- **Source**: Req-12, T2

**GIVEN** a merged registry that does NOT contain `"gemini-ultra"`  
**WHEN** `resolveProvider("gemini-ultra", merged)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`  
**AND** the error message mentions `"gemini-ultra"`

---

## TC-18: Config Schema — valid models field passes validateConfig

- **Category**: Config Validation
- **Priority**: must
- **Source**: Req-10, T3

**GIVEN** a raw config object with `models: { "my-model": { provider: "anthropic" } }`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it returns without throwing  
**AND** the returned config has `models["my-model"].provider === "anthropic"`

---

## TC-19: Config Schema — models entry with invalid provider throws CONFIG_INVALID

- **Category**: Config Validation
- **Priority**: must
- **Source**: Req-10, T3

**GIVEN** a raw config with `models: { "bad-model": { provider: "gemini" } }`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`  
**AND** the error message references `"bad-model"` and valid provider values

---

## TC-20: Config Schema — models entry that is not an object throws CONFIG_INVALID

- **Category**: Config Validation
- **Priority**: should
- **Source**: Req-10, T3

**GIVEN** a raw config with `models: { "bad-model": "anthropic" }` (string instead of object)  
**WHEN** `validateConfig(obj)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`

---

## TC-21: Config Schema — step model that is unknown throws CONFIG_INVALID

- **Category**: Config Validation
- **Priority**: must
- **Source**: Req-12, T3

**GIVEN** a raw config with `steps: { implementer: { model: "unknown-model-xyz" } }`  
**AND** `runtime: "local"`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`  
**AND** the error message references `"unknown-model-xyz"` and `"steps.implementer.model"`

---

## TC-22: Config Schema — step with OpenAI model + local runtime passes

- **Category**: Config Validation
- **Priority**: must
- **Source**: Req-11, T3

**GIVEN** a raw config with `steps: { implementer: { model: "o3" } }` and `runtime: "local"`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it returns without throwing

---

## TC-23: Config Schema — OpenAI model + managed runtime throws CONFIG_INVALID

- **Category**: Config Validation
- **Priority**: must
- **Source**: Req-13, T3, acceptance criteria

**GIVEN** a raw config with `steps: { implementer: { model: "o3" } }` and `runtime: "managed"`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`  
**AND** the error message mentions `"managed"` and `"OpenAI"`

---

## TC-24: Config Schema — OpenAI model via user-defined models + managed runtime throws CONFIG_INVALID

- **Category**: Config Validation
- **Priority**: should
- **Source**: Req-13, T3

**GIVEN** a raw config with:
- `models: { "my-openai-model": { provider: "openai" } }`
- `steps: { implementer: { model: "my-openai-model" } }`
- `runtime: "managed"`  
**WHEN** `validateConfig(obj)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`

---

## TC-25: DispatchingAgentRunner — anthropic model delegates to claudeRunner

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: Req-14, T5, acceptance criteria

**GIVEN** a `DispatchingAgentRunner` constructed with a mock `claudeRunner`  
**AND** the resolved step model is `"claude-sonnet-4-6"` (anthropic in BUILTIN_MODEL_REGISTRY)  
**WHEN** `runner.run(ctx)` is called  
**THEN** `claudeRunner.run(ctx)` is called exactly once  
**AND** the mock codex runner is never invoked

---

## TC-26: DispatchingAgentRunner — openai model delegates to codexRunner (lazy init)

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: Req-14, T5, acceptance criteria

**GIVEN** a `DispatchingAgentRunner` constructed with a mock `claudeRunner`  
**AND** `OPENAI_API_KEY` is set in the environment  
**AND** the resolved step model is `"o3"` (openai in BUILTIN_MODEL_REGISTRY)  
**WHEN** `runner.run(ctx)` is called  
**THEN** a `CodexAgentRunner` is lazily created  
**AND** `codexRunner.run(ctx)` is called  
**AND** `claudeRunner.run` is NOT called

---

## TC-27: DispatchingAgentRunner — openai model without OPENAI_API_KEY throws MISSING_OPENAI_API_KEY

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: Req-14, T5, acceptance criteria

**GIVEN** a `DispatchingAgentRunner` with a mock `claudeRunner`  
**AND** `OPENAI_API_KEY` is NOT set in the environment  
**AND** the resolved step model is `"o3"`  
**WHEN** `runner.run(ctx)` is called  
**THEN** it throws an error with `code: "MISSING_OPENAI_API_KEY"`

---

## TC-28: DispatchingAgentRunner — unknown model throws CONFIG_INVALID

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: Req-12, T5

**GIVEN** a `DispatchingAgentRunner` with a mock `claudeRunner`  
**AND** the resolved step model is `"gemini-ultra"` (not in registry)  
**WHEN** `runner.run(ctx)` is called  
**THEN** it throws an error with `code: "CONFIG_INVALID"`

---

## TC-29: DispatchingAgentRunner — codex runner reused across multiple OpenAI steps

- **Category**: DispatchingAgentRunner
- **Priority**: should
- **Source**: Req-14, D4, T5

**GIVEN** a `DispatchingAgentRunner` with a mock `claudeRunner`  
**AND** `OPENAI_API_KEY` is set  
**AND** two sequential calls with an OpenAI model  
**WHEN** `runner.run(ctx)` is called twice  
**THEN** the `CodexAgentRunner` is instantiated only once (constructor called once)

---

## TC-30: Doctor codex-cli check — no steps configured → pass (not required)

- **Category**: Doctor Check
- **Priority**: must
- **Source**: Req-16, T7, acceptance criteria

**GIVEN** a `DoctorContext` where `ctx.config.get("steps")` returns `null` or `{}`  
**WHEN** `codexCliCheck.check(ctx)` is called  
**THEN** `status` is `"pass"`  
**AND** `message` contains `"not required"` or `"no OpenAI model steps configured"`

---

## TC-31: Doctor codex-cli check — Claude-only steps → pass (not required)

- **Category**: Doctor Check
- **Priority**: must
- **Source**: Req-16, T7, acceptance criteria

**GIVEN** a `DoctorContext` where all configured step models are anthropic (e.g., `"claude-sonnet-4-6"`)  
**WHEN** `codexCliCheck.check(ctx)` is called  
**THEN** `status` is `"pass"`  
**AND** `message` contains `"not required"` (codex binary is not checked)

---

## TC-32: Doctor codex-cli check — OpenAI step + codex binary present → pass

- **Category**: Doctor Check
- **Priority**: must
- **Source**: Req-16, T7, acceptance criteria

**GIVEN** a `DoctorContext` where at least one step model is `"o3"` (openai)  
**AND** `ctx.execFile("codex", ["--version"])` resolves with `stdout: "codex 0.130.0\n"`  
**WHEN** `codexCliCheck.check(ctx)` is called  
**THEN** `status` is `"pass"`  
**AND** `message` contains the version string

---

## TC-33: Doctor codex-cli check — OpenAI step + codex binary absent → fail

- **Category**: Doctor Check
- **Priority**: must
- **Source**: Req-16, T7, acceptance criteria

**GIVEN** a `DoctorContext` where at least one step model is `"o3"` (openai)  
**AND** `ctx.execFile("codex", ["--version"])` rejects (binary not found)  
**WHEN** `codexCliCheck.check(ctx)` is called  
**THEN** `status` is `"fail"`  
**AND** `hint` contains `"npm install -g @openai/codex"` or equivalent install instruction

---

## TC-34: Doctor codex-cli check — OpenAI step via user-defined model → binary checked

- **Category**: Doctor Check
- **Priority**: should
- **Source**: Req-16, T7

**GIVEN** a `DoctorContext` where:
- `ctx.config.get("models")` returns `{ "my-custom-openai": { provider: "openai" } }`
- `ctx.config.get("steps")` returns `{ implementer: { model: "my-custom-openai" } }`  
**AND** `ctx.execFile("codex", ["--version"])` rejects  
**WHEN** `codexCliCheck.check(ctx)` is called  
**THEN** `status` is `"fail"` (binary absence detected for user-defined OpenAI model)

---

## TC-35: Shared prompt builder — branch context injected

- **Category**: Shared Prompt Builder
- **Priority**: must
- **Source**: Req-3, T1

**GIVEN** an `AgentRunContext` with `branch: "change/my-branch"`, `slug: "my-slug"`, `cwd: "/repo/worktree"`, `projectContext: null`  
**WHEN** `buildAdditionalInstructions(ctx)` is called  
**THEN** the returned string contains `"change/my-branch"`  
**AND** the returned string contains `"my-slug"`  
**AND** the returned string contains `"/repo/worktree"`

---

## TC-36: Shared prompt builder — projectContext included when present

- **Category**: Shared Prompt Builder
- **Priority**: must
- **Source**: Req-3, T1

**GIVEN** an `AgentRunContext` with `branch: "b"`, `slug: "s"`, `projectContext: "CLAUDE.md content"`  
**WHEN** `buildAdditionalInstructions(ctx)` is called  
**THEN** the returned string contains `"CLAUDE.md content"`  
**AND** it is wrapped in `<project-context>` tags

---

## TC-37: Shared prompt builder — no branch → empty string

- **Category**: Shared Prompt Builder
- **Priority**: should
- **Source**: T1

**GIVEN** an `AgentRunContext` with `branch: null` or `branch: undefined`  
**WHEN** `buildAdditionalInstructions(ctx)` is called  
**THEN** the returned string is empty (`""`)

---

## TC-38: Backward compatibility — default config routes to ClaudeCodeRunner

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: D4, acceptance criteria

**GIVEN** a `DispatchingAgentRunner` wrapping a real `ClaudeCodeRunner`  
**AND** a config with no `models` field and no `steps[*].model` overrides  
**WHEN** any step is dispatched  
**THEN** the step is executed by `ClaudeCodeRunner`  
**AND** no `CodexAgentRunner` is instantiated  
**AND** `OPENAI_API_KEY` is never read

---

## TC-39: Backward compatibility — LocalRuntime.createAgentRunner returns DispatchingAgentRunner

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: Req-15, T6

**GIVEN** a `LocalRuntime` instance  
**WHEN** `createAgentRunner()` is called  
**THEN** the returned object is an instance of `DispatchingAgentRunner`

---

## TC-40: Backward compatibility — test injection via _queryFn still works

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: T6

**GIVEN** a `LocalRuntime` constructed with a mock `_queryFn`  
**WHEN** `createAgentRunner()` is called and the returned runner processes a Claude (anthropic) step  
**THEN** the mock `_queryFn` is invoked (proving `ClaudeCodeRunner` received it via `DispatchingAgentRunner`)

---

## TC-41: CodexAgentRunner — implements AgentRunner interface (type-check)

- **Category**: Type Safety
- **Priority**: must
- **Source**: Req-1, acceptance criteria

**GIVEN** the TypeScript source of `CodexAgentRunner`  
**WHEN** `bun run typecheck` is executed  
**THEN** no type errors are reported for the `implements AgentRunner` declaration

---

## TC-42: DispatchingAgentRunner — implements AgentRunner interface (type-check)

- **Category**: Type Safety
- **Priority**: must
- **Source**: Req-14, acceptance criteria

**GIVEN** the TypeScript source of `DispatchingAgentRunner`  
**WHEN** `bun run typecheck` is executed  
**THEN** no type errors are reported for the `implements AgentRunner` declaration

---

## TC-43: Full test suite green

- **Category**: Build & Test
- **Priority**: must
- **Source**: acceptance criteria

**GIVEN** the implementation of all tasks (T0–T8)  
**WHEN** `bun run typecheck && bun run test` is executed  
**THEN** both commands exit with code 0  
**AND** no pre-existing tests are broken

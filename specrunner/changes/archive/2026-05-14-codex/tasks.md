# Tasks: Codex Provider Support

Reference: design.md in this folder.
Branch: `change/codex-ecff3ff4`

---

## [x] T0: Add @openai/codex-sdk dependency

```
bun add @openai/codex-sdk
```

Verify `package.json` has `"@openai/codex-sdk": "^0.130.0"` (or higher).

---

## [x] T1: Extract shared prompt builder

**Create `src/adapter/shared/prompt-builder.ts`**

Move `buildAdditionalInstructions` out of `src/adapter/claude-code/agent-runner.ts` into this new shared module.

```typescript
import type { AgentRunContext } from "../../core/port/agent-runner.js";

export function buildAdditionalInstructions(ctx: AgentRunContext): string {
  const { branch, slug } = ctx;
  const lines: string[] = [];

  if (branch) {
    lines.push(
      `RUNTIME INSTRUCTIONS (local Claude Code mode):`,
      `- You are running locally in the repository worktree at: ${ctx.cwd}`,
      `- Work on branch: ${branch} (already created by the CLI — do not create it again)`,
      `- After completing your task, end your session. The CLI will handle commit and push.`,
      `- Slug for this request: ${slug}`,
    );
  }

  if (ctx.projectContext) {
    lines.push("");
    lines.push("<project-context>");
    lines.push(ctx.projectContext);
    lines.push("</project-context>");
  }

  return lines.join("\n");
}
```

**Modify `src/adapter/claude-code/agent-runner.ts`**:
- Remove the local `buildAdditionalInstructions` function definition
- Add import: `import { buildAdditionalInstructions } from "../shared/prompt-builder.js";`

---

## [x] T2: Model registry module

**Create `src/config/model-registry.ts`**

```typescript
import type { SpecRunnerConfig } from "./schema.js";

export type Provider = "anthropic" | "openai";

export interface ModelEntry {
  provider: Provider;
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
}

export const BUILTIN_MODEL_REGISTRY: ModelsConfig = {
  "claude-opus-4-7":   { provider: "anthropic" },
  "claude-opus-4-6":   { provider: "anthropic" },
  "claude-sonnet-4-6": { provider: "anthropic" },
  "claude-sonnet-4-5": { provider: "anthropic" },
  "claude-opus-4-5":   { provider: "anthropic" },
  "claude-haiku-4-5":  { provider: "anthropic" },
  "o3":                { provider: "openai" },
  "gpt-5.4":           { provider: "openai" },
  "gpt-5.3-codex":     { provider: "openai" },
  "gpt-5.2-codex":     { provider: "openai" },
  "gpt-5.1":           { provider: "openai" },
  "gpt-5.5":           { provider: "openai" },
};

/**
 * Merge built-in registry with user-defined models.
 * User entries override built-ins (same key → user wins).
 */
export function mergeModelRegistry(config: SpecRunnerConfig): ModelsConfig {
  return { ...BUILTIN_MODEL_REGISTRY, ...(config.models ?? {}) };
}

/**
 * Resolve provider for a model name from the merged registry.
 * Throws CONFIG_INVALID for unknown model names.
 */
export function resolveProvider(modelName: string, merged: ModelsConfig): Provider {
  const entry = merged[modelName];
  if (!entry) {
    throw Object.assign(
      new Error(`CONFIG_INVALID: Unknown model "${modelName}". Add it to config.models or use a built-in model.`),
      { code: "CONFIG_INVALID" },
    );
  }
  return entry.provider;
}
```

---

## [x] T3: Config schema extension

**Modify `src/config/schema.ts`**:

1. Add these interfaces (after `StepExecutionConfig`):

```typescript
export interface ModelEntry {
  provider: "anthropic" | "openai";
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
}
```

2. Add `models?: ModelsConfig` to `SpecRunnerConfig` (after `steps`):

```typescript
  /**
   * User-defined model registry. Merged with BUILTIN_MODEL_REGISTRY at runtime.
   * Use this to add new models or override provider assignments.
   * When absent, only built-in models are available.
   * D5 (design.md): user entries override built-ins.
   */
  models?: ModelsConfig;
```

3. Add `models?: Record<string, unknown>` to `RawConfig`.

4. Add a top-level import at the top of `schema.ts` (after existing imports):

```typescript
import { BUILTIN_MODEL_REGISTRY } from "./model-registry.js";
```

This import is safe: `model-registry.ts` imports from `schema.ts` as `import type` only
(the `SpecRunnerConfig` type is not emitted to JS), so there is no circular runtime dependency.
See D6 (design.md) for rationale.

5. In `validateConfig()`, add the following two guards **after** the existing `steps` validation block:

```typescript
  // Validate models section if provided
  if (obj["models"] !== undefined && obj["models"] !== null) {
    if (typeof obj["models"] !== "object") {
      throw Object.assign(
        new Error("CONFIG_INVALID: models must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const modelsObj = obj["models"] as Record<string, unknown>;
    for (const [modelName, modelVal] of Object.entries(modelsObj)) {
      if (typeof modelVal !== "object" || modelVal === null) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: models.${modelName} must be an object.`),
          { code: "CONFIG_INVALID" },
        );
      }
      const entry = modelVal as Record<string, unknown>;
      if (entry["provider"] !== "anthropic" && entry["provider"] !== "openai") {
        throw Object.assign(
          new Error(`CONFIG_INVALID: models.${modelName}.provider must be "anthropic" or "openai".`),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }

  // Validate that step models exist in the merged registry and that OpenAI models
  // are not used with managed runtime (D6 design.md).
  // BUILTIN_MODEL_REGISTRY is imported from model-registry.ts at the top of this file.
  // model-registry.ts uses `import type { SpecRunnerConfig }` (type-only, no circular dep).
  if (obj["steps"] !== undefined && obj["steps"] !== null) {
    const stepsObj = obj["steps"] as Record<string, unknown>;
    const userModels = (obj["models"] ?? {}) as Record<string, { provider?: string }>;
    const merged = { ...BUILTIN_MODEL_REGISTRY, ...userModels };
    const allModelNames = new Set(Object.keys(merged));
    const openaiModels = new Set(
      Object.entries(merged)
        .filter(([, v]) => (v as { provider?: string }).provider === "openai")
        .map(([k]) => k),
    );

    const collectStepModel = (stepKey: string, stepVal: unknown): string | undefined => {
      if (typeof stepVal === "object" && stepVal !== null) {
        const m = (stepVal as Record<string, unknown>)["model"];
        if (typeof m === "string" && m.length > 0) return m;
      }
      return undefined;
    };

    for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
      const model = collectStepModel(stepKey, stepVal);
      if (model === undefined) continue;

      // Guard: unknown model
      if (!allModelNames.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: steps.${stepKey}.model "${model}" is not in the model registry. Add it to config.models.`),
          { code: "CONFIG_INVALID" },
        );
      }

      // Guard: managed + openai
      if (runtime === "managed" && openaiModels.has(model)) {
        throw Object.assign(
          new Error(`CONFIG_INVALID: OpenAI model "${model}" cannot be used with runtime "managed".`),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }
```

---

## [x] T4: CodexAgentRunner

**Create `src/adapter/codex/agent-runner.ts`**

```typescript
/**
 * CodexAgentRunner: AgentRunner adapter for OpenAI Codex SDK (local runtime).
 *
 * Implements AgentRunner port using @openai/codex-sdk Codex class.
 * Mirrors ClaudeCodeRunner in structure; uses sandboxMode instead of allowedTools.
 *
 * D1 (design.md): prompt construction mirrors ClaudeCodeRunner.
 * D2 (design.md): sandboxMode "workspace-write" for all steps.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Codex } from "@openai/codex-sdk";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";
import { getStepExecutionConfig } from "../../config/step-config.js";

// Minimal interface for the Codex SDK types used here (avoids deep SDK type dependency in tests)
interface Turn {
  finalResponse: string;
  items: ThreadItem[];
  usage: CodexUsage | null;
}

interface FileChangeItem {
  type: "file_change";
  changes: { path: string; kind: "add" | "delete" | "update" }[];
  status: "completed" | "failed";
}

interface ThreadItem {
  type: string;
  [key: string]: unknown;
}

interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

// Injectable for testing
export interface CodexThread {
  run(prompt: string, opts?: { signal?: AbortSignal }): Promise<Turn>;
}

export interface CodexInstance {
  startThread(opts: {
    workingDirectory: string;
    sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
    model?: string;
    skipGitRepoCheck?: boolean;
  }): CodexThread;
}

export interface CodexAgentRunnerDeps {
  apiKey: string;
  /** Injectable factory for testing. Defaults to `(opts) => new Codex(opts)`. */
  _codexFactory?: (opts: { apiKey: string }) => CodexInstance;
}

export class CodexAgentRunner implements AgentRunner {
  private readonly apiKey: string;
  private readonly codexFactory: (opts: { apiKey: string }) => CodexInstance;

  constructor(deps: CodexAgentRunnerDeps) {
    this.apiKey = deps.apiKey;
    this.codexFactory = deps._codexFactory ?? ((opts) => new Codex(opts) as unknown as CodexInstance);
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const cwd = ctx.cwd;
    const step = ctx.step;
    const state = ctx.state;

    let stepCtx: StepContext = {
      config: ctx.config,
      slug: ctx.slug,
      cwd,
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        baseBranch: "main",
        content: ctx.requestContent,
        enabled: [],
      },
      repo: { owner: "", name: "" },
      dynamicContext: ctx.dynamicContext,
    };

    // D3 pattern: call enrichContext before buildMessage (same as ClaudeCodeRunner)
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    const baseMessage = step.buildMessage(state, stepCtx);
    const additionalInstructions = buildAdditionalInstructions(ctx);
    const fullPrompt = additionalInstructions
      ? `${baseMessage}\n\n${additionalInstructions}`
      : baseMessage;

    const dynamicMaxTurns = step.getMaxTurns?.(state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
      model: step.agent.model,
      maxTurns: dynamicMaxTurns ?? step.maxTurns,
    });

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
    }

    let turn: Turn;
    try {
      const codex = this.codexFactory({ apiKey: this.apiKey });
      const thread = codex.startThread({
        workingDirectory: cwd,
        sandboxMode: "workspace-write",
        model: resolvedConfig.model,
        skipGitRepoCheck: true,
      });
      turn = await thread.run(fullPrompt, { signal: abortController.signal });
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
        return {
          completionReason: "timeout",
          resultContent: null,
          error: Object.assign(
            new Error(`Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`),
            { code: "STEP_TIMEOUT" },
          ),
        };
      }
      const cause = err as Error;
      return {
        completionReason: "error",
        resultContent: null,
        error: Object.assign(
          new Error(`Codex SDK error: ${cause.message}`),
          { code: "CODEX_SDK_ERROR", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    // Log file changes (informational)
    const fileChanges = turn.items.filter((i): i is FileChangeItem => i.type === "file_change");
    if (fileChanges.length > 0) {
      const paths = fileChanges.flatMap((fc) => fc.changes.map((c) => c.path));
      process.stderr.write(`[codex] file changes: ${paths.join(", ")}\n`);
    }

    // Read result file from local fs (same as ClaudeCodeRunner — D1)
    const resultFilePath = step.resultFilePath(state, stepCtx);
    let resultContent: string | null = null;
    if (resultFilePath !== null) {
      const absolutePath = path.isAbsolute(resultFilePath)
        ? resultFilePath
        : path.join(cwd, resultFilePath);
      try {
        resultContent = await fs.readFile(absolutePath, "utf-8");
      } catch {
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(`result file not found: ${resultFilePath}`),
            { code: "RESULT_FILE_NOT_FOUND" },
          ),
        };
      }
    } else {
      resultContent = turn.finalResponse;
    }

    // Map Codex usage → ModelUsage
    // cached_input_tokens → cacheReadInputTokens; cacheCreationInputTokens has no Codex equivalent → 0
    let modelUsage: Record<string, ModelUsage> | undefined;
    if (turn.usage) {
      const u = turn.usage;
      const usage: ModelUsage = {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadInputTokens: u.cached_input_tokens ?? 0,
        cacheCreationInputTokens: 0,
      };
      modelUsage = { [resolvedConfig.model]: usage };
    }

    return {
      completionReason: "success",
      resultContent,
      modelUsage,
    };
  }
}
```

---

## [x] T5: DispatchingAgentRunner

**Create `src/adapter/dispatching/agent-runner.ts`**

```typescript
/**
 * DispatchingAgentRunner: routes step execution to ClaudeCodeRunner or CodexAgentRunner
 * based on model-to-provider resolution.
 *
 * D4 (design.md): ClaudeCodeRunner is eager; CodexAgentRunner is lazy (first OpenAI step).
 * RuntimeStrategy.createAgentRunner() signature is unchanged — this class is a drop-in.
 */
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";
import type { ClaudeCodeRunner } from "../claude-code/agent-runner.js";
import { CodexAgentRunner } from "../codex/agent-runner.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { mergeModelRegistry, resolveProvider } from "../../config/model-registry.js";

export class DispatchingAgentRunner implements AgentRunner {
  private readonly claudeRunner: ClaudeCodeRunner;
  private codexRunner: CodexAgentRunner | null = null;

  constructor(claudeRunner: ClaudeCodeRunner) {
    this.claudeRunner = claudeRunner;
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const dynamicMaxTurns = ctx.step.getMaxTurns?.(ctx.state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, ctx.step.name, {
      model: ctx.step.agent.model,
      maxTurns: dynamicMaxTurns ?? ctx.step.maxTurns,
    });

    const merged = mergeModelRegistry(ctx.config);
    const provider = resolveProvider(resolvedConfig.model, merged);

    if (provider === "openai") {
      if (!this.codexRunner) {
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) {
          throw Object.assign(
            new Error("OPENAI_API_KEY environment variable is required for OpenAI model steps"),
            { code: "MISSING_OPENAI_API_KEY" },
          );
        }
        this.codexRunner = new CodexAgentRunner({ apiKey });
      }
      return this.codexRunner.run(ctx);
    }

    // Default: anthropic
    return this.claudeRunner.run(ctx);
  }
}
```

---

## [x] T6: LocalRuntime update

**Modify `src/core/runtime/local.ts`**:

1. Add import:
```typescript
import { DispatchingAgentRunner } from "../../adapter/dispatching/agent-runner.js";
```

2. Change `createAgentRunner()`:
```typescript
createAgentRunner(): AgentRunner {
  const worktreeCwd = this.workspace?.cwd ?? this.cwd;
  const claudeRunner = createClaudeCodeRunner({ cwd: worktreeCwd, _queryFn: this.queryFn });
  return new DispatchingAgentRunner(claudeRunner);
}
```

Note: pass `_queryFn: this.queryFn` so that tests injecting a mock `queryFn` into `LocalRuntime`
continue to work through to `ClaudeCodeRunner`.

---

## [x] T7: Doctor codex-cli check

**Create `src/core/doctor/checks/runtime/codex-cli.ts`**

```typescript
/**
 * Check that the `codex` CLI binary is available when any pipeline step uses an OpenAI model.
 * D7 (design.md): skipped (status: pass) when no OpenAI model steps are configured.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { BUILTIN_MODEL_REGISTRY } from "../../../../config/model-registry.js";

function hasOpenAiSteps(ctx: DoctorContext): boolean {
  // DoctorConfig.get() uses dot-path traversal (split on "."). Passing a single-segment
  // key such as "steps" or "models" returns the corresponding top-level object from
  // SpecRunnerConfig — confirmed by the buildDoctorConfig() implementation in src/cli/doctor.ts.
  const steps = ctx.config.get("steps");
  if (!steps || typeof steps !== "object") return false;

  const userModels = ctx.config.get("models");
  const merged = {
    ...BUILTIN_MODEL_REGISTRY,
    ...(typeof userModels === "object" && userModels !== null
      ? (userModels as Record<string, { provider?: string }>)
      : {}),
  };

  const stepsObj = steps as Record<string, unknown>;
  for (const [, stepVal] of Object.entries(stepsObj)) {
    if (typeof stepVal !== "object" || stepVal === null) continue;
    const model = (stepVal as Record<string, unknown>)["model"];
    if (typeof model !== "string") continue;
    const entry = merged[model];
    if (entry && (entry as { provider?: string }).provider === "openai") return true;
  }
  return false;
}

export const codexCliCheck: DoctorCheck = {
  name: "codex-cli",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    if (!hasOpenAiSteps(ctx)) {
      return {
        status: "pass",
        message: "codex CLI not required (no OpenAI model steps configured)",
      };
    }

    try {
      const result = await ctx.execFile("codex", ["--version"], {
        signal: AbortSignal.timeout(5000),
      });
      const version = result.stdout.trim();
      return {
        status: "pass",
        message: `codex ${version}`,
      };
    } catch {
      return {
        status: "fail",
        message: "codex CLI is not installed or not in PATH",
        hint: "Install @openai/codex: npm install -g @openai/codex",
      };
    }
  },
};
```

---

## [x] T8: Doctor checks index update

**Modify `src/core/doctor/checks/index.ts`**:

1. Add import after `gitVersionCheck` import:
```typescript
import { codexCliCheck } from "./runtime/codex-cli.js";
```

2. Add to `allChecks` array after `gitVersionCheck`:
```typescript
  gitVersionCheck,
  codexCliCheck,   // ← add here
```

3. Add to the re-exports at the bottom:
```typescript
export { codexCliCheck } from "./runtime/codex-cli.js";
// or inline with existing exports
```

---

## [x] T9: Tests

### `tests/config/model-registry.test.ts`
- `mergeModelRegistry` with no user models → equals BUILTIN
- `mergeModelRegistry` with user override → user entry wins
- `mergeModelRegistry` with new model → merged contains both
- `resolveProvider` known anthropic model → "anthropic"
- `resolveProvider` known openai model → "openai"
- `resolveProvider` unknown model → throws code: "CONFIG_INVALID"

### `tests/config/schema.test.ts` additions
- `validateConfig` with valid `models` field → passes
- `validateConfig` with `models.x.provider: "gemini"` → throws CONFIG_INVALID
- `validateConfig` with `steps.implementer.model: "o3"` (known openai) → passes for local runtime
- `validateConfig` with `steps.implementer.model: "o3"` + `runtime: "managed"` → throws CONFIG_INVALID
- `validateConfig` with `steps.implementer.model: "unknown-model-xyz"` → throws CONFIG_INVALID

### `tests/adapter/codex/agent-runner.test.ts`
- Successful run with `resultFilePath` → reads file, returns resultContent
- Successful run with `resultFilePath: null` → returns `turn.finalResponse` as resultContent
- Timeout → returns `{ completionReason: "timeout" }`
- SDK error → returns `{ completionReason: "error" }`
- Result file not found → returns `{ completionReason: "error", code: "RESULT_FILE_NOT_FOUND" }`
- `turn.usage` mapped correctly (cached_input_tokens → cacheReadInputTokens; cacheCreationInputTokens: 0)
- `enrichContext` called when defined on step
- `buildAdditionalInstructions` injected into prompt (branch, slug, projectContext present)
- File change items logged (stderr contains changed paths)

### `tests/adapter/dispatching/agent-runner.test.ts`
- Anthropic model → delegates to claudeRunner
- OpenAI model → delegates to codexRunner (lazy init)
- OpenAI model without OPENAI_API_KEY → throws MISSING_OPENAI_API_KEY
- Unknown model → throws CONFIG_INVALID (from resolveProvider)
- Codex runner reused across multiple OpenAI steps (not recreated)

### `tests/core/doctor/checks/codex-cli.test.ts`
- No steps configured → status: "pass" (not required message)
- Steps with Claude model → status: "pass" (not required message)
- Steps with OpenAI model + codex present → status: "pass" (with version)
- Steps with OpenAI model + codex absent → status: "fail" (with install hint)

---

## Acceptance Checklist

- [x] `bun run typecheck` green
- [x] `bun run test` green (all existing + new tests)
- [x] `CodexAgentRunner implements AgentRunner` (type-checked)
- [x] `DispatchingAgentRunner implements AgentRunner` (type-checked)
- [x] Default config (no `models`, no `steps.*.model`) → ClaudeCodeRunner path unchanged
- [x] `steps.implementer.model: "o3"` → CodexAgentRunner invoked for implementer step
- [x] `steps.implementer.model: "unknown"` → validateConfig throws CONFIG_INVALID
- [x] `runtime: "managed"` + OpenAI model step → validateConfig throws CONFIG_INVALID
- [x] `specrunner doctor` with no OpenAI steps → codex-cli check shows "not required" (pass)
- [x] `specrunner doctor` with OpenAI steps + no codex binary → codex-cli check fails

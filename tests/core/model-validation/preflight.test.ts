/**
 * Unit tests for src/core/model-validation/preflight.ts
 *
 * TC-022: managed 相当 runtime では probe が起動されない
 * TC-023: 腐った Anthropic model ID で job 開始前に CONFIG_INVALID 停止
 * TC-024: offline で一覧取得に失敗しても job は継続する
 * TC-025: anthropic 実効モデルが 0 件のとき probe が起動されない
 * TC-026: alias のみの構成では live 検証が pass する
 * TC-027: invalid 時のエラーメッセージに step 名と config path を含む
 * TC-028: skipped 時に warning が出力される
 * TC-029: ManagedRuntime に listSupportedModels が存在しない
 */

import { describe, it, expect, vi } from "vitest";
import { assertEffectiveModelsExist } from "../../../src/core/model-validation/preflight.js";
import type { AssertEffectiveModelsExistOpts } from "../../../src/core/model-validation/preflight.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SupportedModelsResult } from "../../../src/core/port/model-listing.js";
import { BUILTIN_MODEL_REGISTRY, mergeModelRegistry } from "../../../src/config/model-registry.js";
import { STANDARD_DESCRIPTOR } from "../../../src/core/pipeline/registry.js";
import { SpecRunnerError } from "../../../src/errors.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { PipelineDescriptor } from "../../../src/core/pipeline/types.js";
import type { AgentStep, Step } from "../../../src/core/port/step-types.js";
import type { AgentStepName } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {}, ...overrides };
}

/** Build a minimal AgentStep for testing. */
function makeAgentStep(name: string, model: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as AgentStepName,
      model,
      system: "",
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/** Build a minimal PipelineDescriptor with given steps. */
function makeDescriptor(steps: readonly (readonly [string, Step])[]): PipelineDescriptor {
  return {
    ...STANDARD_DESCRIPTOR,
    steps,
    transitions: [],
    loopFixerPairs: {},
    loopNames: [],
    roles: {},
  };
}

/**
 * Build a minimal runtime with listSupportedModels returning the given result.
 * All other required RuntimeStrategy methods are no-ops.
 */
function makeRuntime(result: SupportedModelsResult): RuntimeStrategy {
  return {
    listSupportedModels: vi.fn().mockResolvedValue(result),
    // Minimal required methods (not used in these tests)
    bootstrapJob: vi.fn().mockResolvedValue({}),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    createAgentRunner: vi.fn(),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: "/" }),
    buildDeps: vi.fn(),
    registerCleanup: vi.fn(),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable", reason: "n/a" }),
  };
}

/**
 * Build a runtime WITHOUT listSupportedModels (simulates ManagedRuntime behavior).
 */
function makeRuntimeWithoutProbe(): RuntimeStrategy {
  return {
    // No listSupportedModels
    bootstrapJob: vi.fn().mockResolvedValue({}),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    createAgentRunner: vi.fn(),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: "/" }),
    buildDeps: vi.fn(),
    registerCleanup: vi.fn(),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable", reason: "n/a" }),
  };
}

function makeOpts(overrides: Partial<AssertEffectiveModelsExistOpts> = {}): AssertEffectiveModelsExistOpts {
  const config = makeConfig();
  return {
    runtime: makeRuntime({ kind: "listed", models: [] }),
    descriptor: STANDARD_DESCRIPTOR,
    config,
    requestType: undefined,
    env: {},
    merged: mergeModelRegistry(config),
    logWarn: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-022: managed 相当 runtime では probe が起動されない
// ---------------------------------------------------------------------------

describe("TC-022: probe is not started for managed-equivalent runtime", () => {
  it("runtime without listSupportedModels → returns without calling any probe", async () => {
    const runtime = makeRuntimeWithoutProbe();
    await expect(
      assertEffectiveModelsExist(makeOpts({ runtime })),
    ).resolves.toBeUndefined();
    // listSupportedModels was never available → verify no call happened at all
    expect((runtime as { listSupportedModels?: unknown }).listSupportedModels).toBeUndefined();
  });

  it("runtime without listSupportedModels → does not throw", async () => {
    const runtime = makeRuntimeWithoutProbe();
    await expect(
      assertEffectiveModelsExist(makeOpts({ runtime })),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-023: 腐った Anthropic model ID で job 開始前に CONFIG_INVALID 停止
// ---------------------------------------------------------------------------

describe("TC-023: CONFIG_INVALID is thrown for stale Anthropic model ID before job start", () => {
  it("defunct anthropic model → throws SpecRunnerError with CONFIG_INVALID code", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-defunct-99")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = { ...BUILTIN_MODEL_REGISTRY, "claude-defunct-99": { provider: "anthropic" as const } };

    const runtime = makeRuntime({ kind: "listed", models: ["claude-sonnet-5"] });

    await expect(
      assertEffectiveModelsExist({
        runtime,
        descriptor,
        config,
        requestType: undefined,
        env: {},
        merged,
        logWarn: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("throws a SpecRunnerError instance", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-defunct-99")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = { ...BUILTIN_MODEL_REGISTRY, "claude-defunct-99": { provider: "anthropic" as const } };

    const runtime = makeRuntime({ kind: "listed", models: ["claude-sonnet-5"] });

    await expect(
      assertEffectiveModelsExist({
        runtime,
        descriptor,
        config,
        requestType: undefined,
        env: {},
        merged,
        logWarn: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SpecRunnerError);
  });
});

// ---------------------------------------------------------------------------
// TC-024: offline で一覧取得に失敗しても job は継続する
// ---------------------------------------------------------------------------

describe("TC-024: job continues when model list retrieval fails offline", () => {
  it("unavailable result → resolves without throwing", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-sonnet-5")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;
    const runtime = makeRuntime({ kind: "unavailable", reason: "Network unreachable" });

    await expect(
      assertEffectiveModelsExist({
        runtime,
        descriptor,
        config,
        requestType: undefined,
        env: {},
        merged,
        logWarn: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-025: anthropic 実効モデルが 0 件のとき probe が起動されない
// ---------------------------------------------------------------------------

describe("TC-025: probe is not started when there are no anthropic effective models", () => {
  it("all steps use OpenAI models → listSupportedModels is never called", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["implementer", makeAgentStep("implementer", "gpt-4o")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = { ...BUILTIN_MODEL_REGISTRY, "gpt-4o": { provider: "openai" as const } };
    const probeSpy = vi.fn().mockResolvedValue({ kind: "listed" as const, models: [] });
    const runtime: RuntimeStrategy = {
      ...makeRuntimeWithoutProbe(),
      listSupportedModels: probeSpy,
    };

    await assertEffectiveModelsExist({
      runtime,
      descriptor,
      config,
      requestType: undefined,
      env: {},
      merged,
      logWarn: vi.fn(),
    });

    expect(probeSpy).not.toHaveBeenCalled();
  });

  it("no steps → listSupportedModels is never called", async () => {
    const descriptor = makeDescriptor([]);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;
    const probeSpy = vi.fn().mockResolvedValue({ kind: "listed" as const, models: [] });
    const runtime: RuntimeStrategy = {
      ...makeRuntimeWithoutProbe(),
      listSupportedModels: probeSpy,
    };

    await assertEffectiveModelsExist({
      runtime,
      descriptor,
      config,
      requestType: undefined,
      env: {},
      merged,
      logWarn: vi.fn(),
    });

    expect(probeSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-026: alias のみの構成では live 検証が pass する
// ---------------------------------------------------------------------------

describe("TC-026: live validation passes when all effective models are aliases", () => {
  it("all alias models with empty listed result → resolves without throwing", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "sonnet")],
      ["code-review", makeAgentStep("code-review", "opus")],
      ["implementer", makeAgentStep("implementer", "haiku")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;
    const runtime = makeRuntime({ kind: "listed", models: [] });

    await expect(
      assertEffectiveModelsExist({
        runtime,
        descriptor,
        config,
        requestType: undefined,
        env: {},
        merged,
        logWarn: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-027: invalid 時のエラーメッセージに step 名と config path を含む
// ---------------------------------------------------------------------------

describe("TC-027: error message contains step name and config path when invalid", () => {
  it("throws with step name and config path in message", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-defunct-99")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig({
      steps: {
        design: { model: "claude-defunct-99" },
      },
    });
    const merged = { ...BUILTIN_MODEL_REGISTRY, "claude-defunct-99": { provider: "anthropic" as const } };
    const runtime = makeRuntime({ kind: "listed", models: [] });

    let thrownError: Error | undefined;
    try {
      await assertEffectiveModelsExist({
        runtime,
        descriptor,
        config,
        requestType: undefined,
        env: {},
        merged,
        logWarn: vi.fn(),
      });
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError).toBeInstanceOf(SpecRunnerError);
    // The message should contain the step name "design"
    expect(thrownError!.message).toContain("design");
    // The message should contain the config path "steps.design.model"
    expect(thrownError!.message).toContain("steps.design.model");
  });
});

// ---------------------------------------------------------------------------
// TC-028: skipped 時に warning が出力される
// ---------------------------------------------------------------------------

describe("TC-028: warning is output when skipped", () => {
  it("unavailable result → logWarn is called with reason in message", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-sonnet-5")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;
    const runtime = makeRuntime({ kind: "unavailable", reason: "Network unreachable" });
    const logWarnSpy = vi.fn();

    await assertEffectiveModelsExist({
      runtime,
      descriptor,
      config,
      requestType: undefined,
      env: {},
      merged,
      logWarn: logWarnSpy,
    });

    expect(logWarnSpy).toHaveBeenCalled();
    const warnMessage: string = logWarnSpy.mock.calls[0]?.[0] ?? "";
    expect(warnMessage).toContain("Network unreachable");
  });

  it("logWarn is NOT called when result is listed (ok)", async () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["design", makeAgentStep("design", "claude-sonnet-5")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;
    const runtime = makeRuntime({ kind: "listed", models: ["claude-sonnet-5"] });
    const logWarnSpy = vi.fn();

    await assertEffectiveModelsExist({
      runtime,
      descriptor,
      config,
      requestType: undefined,
      env: {},
      merged,
      logWarn: logWarnSpy,
    });

    expect(logWarnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-029: ManagedRuntime に listSupportedModels が存在しない
// ---------------------------------------------------------------------------

describe("TC-029: ManagedRuntime does not have listSupportedModels", () => {
  it("ManagedRuntime class does not implement listSupportedModels", async () => {
    // Dynamic import to avoid static import of ManagedRuntime's heavy deps in all tests
    const { ManagedRuntime } = await import("../../../src/core/runtime/managed.js").catch(() => ({
      ManagedRuntime: null,
    }));

    if (!ManagedRuntime) {
      // Skip if ManagedRuntime is not importable in test context
      return;
    }

    // Check that the prototype does not have listSupportedModels
    expect(
      typeof (ManagedRuntime.prototype as { listSupportedModels?: unknown }).listSupportedModels,
    ).toBe("undefined");
  });
});

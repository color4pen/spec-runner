/**
 * Unit tests for src/adapter/claude-code/query-one-shot.ts
 *
 * TC-OSQ-01: 正常な query() result を QueryOneShotResult に変換 (text / sessionId / stopReason)
 * TC-OSQ-02: timeout で SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT") を throw
 * TC-OSQ-03: config.steps[stepName].maxTurns が query options に反映される
 * TC-OSQ-04: session_id が QueryOneShotResult.sessionId に伝播する
 * TC-OSQ-05: 非 success result で SpecRunnerError("QUERY_ONE_SHOT_FAILED") を throw
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { queryOneShot, type QueryFn } from "../../../../src/adapter/claude-code/query-one-shot.js";
import { DEFAULT_ONE_SHOT_MODEL } from "../../../../src/config/model-registry.js";
import { SpecRunnerError } from "../../../../src/errors.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { stripSecrets, SECRET_DENYLIST } from "../../../../src/util/env-filter.js";

// ---------------------------------------------------------------------------
// envOmissionViolations — pure predicate (design D3)
//
// Shared by TC-OSQ-ENV-02 (behavioral capture) and TC-OSQ-ENV-03 (detection guard)
// so that the real-behaviour assertion and the detection mechanism cannot diverge.
// ---------------------------------------------------------------------------

/**
 * Returns an array of violation strings for a given env value.
 * - undefined / null → env was omitted (SDK would inherit raw process.env)
 * - any key in SECRET_DENYLIST is present → secret leaked
 * - empty array → env is clean (strip-済み)
 */
function envOmissionViolations(
  env: Record<string, string | undefined> | undefined | null,
): string[] {
  if (env == null) {
    return ["env omitted — SDK inherits raw process.env"];
  }
  const leaks: string[] = [];
  for (const key of SECRET_DENYLIST) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      leaks.push(`secret leaked: ${key}`);
    }
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    ...overrides,
  };
}

/** Build a mock QueryFn that yields a single success result message. */
function makeSuccessQueryFn(result: string, sessionId?: string): QueryFn {
  return vi.fn().mockImplementation(() => {
    return (async function* () {
      yield {
        type: "result",
        subtype: "success",
        result,
        session_id: sessionId,
      };
    })();
  }) as unknown as QueryFn;
}

// ---------------------------------------------------------------------------
// TC-OSQ-01: success result → QueryOneShotResult
// ---------------------------------------------------------------------------
describe("TC-OSQ-01: success result is converted to QueryOneShotResult", () => {
  it("maps text, sessionId, and stopReason from a success result", async () => {
    const queryFn = makeSuccessQueryFn("hello", "sess-1");

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    expect(result.text).toBe("hello");
    expect(result.sessionId).toBe("sess-1");
    expect(result.stopReason).toBe("success");
  });

  it("turnCount is undefined (reserved for future use)", async () => {
    const queryFn = makeSuccessQueryFn("ok");

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    expect(result.turnCount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-02: timeout → SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT")
// ---------------------------------------------------------------------------
describe("TC-OSQ-02: timeout throws QUERY_ONE_SHOT_TIMEOUT", () => {
  it("throws SpecRunnerError with QUERY_ONE_SHOT_TIMEOUT when abortController fires", async () => {
    // Mock that blocks until the abortController fires, then throws
    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        const ctrl = options?.abortController as AbortController | undefined;
        return (async function* () {
          await new Promise<void>((_resolve, reject) => {
            if (!ctrl) return;
            if (ctrl.signal.aborted) {
              reject(new DOMException("The operation was aborted", "AbortError"));
              return;
            }
            ctrl.signal.addEventListener(
              "abort",
              () => reject(new DOMException("The operation was aborted", "AbortError")),
              { once: true },
            );
          });
        })();
      },
    ) as unknown as QueryFn;

    await expect(
      queryOneShot(
        { systemPrompt: "sys", prompt: "user", timeoutMs: 50 },
        makeConfig(),
        mockQueryFn,
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === "QUERY_ONE_SHOT_TIMEOUT",
    );
  }, 5000);
});

// ---------------------------------------------------------------------------
// TC-OSQ-03: config.steps[stepName].maxTurns reflected in query options
// ---------------------------------------------------------------------------
describe("TC-OSQ-03: config resolution — maxTurns from config.steps passed to query", () => {
  it("passes config.steps[stepName].maxTurns to the query fn options", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield {
            type: "result",
            subtype: "success",
            result: "done",
            session_id: undefined,
          };
        })();
      },
    ) as unknown as QueryFn;

    const config = makeConfig({
      steps: { "request-review": { maxTurns: 10 } },
    });

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user", stepName: "request-review" },
      config,
      mockQueryFn,
    );

    expect(capturedOptions?.["maxTurns"]).toBe(10);
  });

  it("omits maxTurns from query options when config resolves to null (unlimited)", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    // null maxTurns at step level → unlimited → no maxTurns in query options
    const config = makeConfig({
      steps: { "one-shot": { maxTurns: null } },
    });

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      config,
      mockQueryFn,
    );

    expect(capturedOptions).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(capturedOptions, "maxTurns")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-04: session_id propagates to QueryOneShotResult.sessionId
// ---------------------------------------------------------------------------
describe("TC-OSQ-04: session_id propagates to sessionId field", () => {
  it("sets sessionId from SDK result session_id", async () => {
    const queryFn = makeSuccessQueryFn("response", "managed-sess-42");

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    expect(result.sessionId).toBe("managed-sess-42");
  });

  it("leaves sessionId undefined when session_id is absent", async () => {
    const queryFn = makeSuccessQueryFn("response", undefined);

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    expect(result.sessionId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-06: modelUsage extracted from SDK result
// ---------------------------------------------------------------------------

describe("TC-OSQ-06: modelUsage is extracted from SDK result", () => {
  it("maps modelUsage from SDK result to QueryOneShotResult", async () => {
    const mockModelUsage = {
      "claude-opus-4-5": {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 10,
        cacheCreationInputTokens: 5,
      },
    };

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: undefined,
          modelUsage: mockModelUsage,
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(result.modelUsage).toBeDefined();
    expect(result.modelUsage!["claude-opus-4-5"]).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 10,
      cacheCreationInputTokens: 5,
    });
  });

  it("returns undefined modelUsage when SDK result has no modelUsage", async () => {
    const mockQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: undefined,
          // No modelUsage field
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(result.modelUsage).toBeUndefined();
  });

  it("returns undefined modelUsage when SDK result has empty modelUsage object", async () => {
    const mockQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: undefined,
          modelUsage: {}, // empty object
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(result.modelUsage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-07: modelOverride takes priority over config resolution chain
// ---------------------------------------------------------------------------
describe("TC-OSQ-07: modelOverride overrides config resolution chain model", () => {
  it("uses modelOverride value when config has a step-level model", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    const config = makeConfig({
      steps: { "request-review": { model: "claude-sonnet-4-6" } },
    });

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user", stepName: "request-review", modelOverride: "claude-opus-4-8[1m]" },
      config,
      mockQueryFn,
    );

    // modelOverride must win over config's "claude-sonnet-4-6"
    expect(capturedOptions?.["model"]).toBe("claude-opus-4-8[1m]");
  });

  it("uses resolvedConfig.model when modelOverride is not specified (config present)", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    const config = makeConfig({
      steps: { "request-review": { model: "claude-sonnet-4-6" } },
    });

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user", stepName: "request-review" },
      config,
      mockQueryFn,
    );

    // No modelOverride → resolvedConfig.model from step config
    expect(capturedOptions?.["model"]).toBe("claude-sonnet-4-6");
  });

  it("falls back to stepDefaults model when neither config nor modelOverride are set", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    // No config, no modelOverride → stepDefaults model from opts.model
    await queryOneShot(
      { systemPrompt: "sys", prompt: "user", stepName: "request-review", model: "claude-opus-4-5" },
      makeConfig(),
      mockQueryFn,
    );

    expect(capturedOptions?.["model"]).toBe("claude-opus-4-5");
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-08: one-shot default model config resolution
// ---------------------------------------------------------------------------

describe("TC-OSQ-08: one-shot default model — config resolution", () => {
  /** Capture model from query options */
  function makeCaptureQueryFn(): { queryFn: QueryFn; getModel: () => string | undefined } {
    let captured: string | undefined;
    const queryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        captured = options?.["model"] as string | undefined;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;
    return { queryFn, getModel: () => captured };
  }

  it("uses config.steps.defaults.model when opts.model is not specified", async () => {
    const { queryFn, getModel } = makeCaptureQueryFn();
    const config = makeConfig({
      steps: { defaults: { model: "claude-opus-4-6" } },
    });

    await queryOneShot({ systemPrompt: "sys", prompt: "user" }, config, queryFn);

    expect(getModel()).toBe("claude-opus-4-6");
  });

  it("uses DEFAULT_ONE_SHOT_MODEL when config has no model and opts.model is not specified", async () => {
    const { queryFn, getModel } = makeCaptureQueryFn();

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    expect(getModel()).toBe(DEFAULT_ONE_SHOT_MODEL);
  });
});

// ---------------------------------------------------------------------------
// TC-SB-05: one-shot query options carry no sandbox setting (regression guard)
// ---------------------------------------------------------------------------

describe("TC-SB-05: one-shot options carry no sandbox key", () => {
  it("sandbox key is absent, allowedTools defaults are correct, permissionMode is bypassPermissions", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(capturedOptions).toBeDefined();
    // D6 / spec "One-shot query behavior is unchanged": no sandbox key on the one-shot path
    expect(Object.prototype.hasOwnProperty.call(capturedOptions, "sandbox")).toBe(false);
    expect(capturedOptions!["allowedTools"]).toEqual(["Read", "Bash", "Grep", "Glob"]);
    expect(capturedOptions!["permissionMode"]).toBe("bypassPermissions");
  });
});

// ---------------------------------------------------------------------------
// TC-FW-07: one-shot options carry no canUseTool guard (regression guard)
// ---------------------------------------------------------------------------

describe("TC-FW-07: one-shot options carry no canUseTool guard", () => {
  it("canUseTool key is absent; sandbox key is absent; permissionMode is bypassPermissions; allowedTools correct", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(capturedOptions).toBeDefined();
    // Regression guard (design D5): the one-shot path must never gain a canUseTool guard
    // or a sandbox — it must remain the lightweight, bypassPermissions one-shot path.
    expect(Object.prototype.hasOwnProperty.call(capturedOptions, "canUseTool")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(capturedOptions, "sandbox")).toBe(false);
    expect(capturedOptions!["permissionMode"]).toBe("bypassPermissions");
    expect(capturedOptions!["allowedTools"]).toEqual(["Read", "Bash", "Grep", "Glob"]);
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-ENV-01: queryOneShot passes env derived from stripSecrets(process.env)
// ---------------------------------------------------------------------------

describe("TC-OSQ-ENV-01: queryOneShot passes stripSecrets(process.env) as env to SDK query", () => {
  it("options.env is defined and equals stripSecrets(process.env)", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!["env"]).toBeDefined();
    expect(capturedOptions!["env"]).toEqual(
      stripSecrets(process.env as Record<string, string | undefined>),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-ENV-02: captured env strips secrets and retains non-secrets
// ---------------------------------------------------------------------------

describe("TC-OSQ-ENV-02: captured env excludes secrets and retains non-secrets", () => {
  // Save and restore GH_TOKEN around each test to avoid cross-test pollution
  const originalGhToken = process.env["GH_TOKEN"];
  afterEach(() => {
    if (originalGhToken === undefined) {
      delete process.env["GH_TOKEN"];
    } else {
      process.env["GH_TOKEN"] = originalGhToken;
    }
  });

  it("GH_TOKEN is absent and PATH is present in the env passed to SDK; envOmissionViolations returns []", async () => {
    process.env["GH_TOKEN"] = "test-secret-token";

    let capturedOptions: Record<string, unknown> | undefined;

    const mockQueryFn: QueryFn = vi.fn().mockImplementation(
      ({ options }: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = options;
        return (async function* () {
          yield { type: "result", subtype: "success", result: "done", session_id: undefined };
        })();
      },
    ) as unknown as QueryFn;

    await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      mockQueryFn,
    );

    const capturedEnv = capturedOptions!["env"] as Record<string, string | undefined> | undefined;

    // Secret must be stripped
    expect(capturedEnv).not.toHaveProperty("GH_TOKEN");

    // Non-secret must be retained (use PATH; if absent in this runtime, set a marker instead)
    if (process.env["PATH"] !== undefined) {
      expect(capturedEnv).toHaveProperty("PATH");
    }

    // The same predicate used in TC-OSQ-ENV-03 must pass (no violations)
    expect(envOmissionViolations(capturedEnv)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-ENV-03: envOmissionViolations detects env-omission and secret leaks
// (design D3 — same predicate as TC-OSQ-ENV-02, so real-behaviour and detection
//  mechanism cannot diverge)
// ---------------------------------------------------------------------------

describe("TC-OSQ-ENV-03: envOmissionViolations detects env-omission and secret leaks", () => {
  it("returns non-empty violations for undefined env (env-omission)", () => {
    const violations = envOmissionViolations(undefined);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("returns 'secret leaked: GH_TOKEN' when GH_TOKEN is present", () => {
    const violations = envOmissionViolations({ GH_TOKEN: "x", PATH: "/bin" });
    expect(violations).toContain("secret leaked: GH_TOKEN");
  });

  it("returns [] for a stripped env with only non-secrets", () => {
    const violations = envOmissionViolations({ PATH: "/bin" });
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-OSQ-05: non-success result → SpecRunnerError("QUERY_ONE_SHOT_FAILED")
// ---------------------------------------------------------------------------
describe("TC-OSQ-05: non-success result throws QUERY_ONE_SHOT_FAILED", () => {
  it("throws SpecRunnerError with QUERY_ONE_SHOT_FAILED for error_during_execution", async () => {
    const mockQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield { type: "result", subtype: "error_during_execution" };
      })();
    }) as unknown as QueryFn;

    await expect(
      queryOneShot(
        { systemPrompt: "sys", prompt: "user" },
        makeConfig(),
        mockQueryFn,
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === "QUERY_ONE_SHOT_FAILED",
    );
  });

  it("throws SpecRunnerError with QUERY_ONE_SHOT_FAILED when no result is emitted", async () => {
    const mockQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        // yield nothing
      })();
    }) as unknown as QueryFn;

    await expect(
      queryOneShot(
        { systemPrompt: "sys", prompt: "user" },
        makeConfig(),
        mockQueryFn,
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError && err.code === "QUERY_ONE_SHOT_FAILED",
    );
  });
});

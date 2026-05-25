/**
 * Unit tests for src/adapter/claude-code/query-one-shot.ts
 *
 * TC-OSQ-01: 正常な query() result を QueryOneShotResult に変換 (text / sessionId / stopReason)
 * TC-OSQ-02: timeout で SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT") を throw
 * TC-OSQ-03: config.steps[stepName].maxTurns が query options に反映される
 * TC-OSQ-04: session_id が QueryOneShotResult.sessionId に伝播する
 * TC-OSQ-05: 非 success result で SpecRunnerError("QUERY_ONE_SHOT_FAILED") を throw
 */
import { describe, it, expect, vi } from "vitest";
import { queryOneShot, type QueryFn } from "../../../../src/adapter/claude-code/query-one-shot.js";
import { SpecRunnerError } from "../../../../src/errors.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

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

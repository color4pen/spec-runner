/**
 * Unit tests for src/adapter/claude-code/supported-models-probe.ts
 *
 * All tests use injected fakes for the SDK loader and token resolver.
 * No real network calls or API tokens required.
 *
 * TC-016: 一覧取得成功時に listed result を返す
 * TC-017: SDK loader throw 時に unavailable を返す（never throw）
 * TC-018: timeout 経路でも session が閉じられる
 * TC-019: 取得成功後に session が閉じられる
 * TC-020: 取得失敗（SDK throw）経路でも session が閉じられる
 * TC-021: token 値が返り値・ログに現れない
 */

import { describe, it, expect, vi } from "vitest";
import {
  createClaudeSupportedModelsProbe,
  type ClaudeSupportedModelsProbeOptions,
} from "../../../src/adapter/claude-code/supported-models-probe.js";
import type { ClaudeAgentSdk, SdkModelInfo, ClaudeSdkQueryResult } from "../../../src/adapter/claude-code/sdk-loader.js";

// ---------------------------------------------------------------------------
// Helpers: fake SDK builder
// ---------------------------------------------------------------------------

/**
 * Build a fake ClaudeSdkQueryResult with an injectable supportedModels() implementation.
 * close() is a spy for tracking session cleanup.
 */
function makeFakeQuery(opts: {
  supportedModels: () => Promise<SdkModelInfo[]>;
  closeSpy?: ReturnType<typeof vi.fn>;
}): ClaudeSdkQueryResult {
  const closeSpy = opts.closeSpy ?? vi.fn();
  // Implement minimal AsyncGenerator interface
  const gen: AsyncGenerator<unknown, void> = {
    [Symbol.asyncIterator]() { return this; },
    async next() { return { value: undefined as unknown, done: true } as IteratorResult<unknown, void>; },
    async return() { return { value: undefined, done: true } as IteratorResult<unknown, void>; },
    async throw() { return { value: undefined as unknown, done: true } as IteratorResult<unknown, void>; },
  };
  return Object.assign(gen, {
    supportedModels: opts.supportedModels,
    close: closeSpy,
  }) as unknown as ClaudeSdkQueryResult;
}

/**
 * Build a fake ClaudeAgentSdk whose query() returns the given fake query.
 */
function makeFakeSdk(fakeQuery: ClaudeSdkQueryResult): ClaudeAgentSdk {
  return {
    query: vi.fn().mockReturnValue(fakeQuery),
    createSdkMcpServer: vi.fn(),
  };
}

/**
 * Build a fake ClaudeAgentSdk whose query() throws the given error.
 */
function makeFakeSdkThrowing(err: unknown): ClaudeAgentSdk {
  return {
    query: vi.fn().mockImplementation(() => { throw err; }),
    createSdkMcpServer: vi.fn(),
  };
}

/** A loader that returns the given SDK. */
function fakeLoader(sdk: ClaudeAgentSdk): ClaudeSupportedModelsProbeOptions["loadSdkFn"] {
  return async () => sdk;
}

/** A loader that throws the given error. */
function fakeLoaderThrowing(err: unknown): ClaudeSupportedModelsProbeOptions["loadSdkFn"] {
  return async () => { throw err; };
}

/** A no-op token resolver returning undefined (no token). */
const noopTokenResolver: ClaudeSupportedModelsProbeOptions["resolveTokenFn"] = async () => undefined;

/** A token resolver returning a specific token. */
function fixedTokenResolver(token: string): ClaudeSupportedModelsProbeOptions["resolveTokenFn"] {
  return async () => ({ token, source: "env" });
}

// ---------------------------------------------------------------------------
// TC-016: 一覧取得成功時に listed result を返す
// ---------------------------------------------------------------------------

describe("TC-016: returns listed result on successful model retrieval", () => {
  it("returns { kind: 'listed', models: [...] } when supportedModels() succeeds", async () => {
    const models: SdkModelInfo[] = [
      { value: "claude-sonnet-5" },
      { value: "claude-opus-5" },
    ];
    const fakeQuery = makeFakeQuery({ supportedModels: async () => models });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("listed");
    if (result.kind === "listed") {
      expect(result.models).toEqual(["claude-sonnet-5", "claude-opus-5"]);
    }
  });

  it("returns empty models array when supportedModels() returns empty list", async () => {
    const fakeQuery = makeFakeQuery({ supportedModels: async () => [] });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("listed");
    if (result.kind === "listed") {
      expect(result.models).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-017: SDK loader throw 時に unavailable を返す（never throw）
// ---------------------------------------------------------------------------

describe("TC-017: returns unavailable when SDK loader throws (never throw)", () => {
  it("SDK loader throws ENOENT → unavailable with non-empty reason", async () => {
    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoaderThrowing(new Error("ENOENT: no such file")),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("probe does not throw even when SDK loader throws", async () => {
    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoaderThrowing(new Error("SDK init failure")),
      resolveTokenFn: noopTokenResolver,
    });

    await expect(probe({})).resolves.toBeDefined();
  });

  it("supportedModels() throws → unavailable with non-empty reason", async () => {
    const fakeQuery = makeFakeQuery({
      supportedModels: async () => { throw new Error("Network error"); },
    });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-019: 取得成功後に session が閉じられる
// ---------------------------------------------------------------------------

describe("TC-019: session is closed after successful retrieval", () => {
  it("close() is called after supportedModels() resolves", async () => {
    const closeSpy = vi.fn();
    const fakeQuery = makeFakeQuery({
      supportedModels: async () => [{ value: "claude-sonnet-5" }],
      closeSpy,
    });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("listed");
    expect(closeSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-020: 取得失敗（SDK throw）経路でも session が閉じられる
// ---------------------------------------------------------------------------

describe("TC-020: session is closed even when SDK throws", () => {
  it("close() is called when supportedModels() throws", async () => {
    const closeSpy = vi.fn();
    const fakeQuery = makeFakeQuery({
      supportedModels: async () => { throw new Error("SDK error"); },
      closeSpy,
    });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noopTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("unavailable");
    expect(closeSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-018: timeout 経路でも session が閉じられる
// ---------------------------------------------------------------------------

describe("TC-018: session is closed on timeout path", () => {
  it("close() is called when timeout fires before supportedModels() resolves", async () => {
    const closeSpy = vi.fn();
    let capturedSignal: AbortSignal | undefined;

    // Build a fake query where supportedModels() listens to the AbortSignal
    // and rejects when the signal fires (simulating real SDK abort behavior).
    const supportedModels = () =>
      new Promise<SdkModelInfo[]>((_, reject) => {
        if (capturedSignal?.aborted) {
          reject(new Error("Aborted by timeout"));
          return;
        }
        capturedSignal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted by timeout")),
          { once: true },
        );
      });

    const fakeQuery = makeFakeQuery({ supportedModels, closeSpy });

    // Custom SDK that captures the AbortController signal from the query options.
    const sdk: ClaudeAgentSdk = {
      query: vi.fn().mockImplementation((params: { options?: { abortController?: AbortController } }) => {
        capturedSignal = params.options?.abortController?.signal;
        return fakeQuery;
      }),
      createSdkMcpServer: vi.fn(),
    };

    // Use a very short timeout to trigger it quickly
    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: async () => sdk,
      resolveTokenFn: noopTokenResolver,
      timeoutMs: 20, // 20ms — fires quickly
    });

    const result = await probe({});
    // Timeout fires → abort signal fires → supportedModels() rejects → unavailable
    expect(result.kind).toBe("unavailable");
    expect(closeSpy).toHaveBeenCalled();
  }, 5000);
});

// ---------------------------------------------------------------------------
// TC-021: token 値が返り値・ログに現れない
// ---------------------------------------------------------------------------

describe("TC-021: token value does not appear in reason string", () => {
  it("reason does not contain the OAuth token value when SDK throws", async () => {
    const secretToken = "my-secret-token-abc123";

    const fakeQuery = makeFakeQuery({
      supportedModels: async () => {
        throw new Error(`Authentication failed with token ${secretToken}`);
      },
    });
    const sdk = makeFakeSdk(fakeQuery);

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: fixedTokenResolver(secretToken),
    });

    const result = await probe({});
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).not.toContain(secretToken);
    }
  });

  it("reason does not contain the token when loader throws with token in message", async () => {
    const secretToken = "my-secret-token-xyz";

    const probe = createClaudeSupportedModelsProbe({
      loadSdkFn: fakeLoaderThrowing(new Error(`Failed with ${secretToken}`)),
      resolveTokenFn: fixedTokenResolver(secretToken),
    });

    const result = await probe({});
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).not.toContain(secretToken);
    }
  });
});

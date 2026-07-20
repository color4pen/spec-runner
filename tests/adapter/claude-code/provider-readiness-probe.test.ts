/**
 * Unit tests for src/adapter/claude-code/provider-readiness-probe.ts
 *
 * All tests use injected fakes for the SDK loader and token resolver.
 * No real network calls or API tokens required.
 *
 * TC-014: Probe timeout is classified as unreachable (not auth failure)
 * TC-015: Token value never appears in probe detail
 * Additional: error classification, ready paths, detail building, edge cases
 */

import { describe, it, expect, vi } from "vitest";
import {
  createClaudeProviderReadinessProbe,
  type ClaudeProviderReadinessProbeOptions,
} from "../../../src/adapter/claude-code/provider-readiness-probe.js";
import type { ClaudeAgentSdk } from "../../../src/adapter/claude-code/sdk-loader.js";
import type { ProviderReadinessResult } from "../../../src/core/port/provider-readiness.js";

/**
 * Narrow helper: extract `detail` from a non-ready result, or undefined for ready.
 * `detail` is only present on the non-ready variant of the discriminated union.
 */
function detailOf(result: ProviderReadinessResult): string | undefined {
  return result.kind !== "ready" ? result.detail : undefined;
}

// ---------------------------------------------------------------------------
// Helpers: fake SDK factory
// ---------------------------------------------------------------------------

/** Build a fake SDK whose query() yields the given messages then returns. */
function makeFakeSdk(messages: Record<string, unknown>[]): ClaudeAgentSdk {
  return {
    query: vi.fn().mockReturnValue(
      (async function* () {
        for (const msg of messages) {
          yield msg;
        }
      })(),
    ),
    createSdkMcpServer: vi.fn(),
  };
}

/** Build a fake SDK whose query() throws the given error. */
function makeFakeSdkThrowing(err: unknown): ClaudeAgentSdk {
  return {
    query: vi.fn().mockReturnValue(
      (async function* () {
        throw err;
      })(),
    ),
    createSdkMcpServer: vi.fn(),
  };
}

/** A loader that returns the given SDK. */
function fakeLoader(sdk: ClaudeAgentSdk): ClaudeProviderReadinessProbeOptions["loadSdkFn"] {
  return async () => sdk;
}

/** A token resolver that always returns undefined (no token found). */
const noTokenResolver: ClaudeProviderReadinessProbeOptions["resolveTokenFn"] =
  async () => undefined;

/** A token resolver that returns the given token. */
function tokenResolver(token: string): ClaudeProviderReadinessProbeOptions["resolveTokenFn"] {
  return async () => ({ token, source: "env" });
}

/** A token resolver that throws (simulates unexpected resolver failure). */
const throwingTokenResolver: ClaudeProviderReadinessProbeOptions["resolveTokenFn"] =
  async () => { throw new Error("resolver-error"); };

// ---------------------------------------------------------------------------
// Ready paths
// ---------------------------------------------------------------------------

describe("probe returns ready on successful SDK interaction", () => {
  it("returns { kind: 'ready' } when SDK yields a 'result' message", async () => {
    const sdk = makeFakeSdk([{ type: "result", content: "ok" }]);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("ready");
  });

  it("returns { kind: 'ready' } when SDK yields a stream_event with message_start", async () => {
    const sdk = makeFakeSdk([
      { type: "stream_event", event: { type: "message_start" } },
    ]);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("ready");
  });

  it("returns { kind: 'ready' } when stream ends without errors (no explicit message match)", async () => {
    const sdk = makeFakeSdk([{ type: "other_event" }]);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("ready");
  });

  it("returns { kind: 'ready' } when stream is empty", async () => {
    const sdk = makeFakeSdk([]);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// TC-014: Timeout classified as unreachable
// ---------------------------------------------------------------------------

/**
 * Build a fake SDK that blocks until the AbortController fires, then throws an
 * AbortError — matching how the real Claude Agent SDK responds to abort signals.
 * This allows the probe's timeout path to be exercised without actually sleeping.
 */
function makeAbortAwareSdk(): ClaudeAgentSdk {
  return {
    query: vi.fn().mockImplementation(
      (params: { options?: { abortController?: AbortController } }) => {
        const signal = params.options?.abortController?.signal;
        return (async function* () {
          // Block until the abort signal fires, then throw AbortError.
          await new Promise<never>((_resolve, reject) => {
            if (signal?.aborted) {
              reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
              return;
            }
            signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })),
            );
          });
        })();
      },
    ),
    createSdkMcpServer: vi.fn(),
  };
}

describe("TC-014: timeout is classified as unreachable (not auth failure)", () => {
  it("probe result is unreachable when timeout fires before SDK responds", async () => {
    // Use a very short timeout (1 ms) and an abort-aware SDK.
    // When abortController fires after 1 ms, the generator throws AbortError.
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(makeAbortAwareSdk()),
      resolveTokenFn: noTokenResolver,
      timeoutMs: 1,
    });

    const result = await probe({});
    expect(result.kind).toBe("unreachable");
  });

  it("timeout detail message mentions 'timed out' but not any auth term", async () => {
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(makeAbortAwareSdk()),
      resolveTokenFn: noTokenResolver,
      timeoutMs: 1,
    });

    const result = await probe({});
    expect(result.kind).toBe("unreachable");
    expect(detailOf(result)).toBeDefined();
    expect(detailOf(result)).toMatch(/timed? ?out/i);
    // Must NOT misclassify as auth failure
    expect(detailOf(result)).not.toMatch(/\bauth\b|\bcredential\b/i);
  });
});

// ---------------------------------------------------------------------------
// Error classification paths
// ---------------------------------------------------------------------------

describe("probe classifies thrown errors into the four non-ready kinds", () => {
  it("ECONNREFUSED → unreachable", async () => {
    const sdk = makeFakeSdkThrowing(new Error("connect ECONNREFUSED 127.0.0.1:443"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("unreachable");
  });

  it("fetch failed → unreachable", async () => {
    const sdk = makeFakeSdkThrowing(new Error("fetch failed: network issue"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("unreachable");
  });

  it("AbortError → unreachable", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    const sdk = makeFakeSdkThrowing(abortErr);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("unreachable");
  });

  it("'not authenticated' without token → auth-missing", async () => {
    const sdk = makeFakeSdkThrowing(new Error("not authenticated"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("auth-missing");
  });

  it("'login required' without token → auth-missing", async () => {
    const sdk = makeFakeSdkThrowing(new Error("login required"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("auth-missing");
  });

  it("'unauthorized' with token → auth-invalid (token was present but rejected)", async () => {
    const sdk = makeFakeSdkThrowing(new Error("401 Unauthorized"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: tokenResolver("sk-ant-fake-token"),
    });
    const result = await probe({});
    expect(result.kind).toBe("auth-invalid");
  });

  it("auth-invalid pattern without token → auth-missing (no credential to reject)", async () => {
    const sdk = makeFakeSdkThrowing(new Error("invalid token provided"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("auth-missing");
  });

  it("auth-missing pattern with token → auth-invalid (credential present but missing from SDK view)", async () => {
    const sdk = makeFakeSdkThrowing(new Error("no credential found"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: tokenResolver("sk-ant-fake-token"),
    });
    const result = await probe({});
    expect(result.kind).toBe("auth-invalid");
  });

  it("unrecognized error → provider-failure", async () => {
    const sdk = makeFakeSdkThrowing(new Error("Internal Server Error (503)"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });
    const result = await probe({});
    expect(result.kind).toBe("provider-failure");
  });
});

// ---------------------------------------------------------------------------
// TC-015: Token value never appears in probe detail
// ---------------------------------------------------------------------------

describe("TC-015: token value never appears in probe detail", () => {
  it("detail does not contain the resolved token value", async () => {
    const SECRET_TOKEN = "sk-ant-secret-token-xyzABC123";
    const sdk = makeFakeSdkThrowing(new Error("401 Unauthorized: bad token"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: tokenResolver(SECRET_TOKEN),
    });

    const result = await probe({});
    expect(detailOf(result)).toBeDefined();
    expect(detailOf(result)).not.toContain(SECRET_TOKEN);
  });

  it("detail is built from the error message, not the env token", async () => {
    const SECRET_TOKEN = "sk-ant-oauth-should-not-appear-EVER";
    const sdk = makeFakeSdkThrowing(new Error("Internal Server Error (502)"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: tokenResolver(SECRET_TOKEN),
    });

    const result = await probe({ CLAUDE_CODE_OAUTH_TOKEN: SECRET_TOKEN });
    expect(detailOf(result)).toBeDefined();
    expect(detailOf(result)).not.toContain(SECRET_TOKEN);
  });

  it("token value embedded in the SDK error message is redacted from detail", async () => {
    // Covers the case where a 401 response echoes the token back in the message body.
    const SECRET_TOKEN = "sk-ant-secret-token-xyzABC123";
    const sdk = makeFakeSdkThrowing(
      new Error(`401 Unauthorized: token ${SECRET_TOKEN} is invalid or expired`),
    );
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: tokenResolver(SECRET_TOKEN),
    });

    const result = await probe({});
    expect(detailOf(result)).toBeDefined();
    expect(detailOf(result)).not.toContain(SECRET_TOKEN);
    expect(detailOf(result)).toContain("[REDACTED]");
  });
});

// ---------------------------------------------------------------------------
// Detail truncation
// ---------------------------------------------------------------------------

describe("probe truncates error detail at 200 characters", () => {
  it("detail is capped at ~200 chars with ellipsis for long errors", async () => {
    const longMessage = "A".repeat(300);
    const sdk = makeFakeSdkThrowing(new Error(longMessage));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(detailOf(result)).toBeDefined();
    // detail should be truncated
    expect(detailOf(result)!.length).toBeLessThan(300);
    expect(detailOf(result)).toContain("…");
  });

  it("detail is not truncated for short errors", async () => {
    const shortMessage = "Internal Server Error";
    const sdk = makeFakeSdkThrowing(new Error(shortMessage));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(detailOf(result)).toBe(shortMessage);
  });
});

// ---------------------------------------------------------------------------
// Token resolver failure handling
// ---------------------------------------------------------------------------

describe("probe handles token resolver failures gracefully", () => {
  it("probe continues (hadToken=false) when token resolver throws", async () => {
    // Resolver throws but probe should not propagate the error
    const sdk = makeFakeSdk([{ type: "result" }]);
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: throwingTokenResolver,
    });

    // Should not throw — resolver failure is swallowed
    const result = await probe({});
    expect(result.kind).toBe("ready");
  });

  it("error is classified as auth-missing (not auth-invalid) when resolver threw and SDK gets auth error", async () => {
    // Resolver throws → hadToken=false → auth pattern → auth-missing
    const sdk = makeFakeSdkThrowing(new Error("not authenticated"));
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: throwingTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("auth-missing");
  });
});

// ---------------------------------------------------------------------------
// Non-Error thrown values
// ---------------------------------------------------------------------------

describe("probe handles non-Error thrown values", () => {
  it("string throw → provider-failure with the string as detail", async () => {
    const sdk = makeFakeSdkThrowing("something went wrong");
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("provider-failure");
    expect(detailOf(result)).toBe("something went wrong");
  });

  it("object throw → provider-failure, detail is String(err)", async () => {
    const sdk = makeFakeSdkThrowing({ code: 503, message: "service unavailable" });
    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: fakeLoader(sdk),
      resolveTokenFn: noTokenResolver,
    });

    const result = await probe({});
    expect(result.kind).toBe("provider-failure");
    expect(detailOf(result)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Token injection into SDK env
// ---------------------------------------------------------------------------

describe("probe injects resolved token into SDK env", () => {
  it("resolved token is injected into sdkEnv passed to sdk.query()", async () => {
    const SECRET_TOKEN = "sk-ant-test-inject-token";
    let capturedEnv: Record<string, unknown> | undefined;

    const capturingSdk: ClaudeAgentSdk = {
      query: vi.fn().mockImplementation((params: { options?: Record<string, unknown> }) => {
        capturedEnv = params.options?.["env"] as Record<string, unknown> | undefined;
        return (async function* () {
          yield { type: "result" };
        })();
      }),
      createSdkMcpServer: vi.fn(),
    };

    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: async () => capturingSdk,
      resolveTokenFn: tokenResolver(SECRET_TOKEN),
    });

    await probe({});
    expect(capturedEnv?.["CLAUDE_CODE_OAUTH_TOKEN"]).toBe(SECRET_TOKEN);
  });

  it("CLAUDE_CODE_OAUTH_TOKEN is NOT in sdkEnv when no token resolved", async () => {
    let capturedEnv: Record<string, unknown> | undefined;

    const capturingSdk: ClaudeAgentSdk = {
      query: vi.fn().mockImplementation((params: { options?: Record<string, unknown> }) => {
        capturedEnv = params.options?.["env"] as Record<string, unknown> | undefined;
        return (async function* () {
          yield { type: "result" };
        })();
      }),
      createSdkMcpServer: vi.fn(),
    };

    const probe = createClaudeProviderReadinessProbe({
      loadSdkFn: async () => capturingSdk,
      resolveTokenFn: noTokenResolver,
    });

    // Even if env has the key, stripSecrets will remove it
    await probe({ CLAUDE_CODE_OAUTH_TOKEN: "env-token" });
    // stripSecrets strips _TOKEN keys — CLAUDE_CODE_OAUTH_TOKEN should NOT be present
    expect(capturedEnv?.["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
  });
});

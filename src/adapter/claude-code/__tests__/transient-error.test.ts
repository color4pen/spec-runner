/**
 * Unit tests for isTransientAgentError() — T-01 acceptance criteria.
 *
 * Covers:
 *   - Whitelist: connection / socket / network / 5xx tokens
 *   - Nested cause traversal
 *   - fail-closed (unknown errors → false)
 *   - 5xx numeric codes require status context (no standalone digit match)
 */
import { describe, it, expect } from "vitest";
import { isTransientAgentError } from "../transient-error.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkError(msg: string): Error {
  return new Error(msg);
}

function mkErrorWithCause(msg: string, cause: unknown): Error {
  const e = new Error(msg);
  (e as Error & { cause?: unknown }).cause = cause;
  return e;
}

// ---------------------------------------------------------------------------
// Connection errors
// ---------------------------------------------------------------------------

describe("connection tokens", () => {
  it("ConnectionRefused is transient (T-01 AC1)", () => {
    expect(isTransientAgentError(mkError("Claude Code SDK query failed: API Error: Unable to connect to API (ConnectionRefused)"))).toBe(true);
  });

  it("ECONNREFUSED is transient", () => {
    expect(isTransientAgentError(mkError("connect ECONNREFUSED 127.0.0.1:8080"))).toBe(true);
  });

  it("ECONNRESET is transient", () => {
    expect(isTransientAgentError(mkError("read ECONNRESET"))).toBe(true);
  });

  it("EPIPE is transient", () => {
    expect(isTransientAgentError(mkError("write EPIPE"))).toBe(true);
  });

  it("ENETUNREACH is transient", () => {
    expect(isTransientAgentError(mkError("connect ENETUNREACH"))).toBe(true);
  });

  it("EHOSTUNREACH is transient", () => {
    expect(isTransientAgentError(mkError("connect EHOSTUNREACH"))).toBe(true);
  });

  it("EAI_AGAIN is transient", () => {
    expect(isTransientAgentError(mkError("getaddrinfo EAI_AGAIN api.anthropic.com"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Socket errors
// ---------------------------------------------------------------------------

describe("socket tokens", () => {
  it("FailedToOpenSocket is transient (T-01 AC2)", () => {
    expect(isTransientAgentError(mkError("API Error: Unable to connect (FailedToOpenSocket)"))).toBe(true);
  });

  it("socket hang up is transient", () => {
    expect(isTransientAgentError(mkError("socket hang up"))).toBe(true);
  });

  it("Unable to connect to API is transient", () => {
    expect(isTransientAgentError(mkError("Unable to connect to API"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Network / fetch errors
// ---------------------------------------------------------------------------

describe("network tokens", () => {
  it("fetch failed is transient", () => {
    expect(isTransientAgentError(mkError("fetch failed"))).toBe(true);
  });

  it("network error is transient", () => {
    expect(isTransientAgentError(mkError("network error"))).toBe(true);
  });

  it("ETIMEDOUT is transient", () => {
    expect(isTransientAgentError(mkError("connect ETIMEDOUT"))).toBe(true);
  });

  it("request timed out is transient", () => {
    expect(isTransientAgentError(mkError("request timed out"))).toBe(true);
  });

  it("socket timeout is transient", () => {
    expect(isTransientAgentError(mkError("socket timeout"))).toBe(true);
  });

  it("stream idle timeout is transient", () => {
    expect(isTransientAgentError(mkError("stream idle timeout"))).toBe(true);
  });

  it("full SDK-wrapped stream idle timeout form is transient", () => {
    expect(isTransientAgentError(mkError("Claude Code returned an error result: API Error: Stream idle timeout - partial response received"))).toBe(true);
  });

  it("Stream Idle Timeout (mixed case) is transient", () => {
    expect(isTransientAgentError(mkError("Stream Idle Timeout"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Named 5xx descriptors
// ---------------------------------------------------------------------------

describe("named 5xx tokens", () => {
  it("Internal Server Error is transient", () => {
    expect(isTransientAgentError(mkError("Internal Server Error"))).toBe(true);
  });

  it("Bad Gateway is transient", () => {
    expect(isTransientAgentError(mkError("502 Bad Gateway"))).toBe(true);
  });

  it("Service Unavailable is transient", () => {
    expect(isTransientAgentError(mkError("503 Service Unavailable"))).toBe(true);
  });

  it("Gateway Timeout is transient", () => {
    expect(isTransientAgentError(mkError("504 Gateway Timeout"))).toBe(true);
  });

  it("Overloaded is transient", () => {
    expect(isTransientAgentError(mkError("API is currently Overloaded"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5xx numeric codes — require status context
// ---------------------------------------------------------------------------

describe("5xx numeric codes with status context", () => {
  it("HTTP 503 is transient", () => {
    expect(isTransientAgentError(mkError("HTTP 503"))).toBe(true);
  });

  it("status 503 is transient", () => {
    expect(isTransientAgentError(mkError("Request failed with status 503"))).toBe(true);
  });

  it("Error 503 is transient", () => {
    expect(isTransientAgentError(mkError("Error 503 occurred"))).toBe(true);
  });

  it("API 503 is transient", () => {
    expect(isTransientAgentError(mkError("API 503 Service Unavailable"))).toBe(true);
  });

  it("code 502 is transient", () => {
    expect(isTransientAgentError(mkError("status code 502"))).toBe(true);
  });

  it("status 500 is transient", () => {
    expect(isTransientAgentError(mkError("HTTP status 500"))).toBe(true);
  });

  it("status 529 is transient", () => {
    expect(isTransientAgentError(mkError("API status 529"))).toBe(true);
  });

  it("status 504 is transient", () => {
    expect(isTransientAgentError(mkError("Error 504 Gateway Timeout"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5xx numeric codes — NO match without status context (AC: no standalone digit)
// ---------------------------------------------------------------------------

describe("5xx numeric codes without status context — no match (T-01 AC5)", () => {
  it("bare '503' alone is not transient", () => {
    expect(isTransientAgentError(mkError("503"))).toBe(false);
  });

  it("'processed 503 items' is not transient", () => {
    expect(isTransientAgentError(mkError("processed 503 items"))).toBe(false);
  });

  it("'port 5030' is not transient (not a 5xx status code)", () => {
    expect(isTransientAgentError(mkError("connect to port 5030"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fail-closed: unknown errors → false (T-01 AC3)
// ---------------------------------------------------------------------------

describe("fail-closed for unknown errors (T-01 AC3)", () => {
  it("'something unexpected happened' is not transient", () => {
    expect(isTransientAgentError(mkError("something unexpected happened"))).toBe(false);
  });

  it("empty message is not transient", () => {
    expect(isTransientAgentError(mkError(""))).toBe(false);
  });

  it("null is not transient", () => {
    expect(isTransientAgentError(null)).toBe(false);
  });

  it("undefined is not transient", () => {
    expect(isTransientAgentError(undefined)).toBe(false);
  });

  it("non-Error object is not transient", () => {
    expect(isTransientAgentError({ code: 42 })).toBe(false);
  });

  it("agent logic error is not transient", () => {
    expect(isTransientAgentError(mkError("Agent did not call report_result"))).toBe(false);
  });

  it("verification failure is not transient", () => {
    expect(isTransientAgentError(mkError("typecheck failed: type errors found"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nested cause traversal (T-01 AC4)
// ---------------------------------------------------------------------------

describe("nested cause traversal (T-01 AC4)", () => {
  it("transient token in direct cause is transient", () => {
    const inner = mkError("ECONNREFUSED 127.0.0.1:80");
    const outer = mkErrorWithCause("Request failed", inner);
    expect(isTransientAgentError(outer)).toBe(true);
  });

  it("transient token in deeply nested cause is transient", () => {
    const deepest = mkError("FailedToOpenSocket");
    const middle = mkErrorWithCause("connection error", deepest);
    const outer = mkErrorWithCause("agent error", middle);
    expect(isTransientAgentError(outer)).toBe(true);
  });

  it("non-transient cause chain is not transient", () => {
    const inner = mkError("unexpected state");
    const outer = mkErrorWithCause("agent error", inner);
    expect(isTransientAgentError(outer)).toBe(false);
  });

  it("cycle in cause chain does not hang (cycle guard)", () => {
    const a = mkError("error a") as Error & { cause?: unknown };
    const b = mkErrorWithCause("error b", a) as Error & { cause?: unknown };
    a.cause = b; // cycle: a → b → a
    // Should return false without infinite loop
    expect(isTransientAgentError(a)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case-insensitive matching
// ---------------------------------------------------------------------------

describe("case-insensitive matching", () => {
  it("connectionrefused (lower) matches", () => {
    expect(isTransientAgentError(mkError("connectionrefused"))).toBe(true);
  });

  it("CONNECTIONREFUSED (upper) matches", () => {
    expect(isTransientAgentError(mkError("CONNECTIONREFUSED"))).toBe(true);
  });

  it("FETCH FAILED (upper) matches", () => {
    expect(isTransientAgentError(mkError("FETCH FAILED"))).toBe(true);
  });
});

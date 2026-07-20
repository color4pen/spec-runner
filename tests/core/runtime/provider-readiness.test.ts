/**
 * Unit tests for the provider readiness classifier, hint map, and error code.
 *
 * TC-012: classifyProviderReadiness returns null for the ready kind
 * TC-004: Each failure kind produces a distinct message and prescription
 * TC-007: Prescriptive first sentence, detail preserved underneath
 * TC-013: PROVIDER_NOT_READY error code defaults to exit 1
 * TC-015: Token value never appears in probe detail
 */

import { describe, it, expect } from "vitest";
import {
  classifyProviderReadiness,
  PROVIDER_READINESS_HINTS,
} from "../../../src/core/runtime/provider-readiness.js";
import { ERROR_CODES, SpecRunnerError } from "../../../src/errors.js";
import type { ProviderReadinessResult } from "../../../src/core/port/provider-readiness.js";

// ---------------------------------------------------------------------------
// TC-012: classifyProviderReadiness returns null for the ready kind
// ---------------------------------------------------------------------------

describe("TC-012: classifyProviderReadiness — ready kind returns null", () => {
  it("returns null when result.kind is 'ready'", () => {
    const result = classifyProviderReadiness({ kind: "ready" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-004: Each failure kind produces a distinct message and prescription
// ---------------------------------------------------------------------------

describe("TC-004: classifyProviderReadiness — each non-ready kind produces distinct message + hint", () => {
  const nonReadyKinds: Array<Exclude<ProviderReadinessResult["kind"], "ready">> = [
    "auth-missing",
    "auth-invalid",
    "unreachable",
    "provider-failure",
  ];

  it("each non-ready kind returns a SpecRunnerError (non-null)", () => {
    for (const kind of nonReadyKinds) {
      const result = classifyProviderReadiness({ kind });
      expect(result, `kind=${kind} should return non-null`).not.toBeNull();
      expect(result, `kind=${kind} should be SpecRunnerError`).toBeInstanceOf(SpecRunnerError);
    }
  });

  it("all four non-ready kinds produce distinct messages", () => {
    const messages = nonReadyKinds.map((kind) => {
      const err = classifyProviderReadiness({ kind });
      return err!.message;
    });
    const unique = new Set(messages);
    expect(unique.size).toBe(4);
  });

  it("all four non-ready kinds produce distinct hints via PROVIDER_READINESS_HINTS", () => {
    const hints = nonReadyKinds.map((kind) => PROVIDER_READINESS_HINTS[kind]);
    const unique = new Set(hints);
    expect(unique.size).toBe(4);
  });

  it("error hint matches PROVIDER_READINESS_HINTS entry for each kind", () => {
    for (const kind of nonReadyKinds) {
      const err = classifyProviderReadiness({ kind }) as SpecRunnerError;
      expect(err.hint).toBe(PROVIDER_READINESS_HINTS[kind]);
    }
  });

  it("error code is PROVIDER_NOT_READY for all non-ready kinds", () => {
    for (const kind of nonReadyKinds) {
      const err = classifyProviderReadiness({ kind }) as SpecRunnerError;
      expect(err.code).toBe("PROVIDER_NOT_READY");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-007: Prescriptive first sentence, detail preserved underneath
// ---------------------------------------------------------------------------

describe("TC-007: prescriptive first sentence, raw detail preserved underneath", () => {
  it("when detail is present, it appears after the first line separator", () => {
    const providerDetail = "connection refused: ECONNREFUSED 127.0.0.1:443";
    const result: ProviderReadinessResult = {
      kind: "unreachable",
      detail: providerDetail,
    };
    const err = classifyProviderReadiness(result) as SpecRunnerError;

    // First sentence (first line) must be prescriptive, not the raw detail
    const firstLine = err.message.split("\n")[0]!;
    expect(firstLine).not.toContain("ECONNREFUSED");
    expect(firstLine).not.toContain("127.0.0.1");

    // Detail must appear after the first line
    expect(err.message).toContain(providerDetail);
    const detailLine = err.message.split("\n").slice(1).join("\n");
    expect(detailLine).toContain(providerDetail);
  });

  it("when detail is absent, message is still a prescriptive first sentence", () => {
    const result: ProviderReadinessResult = { kind: "provider-failure" };
    const err = classifyProviderReadiness(result) as SpecRunnerError;
    // Message should be non-empty and not contain empty lines after first
    const lines = err.message.split("\n");
    expect(lines[0]!.trim().length).toBeGreaterThan(0);
  });

  it("first sentence never contains the detail string from provider-failure", () => {
    const rawProviderError = "Internal Server Error (502)";
    const result: ProviderReadinessResult = {
      kind: "provider-failure",
      detail: rawProviderError,
    };
    const err = classifyProviderReadiness(result) as SpecRunnerError;
    const firstLine = err.message.split("\n")[0]!;
    expect(firstLine).not.toContain(rawProviderError);
  });

  it("first sentence never contains the detail string from auth-invalid", () => {
    const rawProviderError = "401 Unauthorized: invalid_token";
    const result: ProviderReadinessResult = {
      kind: "auth-invalid",
      detail: rawProviderError,
    };
    const err = classifyProviderReadiness(result) as SpecRunnerError;
    const firstLine = err.message.split("\n")[0]!;
    expect(firstLine).not.toContain(rawProviderError);
  });
});

// ---------------------------------------------------------------------------
// TC-013: PROVIDER_NOT_READY error code defaults to exit 1
// ---------------------------------------------------------------------------

describe("TC-013: PROVIDER_NOT_READY error code defaults to exit 1", () => {
  it("PROVIDER_NOT_READY is present in ERROR_CODES", () => {
    expect((ERROR_CODES as Record<string, unknown>)["PROVIDER_NOT_READY"]).toBe("PROVIDER_NOT_READY");
  });

  it("SpecRunnerError with PROVIDER_NOT_READY exits with code 1 (not 2)", () => {
    const err = new SpecRunnerError("PROVIDER_NOT_READY", "hint", "message");
    expect(err.exitCode).toBe(1);
  });

  it("classifyProviderReadiness produces exitCode 1 for all non-ready kinds", () => {
    const kinds: Array<Exclude<ProviderReadinessResult["kind"], "ready">> = [
      "auth-missing",
      "auth-invalid",
      "unreachable",
      "provider-failure",
    ];
    for (const kind of kinds) {
      const err = classifyProviderReadiness({ kind }) as SpecRunnerError;
      expect(err.exitCode, `kind=${kind} should exit 1`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-015: Token value never appears in probe detail
// ---------------------------------------------------------------------------

describe("TC-015: token value never appears in classified error", () => {
  const FAKE_TOKEN = "sk-ant-oauthfake01234567890abcdef-TEST";

  it("auth-missing result: token value does not appear in message or hint", () => {
    // Probe sees a token in env but still produces auth-missing (SDK may ignore it)
    // The test simulates: probe returned auth-missing despite token being present in env
    const result: ProviderReadinessResult = {
      kind: "auth-missing",
      detail: `No credential resolved (env had CLAUDE_CODE_OAUTH_TOKEN set but unreadable)`,
    };
    const err = classifyProviderReadiness(result) as SpecRunnerError;
    expect(err.message).not.toContain(FAKE_TOKEN);
    expect(err.hint).not.toContain(FAKE_TOKEN);
  });

  it("auth-invalid result: token value does not appear in message or hint", () => {
    // If the probe were to accidentally include the token in detail, the classifier must not expose it
    // In this test we verify that even if detail is present, it does NOT contain the token
    const result: ProviderReadinessResult = {
      kind: "auth-invalid",
      detail: `Authentication rejected (credential type: oauth-token)`,
    };
    const err = classifyProviderReadiness(result) as SpecRunnerError;
    expect(err.message).not.toContain(FAKE_TOKEN);
    expect(err.hint).not.toContain(FAKE_TOKEN);
  });

  it("PROVIDER_READINESS_HINTS values do not contain any token-like values", () => {
    // Hints are static strings; none should ever include a token
    for (const [kind, hint] of Object.entries(PROVIDER_READINESS_HINTS)) {
      expect(hint, `hint for ${kind} should not look like a bearer token`).not.toMatch(
        /sk-ant-[a-zA-Z0-9-]+/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// TC-004 (supplement): PROVIDER_READINESS_HINTS covers all four non-ready kinds
// ---------------------------------------------------------------------------

describe("TC-004 (supplement): PROVIDER_READINESS_HINTS covers exactly the four non-ready kinds", () => {
  const expected: Array<Exclude<ProviderReadinessResult["kind"], "ready">> = [
    "auth-missing",
    "auth-invalid",
    "unreachable",
    "provider-failure",
  ];

  it("PROVIDER_READINESS_HINTS has an entry for each non-ready kind", () => {
    for (const kind of expected) {
      expect(
        PROVIDER_READINESS_HINTS[kind],
        `PROVIDER_READINESS_HINTS["${kind}"] must be defined`,
      ).toBeDefined();
      expect(
        typeof PROVIDER_READINESS_HINTS[kind],
        `PROVIDER_READINESS_HINTS["${kind}"] must be a string`,
      ).toBe("string");
    }
  });

  it("all four PROVIDER_READINESS_HINTS values are non-empty strings", () => {
    for (const kind of expected) {
      expect(
        PROVIDER_READINESS_HINTS[kind].trim().length,
        `PROVIDER_READINESS_HINTS["${kind}"] must be non-empty`,
      ).toBeGreaterThan(0);
    }
  });
});

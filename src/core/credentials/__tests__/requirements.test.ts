/**
 * Unit tests for credential requirements matrix.
 *
 * TC-006: local runtime requirements include Claude Code OAuth
 * TC-007: managed runtime requirements are unchanged
 */
import { describe, it, expect } from "vitest";
import { requirementsFor } from "../requirements.js";

describe("requirementsFor — local runtime (TC-006)", () => {
  it("includes github.token", () => {
    const reqs = requirementsFor("local");
    const keys = reqs.map((r) => r.key);
    expect(keys).toContain("github.token");
  });

  it("includes anthropic.claudeCodeOAuthToken with env var CLAUDE_CODE_OAUTH_TOKEN", () => {
    const reqs = requirementsFor("local");
    const claudeReq = reqs.find((r) => r.key === "anthropic.claudeCodeOAuthToken");
    expect(claudeReq).toBeDefined();
    expect(claudeReq?.envVar).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("does NOT include anthropic.apiKey (managed-only credential)", () => {
    const reqs = requirementsFor("local");
    const keys = reqs.map((r) => r.key);
    expect(keys).not.toContain("anthropic.apiKey");
  });
});

describe("requirementsFor — managed runtime (TC-007)", () => {
  it("includes github.token", () => {
    const reqs = requirementsFor("managed");
    const keys = reqs.map((r) => r.key);
    expect(keys).toContain("github.token");
  });

  it("includes anthropic.apiKey", () => {
    const reqs = requirementsFor("managed");
    const keys = reqs.map((r) => r.key);
    expect(keys).toContain("anthropic.apiKey");
  });

  it("does NOT include anthropic.claudeCodeOAuthToken", () => {
    const reqs = requirementsFor("managed");
    const keys = reqs.map((r) => r.key);
    expect(keys).not.toContain("anthropic.claudeCodeOAuthToken");
  });
});

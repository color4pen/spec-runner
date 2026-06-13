/**
 * Unit tests for src/core/credentials/requirements.ts
 *
 * TC-REQ-001: requirementsFor("local") contains github.token and anthropic.claudeCodeOAuthToken
 * TC-REQ-002: requirementsFor("managed") contains github.token and anthropic.apiKey
 * TC-REQ-003: requirementsFor("local") has length 1
 * TC-REQ-004: requirementsFor("managed") has length 2
 */
import { describe, it, expect } from "vitest";
import { requirementsFor } from "../../../src/core/credentials/requirements.js";

// TC-REQ-001
describe("TC-REQ-001: requirementsFor('local') contains local credentials", () => {
  it("includes github.token and Claude Code OAuth token", () => {
    const reqs = requirementsFor("local");
    const githubReq = reqs.find((r) => r.key === "github.token");
    expect(githubReq).toBeDefined();
    expect(githubReq!.envVar).toBe("GH_TOKEN");

    const anthropicReq = reqs.find((r) => r.key === "anthropic.apiKey");
    expect(anthropicReq).toBeUndefined();

    const claudeReq = reqs.find((r) => r.key === "anthropic.claudeCodeOAuthToken");
    expect(claudeReq).toBeDefined();
    expect(claudeReq!.envVar).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  });
});

// TC-REQ-002
describe("TC-REQ-002: requirementsFor('managed') contains github.token and anthropic.apiKey", () => {
  it("includes both github.token and anthropic.apiKey", () => {
    const reqs = requirementsFor("managed");
    const githubReq = reqs.find((r) => r.key === "github.token");
    expect(githubReq).toBeDefined();
    expect(githubReq!.envVar).toBe("GH_TOKEN");

    const anthropicReq = reqs.find((r) => r.key === "anthropic.apiKey");
    expect(anthropicReq).toBeDefined();
    expect(anthropicReq!.envVar).toBe("SPECRUNNER_API_KEY");

    const claudeReq = reqs.find((r) => r.key === "anthropic.claudeCodeOAuthToken");
    expect(claudeReq).toBeUndefined();
  });
});

describe("TC-REQ-003: requirementsFor('local') has exactly 2 requirements", () => {
  it("returns array with length 2", () => {
    const reqs = requirementsFor("local");
    expect(reqs).toHaveLength(2);
  });
});

// TC-REQ-004
describe("TC-REQ-004: requirementsFor('managed') has exactly 2 requirements", () => {
  it("returns array with length 2", () => {
    const reqs = requirementsFor("managed");
    expect(reqs).toHaveLength(2);
  });
});

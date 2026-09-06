/**
 * Unit tests for GitHub integration state contract.
 *
 * TC-010: job start with github.enabled: false → githubIntegration stored in state
 * TC-011: config change after start → job keeps its original contract
 * TC-012: legacy state without githubIntegration → getGitHubIntegration returns enabled: true
 * TC-013: enabled: false + owner present → validateJobState rejects
 * TC-014: enabled: true + owner absent → validateJobState rejects
 * TC-015: requireGitHubRepository on disabled-contract state → GITHUB_INTEGRATION_DISABLED
 */
import { describe, it, expect } from "vitest";
import { validateJobState } from "../../../src/state/schema.js";
import {
  getGitHubIntegration,
  requireGitHubRepository,
} from "../../../src/state/github-integration.js";
import type { JobState } from "../../../src/state/schema.js";
import { SpecRunnerError } from "../../../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "test" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...overrides,
  };
}

function makeDisabledRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeRaw({
    repository: {
      origin: { url: "https://example.com/team/repo", digest: "abc123" },
    },
    githubIntegration: { enabled: false },
    ...overrides,
  });
}

function makeEnabledRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeRaw({
    repository: { owner: "o", name: "r" },
    githubIntegration: { enabled: true },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// TC-010: githubIntegration: { enabled: false } is stored in state
// ---------------------------------------------------------------------------

describe("TC-010: validateJobState — githubIntegration: false is accepted and preserved", () => {
  it("accepts state with githubIntegration: false and origin present", () => {
    const raw = makeDisabledRaw();
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("getGitHubIntegration returns { enabled: false } for disabled state", () => {
    const raw = makeDisabledRaw();
    const state = validateJobState(raw);
    expect(getGitHubIntegration(state)).toEqual({ enabled: false });
  });
});

// ---------------------------------------------------------------------------
// TC-011: contract is fixed at job start (config change after start has no effect)
// ---------------------------------------------------------------------------

describe("TC-011: contract fixed at job start — getGitHubIntegration reads state field", () => {
  it("reads githubIntegration from state, not from current config", () => {
    // Simulate a job started with github.enabled: false
    const raw = makeDisabledRaw();
    const state = validateJobState(raw);
    // Even if config later changed, the state field is authoritative
    expect(getGitHubIntegration(state).enabled).toBe(false);
  });

  it("enabled state retains enabled: true even if we imagine config changed to false", () => {
    const raw = makeEnabledRaw();
    const state = validateJobState(raw);
    expect(getGitHubIntegration(state).enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012: legacy state without githubIntegration → treated as enabled: true
// ---------------------------------------------------------------------------

describe("TC-012: legacy state (no githubIntegration field) → getGitHubIntegration returns enabled: true", () => {
  it("returns { enabled: true } when githubIntegration is absent", () => {
    // Legacy state: no githubIntegration field at all
    const legacyState = { githubIntegration: undefined } as { githubIntegration?: { enabled: boolean } };
    expect(getGitHubIntegration(legacyState)).toEqual({ enabled: true });
  });

  it("validateJobState accepts legacy state without githubIntegration", () => {
    // Legacy state has owner/name but no githubIntegration
    const raw = makeRaw(); // uses owner/name by default
    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    // getGitHubIntegration should return enabled: true (backward compat)
    expect(getGitHubIntegration(state)).toEqual({ enabled: true });
  });
});

// ---------------------------------------------------------------------------
// TC-013: enabled: false + owner present → validateJobState rejects
// ---------------------------------------------------------------------------

describe("TC-013: validateJobState rejects enabled: false with owner present", () => {
  it("throws when githubIntegration.enabled is false but repository.owner is present", () => {
    const raw = makeRaw({
      repository: { owner: "acme", name: "repo", origin: { url: "https://example.com/acme/repo", digest: "abc" } },
      githubIntegration: { enabled: false },
    });
    expect(() => validateJobState(raw)).toThrow(/owner.*absent|absent.*owner/i);
  });

  it("throws when githubIntegration.enabled is false but repository.name is present", () => {
    const raw = makeRaw({
      repository: { name: "repo", origin: { url: "https://example.com/acme/repo", digest: "abc" } },
      githubIntegration: { enabled: false },
    });
    expect(() => validateJobState(raw)).toThrow(/owner.*absent|absent.*owner|name/i);
  });
});

// ---------------------------------------------------------------------------
// TC-014: enabled: true + owner absent → validateJobState rejects
// ---------------------------------------------------------------------------

describe("TC-014: validateJobState rejects enabled: true with owner absent", () => {
  it("throws when githubIntegration.enabled is true but repository.owner is absent", () => {
    const raw = makeRaw({
      repository: { name: "repo" },
      githubIntegration: { enabled: true },
    });
    expect(() => validateJobState(raw)).toThrow(/owner.*non-empty|owner/i);
  });

  it("throws when githubIntegration.enabled is true but repository has no owner/name", () => {
    const raw = makeRaw({
      repository: {},
      githubIntegration: { enabled: true },
    });
    expect(() => validateJobState(raw)).toThrow(/owner/i);
  });
});

// ---------------------------------------------------------------------------
// TC-014b: legacy state (githubIntegration absent) + owner absent → validateJobState rejects
// T-02 AC: enabled: true (and contract absent) + owner absent → validation rejected
// ---------------------------------------------------------------------------

describe("TC-014b: validateJobState rejects legacy state (no githubIntegration) with owner absent", () => {
  it("throws when githubIntegration is absent and repository.owner is missing", () => {
    const raw = makeRaw({
      repository: { name: "repo" },
      // githubIntegration intentionally absent
    });
    // Remove githubIntegration from raw to simulate legacy state with field truly absent
    delete (raw as Record<string, unknown>)["githubIntegration"];
    expect(() => validateJobState(raw)).toThrow(/owner.*non-empty|owner/i);
  });

  it("throws when githubIntegration is absent and repository has no owner or name", () => {
    const raw = makeRaw({ repository: {} });
    delete (raw as Record<string, unknown>)["githubIntegration"];
    expect(() => validateJobState(raw)).toThrow(/owner/i);
  });

  it("accepts legacy state (no githubIntegration) with both owner and name present", () => {
    const raw = makeRaw({ repository: { owner: "acme", name: "repo" } });
    delete (raw as Record<string, unknown>)["githubIntegration"];
    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    expect(getGitHubIntegration(state)).toEqual({ enabled: true });
  });
});

// ---------------------------------------------------------------------------
// TC-015: requireGitHubRepository → GITHUB_INTEGRATION_DISABLED for disabled state
// ---------------------------------------------------------------------------

describe("TC-015: requireGitHubRepository throws GITHUB_INTEGRATION_DISABLED for disabled job", () => {
  it("throws SpecRunnerError with GITHUB_INTEGRATION_DISABLED code", () => {
    const raw = makeDisabledRaw();
    const state = validateJobState(raw);

    let thrown: unknown;
    try {
      requireGitHubRepository(state as JobState);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(SpecRunnerError);
    expect((thrown as SpecRunnerError).code).toBe("GITHUB_INTEGRATION_DISABLED");
  });

  it("succeeds for enabled state with owner and name present", () => {
    const raw = makeEnabledRaw();
    const state = validateJobState(raw);
    const result = requireGitHubRepository(state as JobState);
    expect(result.owner).toBe("o");
    expect(result.name).toBe("r");
  });
});

/**
 * Unit tests for checkPrMerged (src/cli/ps.ts)
 *
 * TC-01: job.pullRequest is null/undefined → null
 * TC-02: githubClient is null → null
 * TC-03: getPullRequest returns { state: "MERGED" } → true
 * TC-04: getPullRequest returns { state: "OPEN" } → false
 * TC-05: getPullRequest throws → null
 */

import { describe, it, expect, vi } from "vitest";
import { checkPrMerged } from "../../../src/cli/ps.js";
import type { JobState } from "../../../src/state/schema.js";
import type { GitHubClient } from "../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "abcd1234efgh5678",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test Request", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/test",
    history: [],
    error: null,
    pullRequest: {
      url: "https://github.com/testowner/testrepo/pull/1",
      number: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function makeMockClient(
  impl: (...args: unknown[]) => unknown,
): GitHubClient {
  return {
    getPullRequest: vi.fn().mockImplementation(impl),
  } as unknown as GitHubClient;
}

// ---------------------------------------------------------------------------
// TC-01: job.pullRequest is undefined → null
// ---------------------------------------------------------------------------

describe("TC-01: job.pullRequest is absent", () => {
  it("returns null when pullRequest is undefined", async () => {
    const job = makeJob({ pullRequest: undefined });
    const mockClient = makeMockClient(() => ({ state: "OPEN" }));
    const result = await checkPrMerged(job, mockClient);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-02: githubClient is null → null
// ---------------------------------------------------------------------------

describe("TC-02: githubClient is null", () => {
  it("returns null when githubClient is null", async () => {
    const job = makeJob();
    const result = await checkPrMerged(job, null);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-03: getPullRequest returns state: "MERGED" → true
// ---------------------------------------------------------------------------

describe("TC-03: getPullRequest returns MERGED", () => {
  it("returns true when PR state is MERGED", async () => {
    const job = makeJob();
    const mockClient = makeMockClient(() =>
      Promise.resolve({ state: "MERGED", mergeStateStatus: "MERGED", headRefName: "", mergeable: "MERGED" }),
    );
    const result = await checkPrMerged(job, mockClient);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-04: getPullRequest returns state: "OPEN" → false
// ---------------------------------------------------------------------------

describe("TC-04: getPullRequest returns OPEN", () => {
  it("returns false when PR state is OPEN", async () => {
    const job = makeJob();
    const mockClient = makeMockClient(() =>
      Promise.resolve({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    );
    const result = await checkPrMerged(job, mockClient);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-05: getPullRequest throws → null
// ---------------------------------------------------------------------------

describe("TC-05: getPullRequest throws", () => {
  it("returns null when getPullRequest throws", async () => {
    const job = makeJob();
    const mockClient = makeMockClient(() => Promise.reject(new Error("API error")));
    const result = await checkPrMerged(job, mockClient);
    expect(result).toBeNull();
  });
});

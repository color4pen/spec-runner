/**
 * Unit tests for GitHubApiClient PR operations — field mapping and merge error handling.
 *
 * TC-401: TypeScript typecheck passes (verified by bun run typecheck in CI)
 * TC-402: All tests pass (verified by bun run test in CI)
 *
 * These tests feed raw REST API response shapes into GitHubApiClient and verify
 * that the adapter boundary correctly transforms them into internal types.
 *
 * TC-FM-001: mergeable_state "clean"   → mergeStateStatus "CLEAN"
 * TC-FM-002: mergeable_state "blocked" → mergeStateStatus "BLOCKED"
 * TC-FM-003: merged:true + merged_at   → state "MERGED"
 * TC-FM-004: state "open", merged_at null → state "OPEN"
 * TC-FM-005: mergeable null            → mergeable "UNKNOWN"
 *
 * TC-PM-001: 200 squash merge → { merged: true }
 * TC-PM-002: 405 merge not allowed → { merged: false }
 * TC-PM-003: 403 permission denied → { merged: false, message includes "permission denied" }
 * TC-PM-006: 409 conflict → { merged: false }
 */
import { describe, it, expect, vi } from "vitest";
import { GitHubApiClient } from "../../../../src/adapter/github/github-client.js";

const OWNER = "testowner";
const REPO = "testrepo";
const PR_NUMBER = 42;

/** Minimal no-op sleep — keeps tests fast. */
const noopSleep = () => Promise.resolve();

/** Build a client with a stub fetch and no-op sleep. */
function buildClient(mockFetch: typeof fetch): GitHubApiClient {
  return new GitHubApiClient(mockFetch, "ghp_test", "https://api.github.com", { sleepFn: noopSleep });
}

/** Build a Response stub for getPullRequest. */
function prResponse(body: Record<string, unknown>): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Build a Response stub for mergePullRequest. */
function mergeResponse(status: number, body: Record<string, unknown> = {}): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// TC-FM: getPullRequest field mapping (REST → internal)
// ---------------------------------------------------------------------------

describe("TC-FM-001..005: getPullRequest REST → internal field mapping", () => {
  it("TC-FM-001: mergeable_state 'clean' maps to mergeStateStatus 'CLEAN'", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "open",
        merged: false,
        merged_at: null,
        mergeable_state: "clean",
        mergeable: true,
        head: { ref: "feat/my-feature" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.mergeStateStatus).toBe("CLEAN");
  });

  it("TC-FM-002: mergeable_state 'blocked' maps to mergeStateStatus 'BLOCKED'", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "open",
        merged: false,
        merged_at: null,
        mergeable_state: "blocked",
        mergeable: true,
        head: { ref: "feat/my-feature" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.mergeStateStatus).toBe("BLOCKED");
  });

  it("TC-FM-003: merged:true + merged_at set maps to state 'MERGED'", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "closed",
        merged: true,
        merged_at: "2024-01-15T10:00:00Z",
        mergeable_state: "clean",
        mergeable: null,
        head: { ref: "feat/my-feature" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.state).toBe("MERGED");
  });

  it("TC-FM-004: state 'open' with merged_at null maps to state 'OPEN'", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "open",
        merged: false,
        merged_at: null,
        mergeable_state: "clean",
        mergeable: true,
        head: { ref: "feat/my-feature" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.state).toBe("OPEN");
  });

  it("TC-FM-005: mergeable null maps to mergeable 'UNKNOWN'", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "open",
        merged: false,
        merged_at: null,
        mergeable_state: "unknown",
        mergeable: null,
        head: { ref: "feat/my-feature" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.mergeable).toBe("UNKNOWN");
  });

  it("all fields mapped correctly in a single merged PR response", async () => {
    // Covers TC-FM-001 + TC-FM-003 + headRefName in one shot
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "closed",
        merged: true,
        merged_at: "2024-06-01T12:00:00Z",
        mergeable_state: "clean",
        mergeable: null,
        head: { ref: "feat/x" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result).toMatchObject({
      state: "MERGED",
      mergeStateStatus: "CLEAN",
      headRefName: "feat/x",
      mergeable: "UNKNOWN",
    });
  });

  it("mergeable_state null produces undefined mergeStateStatus", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      prResponse({
        state: "open",
        merged: false,
        merged_at: null,
        mergeable_state: null,
        mergeable: true,
        head: { ref: "feat/y" },
      }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.getPullRequest(OWNER, REPO, PR_NUMBER);

    expect(result.mergeStateStatus).toBeUndefined();
    expect(result.mergeable).toBe("MERGEABLE");
  });
});

// ---------------------------------------------------------------------------
// TC-PM: mergePullRequest status code handling
// ---------------------------------------------------------------------------

describe("TC-PM: mergePullRequest status code handling", () => {
  it("TC-PM-001: 200 → { merged: true }", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mergeResponse(200, { sha: "abc123", merged: true, message: "Pull request successfully merged" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: true });
    expect(result.message).toContain("merged");
  });

  it("TC-PM-002: 405 → { merged: false } (merge not allowed / not mergeable)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mergeResponse(405, { message: "Pull Request is not mergeable" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("TC-PM-003: 403 → { merged: false } with permission-denied message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mergeResponse(403, { message: "Forbidden" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(result.message.toLowerCase()).toContain("permission denied");
  });

  it("TC-PM-006: 409 → { merged: false } (conflict)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mergeResponse(409, { message: "Merge conflict" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("PUT request targets the correct merge endpoint URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mergeResponse(200, { sha: "abc", merged: true, message: "ok" }),
    );

    const client = buildClient(mockFetch as unknown as typeof fetch);
    await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(
      `https://api.github.com/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/merge`,
    );
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string) as { merge_method: string };
    expect(body.merge_method).toBe("squash");
  });

  // ---------------------------------------------------------------------------
  // TC-PM-010..016: transient retry behaviour
  // ---------------------------------------------------------------------------

  it("TC-PM-010 / TC-201: 405 'Base branch was modified' → retry → 2nd attempt 200 → { merged: true }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: "Base branch was modified. Review and try the merge again." }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "abc", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-011 / TC-202: 405 'unstable state' → retry → 2nd attempt 200 → { merged: true }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: "Repository is in an unstable state. Please wait and try again." }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "def", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-012 / TC-203: 423 Locked → retry → 2nd attempt 200 → { merged: true }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(423))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "ghi", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-013 / TC-204: 405 'Base branch was modified' × 4 → exhausted → { merged: false }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mergeResponse(405, { message: "Base branch was modified. Review and try the merge again." }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(result.message).toContain("Base branch was modified");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("TC-PM-014: 403 permission denied → no retry → { merged: false } (permanent)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mergeResponse(403, { message: "Forbidden" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(result.message.toLowerCase()).toContain("permission denied");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-PM-015: 409 conflict → no retry → { merged: false } (permanent)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mergeResponse(409, { message: "Merge conflict" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-PM-016: 405 'Pull Request is not mergeable' → retry (transient)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: "Pull Request is not mergeable" }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "abc", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-016b: 405 'Pull request is not mergeable' (小文字 r) → retry → 成功", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: "Pull request is not mergeable" }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "abc", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-017: 405 'Head branch was modified' → retry → 2nd attempt 200 → { merged: true }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: "Head branch was modified. Review and try the merge again." }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "def", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-018: 405 'Required status check is expected' → retry → 2nd attempt 200 → { merged: true }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mergeResponse(405, { message: 'Required status check "ci/build" is expected' }))
      .mockResolvedValueOnce(mergeResponse(200, { sha: "ghi", merged: true, message: "Pull request successfully merged" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("TC-PM-019: 405 'Pull Request is not mergeable' × 4 → exhausted → { merged: false }", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mergeResponse(405, { message: "Pull Request is not mergeable" }));

    const client = buildClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result.merged).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// TC-423: 423 Locked message handling
// ---------------------------------------------------------------------------

describe("TC-423: 423 Locked message handling", () => {
  /** Build a client with retry disabled (maxAttempts=1) for single-response assertions. */
  function buildNoRetryClient(mockFetch: typeof fetch): GitHubApiClient {
    return new GitHubApiClient(mockFetch, "ghp_test", "https://api.github.com", { sleepFn: noopSleep, mergeMaxAttempts: 1 });
  }

  it("TC-423-001: 423 + JSON body → message preserved in return value", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mergeResponse(423, { message: "Branch temporarily locked" }));

    const client = buildNoRetryClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: false, message: "Branch temporarily locked" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-423-002: 423 + body parse failure → default message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 423,
      headers: { get: () => null },
      json: () => Promise.reject(new Error("not json")),
      text: () => Promise.resolve("not json"),
    } as unknown as Response);

    const client = buildNoRetryClient(mockFetch as unknown as typeof fetch);
    const result = await client.mergePullRequest(OWNER, REPO, PR_NUMBER, { mergeMethod: "squash" });

    expect(result).toMatchObject({ merged: false, message: "Merge failed: branch locked (status 423)" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

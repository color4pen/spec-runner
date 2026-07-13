/**
 * Unit tests for ManagedRuntime.listWorktreeChanges and commitRoundArtifacts.
 *
 * D3 (round-owned-git-effects): both methods are fail-safe no-ops in managed
 * runtime — parallel custom reviewer support requires a local worktree, which
 * managed runtime does not have.
 */

import { describe, it, expect } from "vitest";
import { ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeManagedRuntime(): ManagedRuntime {
  const mockGithubClient = {} as unknown as GitHubClient;
  const mockSessionClient = {} as unknown as SessionClient;
  const repo: OriginInfo = { owner: "testowner", name: "testrepo" };
  return new ManagedRuntime(
    "/cwd",
    mockSessionClient,
    mockGithubClient,
    repo,
    undefined,
    "fake-token",
  );
}

// ---------------------------------------------------------------------------
// listWorktreeChanges — always returns []
// ---------------------------------------------------------------------------

describe("ManagedRuntime.listWorktreeChanges — always returns []", () => {
  it("returns empty array regardless of cwd", async () => {
    const runtime = makeManagedRuntime();
    const result = await runtime.listWorktreeChanges("/any/path");
    expect(result).toEqual([]);
  });

  it("returns [] for empty string cwd", async () => {
    const runtime = makeManagedRuntime();
    const result = await runtime.listWorktreeChanges("");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// commitRoundArtifacts — always no-op
// ---------------------------------------------------------------------------

describe("ManagedRuntime.commitRoundArtifacts — no-op", () => {
  it("resolves without error when called with valid args", async () => {
    const runtime = makeManagedRuntime();
    await expect(
      runtime.commitRoundArtifacts(
        ["specrunner/changes/x/result.md"],
        "/any/cwd",
        "change/x",
        "custom-reviewers",
        "x",
        undefined,
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves without error when stagePaths is empty", async () => {
    const runtime = makeManagedRuntime();
    await expect(
      runtime.commitRoundArtifacts([], "/cwd", "branch", "coord", "slug", null),
    ).resolves.toBeUndefined();
  });
});

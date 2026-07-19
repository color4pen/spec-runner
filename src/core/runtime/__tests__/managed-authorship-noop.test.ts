/**
 * Unit tests for ManagedRuntime's journal-authorship surface.
 *
 * The authorship boundary (per-node journal commit / verification / restoration)
 * is defined over a local worktree and an in-process journal anchor. Managed
 * runtime has neither, so all three methods are fail-safe no-ops:
 *
 * - commitJournalArtifacts: no local staging to perform
 * - verifyNodeJournalAuthorship: no anchor to compare against → "skip"
 * - restoreJournalToAnchor: no anchor to restore from → false
 *
 * "skip" (not "ok") is the required verdict: managed runtime must report the
 * absence of a baseline rather than assert authorship it cannot establish.
 */

import { describe, it, expect } from "vitest";
import { ManagedRuntime } from "../managed.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";

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

describe("ManagedRuntime.commitJournalArtifacts — no-op without a local worktree", () => {
  it("resolves without throwing", async () => {
    const runtime = makeManagedRuntime();
    await expect(
      runtime.commitJournalArtifacts("/any/path", "change/any-branch", "any-slug", {}),
    ).resolves.toBeUndefined();
  });
});

describe("ManagedRuntime.verifyNodeJournalAuthorship — reports skip, never ok", () => {
  it("returns {kind:'skip'} when a step head is known", async () => {
    const runtime = makeManagedRuntime();
    const result = await runtime.verifyNodeJournalAuthorship({
      headBeforeStep: "abc123",
      cwd: "/any/path",
      slug: "any-slug",
    });
    expect(result).toEqual({ kind: "skip" });
  });

  it("returns {kind:'skip'} when no step head is known", async () => {
    const runtime = makeManagedRuntime();
    const result = await runtime.verifyNodeJournalAuthorship({
      headBeforeStep: null,
      cwd: "/any/path",
      slug: "any-slug",
    });
    expect(result).toEqual({ kind: "skip" });
  });
});

describe("ManagedRuntime.restoreJournalToAnchor — reports no anchor established", () => {
  it("returns false", async () => {
    const runtime = makeManagedRuntime();
    const result = await runtime.restoreJournalToAnchor({
      cwd: "/any/path",
      slug: "any-slug",
    });
    expect(result).toBe(false);
  });
});

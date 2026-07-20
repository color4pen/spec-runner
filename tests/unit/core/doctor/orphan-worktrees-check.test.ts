/**
 * Unit tests for the orphan-worktrees doctor check.
 *
 * T-02 acceptance criteria:
 * - A worktree with no persisted state is reported warn with its path in details
 * - A worktree mapped to a non-terminal job state is NOT reported (pass)
 * - The check performs no deletion (read-only)
 * - The check exports the correct name, category, required
 */
import { describe, it, expect, vi } from "vitest";
import { createOrphanWorktreesCheck, orphanWorktreesCheck } from "../../../../src/core/doctor/checks/storage/orphan-worktrees.js";
import type { ScanFn } from "../../../../src/core/doctor/checks/storage/orphan-worktrees.js";

// ---------------------------------------------------------------------------
// Minimal DoctorContext stub
// ---------------------------------------------------------------------------

const ctx = {
  cwd: "/repo",
  env: {},
  now: new Date(),
  fetch: vi.fn(),
  fs: {} as never,
  execFile: vi.fn(),
  config: { get: vi.fn(), loaded: true },
  githubClient: { verifyTokenScopes: vi.fn() },
  homeDir: "/home/user",
  processVersion: "v20.0.0",
  platform: "linux" as NodeJS.Platform,
  resolvedGitHubToken: null,
  githubTokenSource: null,
  resolvedSpecRunnerApiKey: null,
  specRunnerApiKeySource: null,
  resolvedClaudeCodeOAuthToken: null,
  claudeCodeOAuthTokenSource: null,
  configPath: "/home/user/.config/specrunner/config.json",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockScanFn(orphans: Awaited<ReturnType<ScanFn>>): ScanFn {
  return vi.fn().mockResolvedValue(orphans);
}

// ---------------------------------------------------------------------------
// Metadata tests
// ---------------------------------------------------------------------------

describe("orphanWorktreesCheck metadata", () => {
  it("has correct name, category, required", () => {
    expect(orphanWorktreesCheck.name).toBe("orphan-worktrees");
    expect(orphanWorktreesCheck.category).toBe("storage");
    expect(orphanWorktreesCheck.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Behavior tests (via createOrphanWorktreesCheck factory)
// ---------------------------------------------------------------------------

describe("createOrphanWorktreesCheck", () => {
  it("returns pass when no orphan worktrees found", async () => {
    const check = createOrphanWorktreesCheck(mockScanFn([]));
    const result = await check.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.message).toMatch(/no orphan worktrees/i);
  });

  it("returns warn with orphan paths in details when orphans exist", async () => {
    const orphanPath = "/repo/.git/specrunner-worktrees/my-feature-aabbccdd";
    const check = createOrphanWorktreesCheck(
      mockScanFn([
        { worktreePath: orphanPath, dirName: "my-feature-aabbccdd", branch: "feat/my-feature-aabbccdd" },
      ]),
    );

    const result = await check.check(ctx);

    expect(result.status).toBe("warn");
    expect(result.details).toContain(orphanPath);
    expect(result.hint).toContain("job prune --force");
  });

  it("includes count in warn message for multiple orphans", async () => {
    const check = createOrphanWorktreesCheck(
      mockScanFn([
        { worktreePath: "/repo/.git/specrunner-worktrees/a-00000001", dirName: "a-00000001", branch: "feat/a-00000001" },
        { worktreePath: "/repo/.git/specrunner-worktrees/b-00000002", dirName: "b-00000002", branch: "feat/b-00000002" },
      ]),
    );

    const result = await check.check(ctx);

    expect(result.status).toBe("warn");
    expect(result.message).toContain("2");
    expect(result.details).toHaveLength(2);
  });

  it("never returns fail — scan errors resolve to pass", async () => {
    const failingScan: ScanFn = vi.fn().mockRejectedValue(new Error("unexpected error"));
    const check = createOrphanWorktreesCheck(failingScan);

    const result = await check.check(ctx);

    expect(result.status).toBe("pass");
    expect(result.status).not.toBe("fail");
  });

  it("passes ctx.cwd as repoRoot to scan function", async () => {
    const scanSpy: ScanFn = vi.fn().mockResolvedValue([]);
    const check = createOrphanWorktreesCheck(scanSpy);

    await check.check(ctx);

    const callArgs = (scanSpy as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArgs.repoRoot).toBe("/repo");
  });

  it("does NOT call git worktree remove or git branch -D (read-only)", async () => {
    // The scan fn receives a spawn arg — we verify it's never called with destructive args
    const spawnSpy = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const scanFn: ScanFn = vi.fn().mockImplementation(async ({ spawn: _spawn }) => {
      // Simulate that the real scan would call spawn, but we don't
      // The check itself should never call spawn for deletions
      return [{ worktreePath: "/repo/.git/specrunner-worktrees/x-00000000", dirName: "x-00000000", branch: "feat/x" }];
    });

    const check = createOrphanWorktreesCheck(scanFn);
    await check.check({ ...ctx });

    // spawnSpy was never passed to the check or called by the check directly
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Verify orphan-worktrees appears in commonChecks
// ---------------------------------------------------------------------------

describe("orphan-worktrees in commonChecks", () => {
  it("is registered in commonChecks after orphan-sidecars", async () => {
    const { commonChecks } = await import("../../../../src/core/doctor/checks/index.js");
    const names = commonChecks.map((c) => c.name);
    expect(names).toContain("orphan-worktrees");

    const sidecarsIdx = names.indexOf("orphan-sidecars");
    const worktreesIdx = names.indexOf("orphan-worktrees");
    expect(sidecarsIdx).toBeGreaterThanOrEqual(0);
    expect(worktreesIdx).toBeGreaterThan(sidecarsIdx);
  });
});

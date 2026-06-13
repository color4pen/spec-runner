/**
 * Tests for orphan-sidecars doctor check.
 *
 * P-01: no .specrunner/local/ → pass
 * P-02: sidecar with running job → pass (not orphan)
 * P-03: sidecar with awaiting-archive job → pass (not orphan)
 * W-01: sidecar with missing state.json → warn with sidecar path in details
 * W-02: sidecar with archived job → warn
 * W-03: multiple orphans → warn with count + all paths in rm hint
 * RO-01: check never calls fs.rm or fs.unlink (read-only)
 * WT-01: liveness.json has worktreePath; worktree state.json has running status → not orphan
 */
import { describe, it, expect, vi } from "vitest";
import * as path from "node:path";
import type { DoctorContext, DoctorFs } from "../../types.js";
import { orphanSidecarsCheck } from "./orphan-sidecars.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const LOCAL_BASE = path.join(FAKE_CWD, ".specrunner", "local");

/**
 * Build a minimal DoctorContext for orphan-sidecars tests.
 *
 * `sidecars`: map of slug → state status (or null to simulate ENOENT for state.json)
 * `localExists`: whether .specrunner/local/ exists (default true)
 */
function makeCtx(options: {
  sidecars?: Record<string, string | null>;
  localExists?: boolean;
  livenessWorktreePath?: Record<string, string>; // slug → worktreePath in liveness.json
  worktreeStatuses?: Record<string, string>; // slug → status in worktree state.json
}): DoctorContext {
  const {
    sidecars = {},
    localExists = true,
    livenessWorktreePath = {},
    worktreeStatuses = {},
  } = options;

  const slugs = Object.keys(sidecars);

  const fsMock: DoctorFs & { rm?: unknown; unlink?: unknown } = {
    existsSync: vi.fn((p: string) => {
      if (p === LOCAL_BASE) return localExists;
      return false;
    }),
    readdirSync: vi.fn((_p: string): string[] => slugs),
    stat: vi.fn(async (p: string) => {
      // All sidecar entries are directories
      for (const slug of slugs) {
        if (p === path.join(LOCAL_BASE, slug)) {
          return { mode: 0o755, isDirectory: () => true };
        }
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }),
    access: vi.fn().mockResolvedValue(undefined),
    constants: { W_OK: 2 } as unknown as typeof import("node:fs").constants,
    readFile: vi.fn(async (p: string, _enc: "utf-8"): Promise<string> => {
      // Liveness.json
      for (const [slug, worktreePath] of Object.entries(livenessWorktreePath)) {
        if (p === path.join(LOCAL_BASE, slug, "liveness.json")) {
          return JSON.stringify({ worktreePath, pid: 1234 });
        }
      }
      // Main state.json
      for (const slug of slugs) {
        if (p === path.join(FAKE_CWD, "specrunner", "changes", slug, "state.json")) {
          const status = sidecars[slug];
          if (status === null) {
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
          }
          return JSON.stringify({ status, jobId: `job-${slug}` });
        }
      }
      // Worktree state.json
      for (const [slug, status] of Object.entries(worktreeStatuses)) {
        const worktreePath = livenessWorktreePath[slug];
        if (worktreePath && p === path.join(worktreePath, "specrunner", "changes", slug, "state.json")) {
          return JSON.stringify({ status, jobId: `job-${slug}` });
        }
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }),
    // Intentionally omit rm and unlink — RO-01 verifies they are never called
    rm: vi.fn(),
    unlink: vi.fn(),
  };

  return {
    cwd: FAKE_CWD,
    env: {},
    now: new Date(),
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    fs: fsMock,
    execFile: vi.fn(),
    config: { get: vi.fn(), loaded: true },
    githubClient: { verifyTokenScopes: vi.fn() },
    homeDir: "/home/user",
    processVersion: "v20.0.0",
    platform: "linux",
    resolvedGitHubToken: null,
    githubTokenSource: null,
    resolvedSpecRunnerApiKey: null,
    specRunnerApiKeySource: null,
    resolvedClaudeCodeOAuthToken: null,
    claudeCodeOAuthTokenSource: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("orphan-sidecars doctor check", () => {
  it("P-01: no .specrunner/local/ directory → pass", async () => {
    const ctx = makeCtx({ localExists: false });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  it("P-02: sidecar with running job → pass (not orphan)", async () => {
    const ctx = makeCtx({ sidecars: { "my-job": "running" } });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  it("P-03: sidecar with awaiting-archive job → pass (not orphan)", async () => {
    const ctx = makeCtx({ sidecars: { "my-job": "awaiting-archive" } });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  it("W-01: sidecar with missing state.json → warn with sidecar path in details", async () => {
    const ctx = makeCtx({ sidecars: { "ghost-job": null } });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.details).toBeDefined();
    expect(result.details!.some((p) => p.includes("ghost-job"))).toBe(true);
  });

  it("W-02: sidecar with archived job → warn", async () => {
    const ctx = makeCtx({ sidecars: { "old-job": "archived" } });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.details).toContain(path.join(LOCAL_BASE, "old-job"));
  });

  it("W-03: multiple orphans → warn with count in message and all paths in hint", async () => {
    const ctx = makeCtx({
      sidecars: {
        "job-a": "archived",
        "job-b": null,
        "job-c": "canceled",
      },
    });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/3/);
    expect(result.hint).toContain("job-a");
    expect(result.hint).toContain("job-b");
    expect(result.hint).toContain("job-c");
  });

  it("RO-01: check never calls fs.rm or fs.unlink (read-only)", async () => {
    const ctx = makeCtx({
      sidecars: { "old-job": "archived", "ghost-job": null },
    });
    await orphanSidecarsCheck.check(ctx);

    const fsMock = ctx.fs as DoctorFs & { rm: ReturnType<typeof vi.fn>; unlink: ReturnType<typeof vi.fn> };
    expect(fsMock.rm).not.toHaveBeenCalled();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });

  it("WT-01: worktree state.json has running status → not orphan", async () => {
    const ctx = makeCtx({
      sidecars: { "active-job": null }, // main state.json missing (ENOENT)
      livenessWorktreePath: { "active-job": "/worktrees/active-job-abc123" },
      worktreeStatuses: { "active-job": "running" },
    });
    const result = await orphanSidecarsCheck.check(ctx);
    expect(result.status).toBe("pass");
  });
});

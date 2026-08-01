/**
 * Unit tests for the doctor slug-occupancy check.
 *
 * TC-037: mismatch detected — sidecar points to canceled job, unique non-terminal job exists
 *   (spec.md > Requirement: doctor detects occupancy breaches > Scenario: mismatch detection with unique non-terminal)
 * TC-038: two non-terminal jobs → breach enumerated, no auto-selection (tasks.md > T-07)
 * TC-039: clean repo → check passes with no findings (tasks.md > T-07, should)
 *
 * Source: spec.md, tasks.md > T-07
 */
import { describe, it, expect, vi } from "vitest";
import { createSlugOccupancyCheck } from "../../../../../../src/core/doctor/checks/storage/slug-occupancy.js";
import type { SlugOccupancyScanFn, SlugOccupancyScanResult } from "../../../../../../src/core/doctor/checks/storage/slug-occupancy.js";
import type { DoctorContext } from "../../../../../../src/core/doctor/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): DoctorContext {
  return {
    cwd: "/fake/repo",
    repoRoot: "/fake/repo",
    env: {},
    now: new Date(),
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    fs: {
      existsSync: vi.fn().mockReturnValue(false),
      readdirSync: vi.fn().mockReturnValue([]),
      stat: vi.fn().mockResolvedValue({ mode: 0o755, isDirectory: () => true }),
      access: vi.fn().mockResolvedValue(undefined),
      constants: { W_OK: 2 } as unknown as typeof import("node:fs").constants,
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    },
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
}

function makeOccupant(jobId: string, status: string, updatedAt: string = "2026-01-01T00:00:00.000Z") {
  return { jobId, status, updatedAt, pid: null, worktreePath: null };
}

type SidecarEntry = { slug: string; sidecarJobId: string | null; slugScan: SlugOccupancyScanResult };

/**
 * Build a mock scan function that returns the given per-slug results.
 * slugResults: array of { slug, sidecarJobId, slugScan } where slugScan is what
 * scanSlugOccupancy returns for that slug.
 */
function makeScanFn(slugResults: SidecarEntry[]): SlugOccupancyScanFn {
  return vi.fn().mockImplementation(async (_repoRoot: string, slug: string) => {
    const entry = slugResults.find((e) => e.slug === slug);
    if (!entry) {
      return { slug, nonTerminal: [], terminal: [], unreadable: null, sidecarJobId: null };
    }
    return {
      ...entry.slugScan,
      sidecarJobId: entry.sidecarJobId,
    };
  });
}

// ---------------------------------------------------------------------------
// TC-037: mismatch detected — sidecar points to canceled job, unique non-terminal job exists
// (spec.md Scenario: mismatch detection with unique non-terminal job)
// ---------------------------------------------------------------------------

describe("TC-037: mismatch detected — sidecar points to canceled job, unique non-terminal job exists", () => {
  it("reports a mismatch finding when sidecar points to canceled job and one non-terminal job exists", async () => {
    const scanFn = makeScanFn([{
      slug: "my-change",
      sidecarJobId: "job-B",  // canceled job
      slugScan: {
        slug: "my-change",
        nonTerminal: [makeOccupant("job-A", "awaiting-resume")],
        terminal: [makeOccupant("job-B", "canceled")],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["my-change"]);
    const result = await check.check(makeCtx());

    // Should detect the mismatch (sidecar points to canceled B, but A is non-terminal)
    expect(result.status).not.toBe("pass");
    // Message or details should mention the repair
    const combined = (result.message ?? "") + (result.hint ?? "") + (result.details ?? []).join(" ");
    expect(combined).toMatch(/mismatch|repair|sidecar/i);
  });

  it("check is named 'slug-occupancy' and is in the storage category", () => {
    const check = createSlugOccupancyCheck(vi.fn(), []);
    expect(check.name).toBe("slug-occupancy");
    expect(check.category).toBe("storage");
  });

  it("check is not required", () => {
    const check = createSlugOccupancyCheck(vi.fn(), []);
    expect(check.required).toBe(false);
  });

  it("finding hints at the repair entry", async () => {
    const scanFn = makeScanFn([{
      slug: "my-change",
      sidecarJobId: "job-B",
      slugScan: {
        slug: "my-change",
        nonTerminal: [makeOccupant("job-A", "awaiting-resume")],
        terminal: [makeOccupant("job-B", "canceled")],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["my-change"]);
    const result = await check.check(makeCtx());

    // Hint should point to the doctor repair command
    const combined = (result.hint ?? "") + (result.details ?? []).join(" ");
    expect(combined).toMatch(/doctor repair|doctor/i);
  });
});

// ---------------------------------------------------------------------------
// TC-038: two non-terminal jobs → breach enumerated, no auto-selection
// ---------------------------------------------------------------------------

describe("TC-038: two non-terminal jobs → breach enumerated, no auto-selection", () => {
  it("reports a breach when slug has two non-terminal jobs", async () => {
    const scanFn = makeScanFn([{
      slug: "breach-slug",
      sidecarJobId: "job-A",
      slugScan: {
        slug: "breach-slug",
        nonTerminal: [
          makeOccupant("job-A", "running", "2026-01-01T10:00:00.000Z"),
          makeOccupant("job-B", "awaiting-resume", "2026-01-02T10:00:00.000Z"),
        ],
        terminal: [],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["breach-slug"]);
    const result = await check.check(makeCtx());

    expect(result.status).not.toBe("pass");
  });

  it("breach report enumerates both jobs by jobId and status", async () => {
    const scanFn = makeScanFn([{
      slug: "breach-slug",
      sidecarJobId: null,
      slugScan: {
        slug: "breach-slug",
        nonTerminal: [
          makeOccupant("job-A", "running"),
          makeOccupant("job-B", "awaiting-resume"),
        ],
        terminal: [],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["breach-slug"]);
    const result = await check.check(makeCtx());

    const combined = (result.message ?? "") + (result.details ?? []).join(" ");
    expect(combined).toContain("job-A");
    expect(combined).toContain("job-B");
  });

  it("breach report does NOT auto-select a job", async () => {
    const scanFn = makeScanFn([{
      slug: "breach-slug",
      sidecarJobId: null,
      slugScan: {
        slug: "breach-slug",
        nonTerminal: [
          makeOccupant("job-A", "running"),
          makeOccupant("job-B", "awaiting-resume"),
        ],
        terminal: [],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["breach-slug"]);
    const result = await check.check(makeCtx());

    // Should NOT mention a repair action (only enumerate)
    // The hint for a breach should point to manual cancel, not automatic repair
    const combined = (result.message ?? "") + (result.hint ?? "");
    // Check that it points the user toward manual resolution
    expect(combined).toMatch(/cancel|manual|human/i);
    // Should NOT say "repair" as if it can be auto-fixed
    // (it may mention doctor but not a direct repair action)
  });
});

// ---------------------------------------------------------------------------
// TC-039: clean repo → check passes with no findings (should)
// ---------------------------------------------------------------------------

describe("TC-039: clean repo → check passes with no findings", () => {
  it("returns pass when all slugs have at most one non-terminal job and no mismatch", async () => {
    const scanFn = makeScanFn([{
      slug: "clean-slug",
      sidecarJobId: "job-A",    // sidecar points to the one non-terminal job
      slugScan: {
        slug: "clean-slug",
        nonTerminal: [makeOccupant("job-A", "awaiting-resume")],
        terminal: [makeOccupant("job-B", "archived")],
        unreadable: null,
      },
    }]);

    const check = createSlugOccupancyCheck(scanFn, ["clean-slug"]);
    const result = await check.check(makeCtx());

    expect(result.status).toBe("pass");
  });

  it("returns pass when there are no slugs at all", async () => {
    const check = createSlugOccupancyCheck(vi.fn(), []); // no slugs
    const result = await check.check(makeCtx());

    expect(result.status).toBe("pass");
  });
});

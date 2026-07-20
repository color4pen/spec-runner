/**
 * Unit tests for the refactored orphan-sidecars doctor check.
 *
 * TC-009: Doctor hint points to `job prune` without `rm -rf`
 * TC-010: Human output rounds beyond N orphans with remainder line
 * TC-011: JSON output retains all orphan paths without rounding
 * TC-017: Doctor check delegates to injected scan function (factory override)
 * TC-018: detailsHuman equals full list when orphan count is at or below N
 */
import { describe, it, expect, vi } from "vitest";
import {
  createOrphanSidecarsCheck,
  orphanSidecarsCheck,
  SIDECAR_DETAILS_HUMAN_LIMIT,
} from "../../../../src/core/doctor/checks/storage/orphan-sidecars.js";
import type { ScanSidecarsFn } from "../../../../src/core/sidecar/orphan.js";

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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockScan(orphans: { slug: string; sidecarPath: string }[]): ScanSidecarsFn {
  return vi.fn().mockResolvedValue(orphans);
}

function makeOrphan(slug: string, base = "/repo/.specrunner/local") {
  return { slug, sidecarPath: `${base}/${slug}` };
}

// ---------------------------------------------------------------------------
// Metadata tests
// ---------------------------------------------------------------------------

describe("orphanSidecarsCheck metadata", () => {
  it("has correct name, category, required", () => {
    expect(orphanSidecarsCheck.name).toBe("orphan-sidecars");
    expect(orphanSidecarsCheck.category).toBe("storage");
    expect(orphanSidecarsCheck.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: Doctor check delegates to injected scan function (factory override)
// ---------------------------------------------------------------------------

describe("TC-017: createOrphanSidecarsCheck delegates to injected scan", () => {
  it("calls the injected mock scan function and does not apply its own inline predicate", async () => {
    const mockScan = makeMockScan([makeOrphan("orphan-job")]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    // The injected scan was called
    expect(mockScan).toHaveBeenCalledOnce();
    // The check used the scan result (1 orphan → warn with that path in details)
    expect(result.status).toBe("warn");
    expect(result.details).toContain("/repo/.specrunner/local/orphan-job");
  });

  it("passes { repoRoot: ctx.cwd, fs: ctx.fs } to the injected scan", async () => {
    const mockScan = makeMockScan([]);
    const check = createOrphanSidecarsCheck(mockScan);

    await check.check(ctx);

    const callArg = (mockScan as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.repoRoot).toBe("/repo");
    expect(callArg.fs).toBe(ctx.fs);
  });

  it("returns pass when scan returns empty array (no orphans)", async () => {
    const mockScan = makeMockScan([]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.status).toBe("pass");
  });

  it("result is derived exclusively from mock scan — adding more orphans to mock increases count", async () => {
    const twoOrphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b")];
    const mockScan = makeMockScan(twoOrphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.status).toBe("warn");
    expect(result.message).toContain("2");
    expect(result.details).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// TC-009: Doctor hint points to `job prune` without `rm -rf`
// ---------------------------------------------------------------------------

describe("TC-009: doctor hint points to job prune without rm -rf", () => {
  it("hint references specrunner job prune when orphans are found", async () => {
    const mockScan = makeMockScan([makeOrphan("orphan-job")]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.hint).toContain("specrunner job prune");
  });

  it("hint does NOT contain rm -rf", async () => {
    const mockScan = makeMockScan([makeOrphan("orphan-job")]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.hint).not.toContain("rm -rf");
  });

  it("hint does NOT contain the sidecar path (no path list in hint)", async () => {
    const orphanPath = "/repo/.specrunner/local/orphan-job";
    const mockScan = makeMockScan([{ slug: "orphan-job", sidecarPath: orphanPath }]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.hint).not.toContain(orphanPath);
  });

  it("hint mentions --force flag", async () => {
    const mockScan = makeMockScan([makeOrphan("orphan-job")]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.hint).toContain("--force");
  });
});

// ---------------------------------------------------------------------------
// TC-010: Human output rounds beyond N orphans with remainder line
// ---------------------------------------------------------------------------

describe("TC-010: human output rounds beyond N orphans", () => {
  it("detailsHuman has exactly LIMIT entries + 1 remainder line when orphans > LIMIT", async () => {
    // Generate LIMIT + 3 orphans to test rounding
    const n = SIDECAR_DETAILS_HUMAN_LIMIT;
    const orphans = Array.from({ length: n + 3 }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    // detailsHuman should be present and have exactly N + 1 entries (N paths + remainder line)
    expect(result.detailsHuman).toBeDefined();
    expect(result.detailsHuman!.length).toBe(n + 1);

    // The last entry should be a remainder line
    const lastEntry = result.detailsHuman![n]!;
    expect(lastEntry).toMatch(/…and \d+ more/);
    expect(lastEntry).toContain("3"); // 3 more beyond LIMIT
  });

  it("detailsHuman remainder line shows the correct count of omitted orphans", async () => {
    const n = SIDECAR_DETAILS_HUMAN_LIMIT;
    const extraCount = 5;
    const orphans = Array.from({ length: n + extraCount }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    const lastEntry = result.detailsHuman![n]!;
    expect(lastEntry).toContain(String(extraCount));
  });
});

// ---------------------------------------------------------------------------
// TC-011: JSON output retains all orphan paths without rounding
// ---------------------------------------------------------------------------

describe("TC-011: details contains all orphan paths (full list for --json)", () => {
  it("details has every orphan path even when orphan count exceeds LIMIT", async () => {
    const n = SIDECAR_DETAILS_HUMAN_LIMIT;
    const totalOrphans = n + 5;
    const orphans = Array.from({ length: totalOrphans }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.details).toHaveLength(totalOrphans);
    for (const orphan of orphans) {
      expect(result.details).toContain(orphan.sidecarPath);
    }
  });

  it("details and detailsHuman are independent when count exceeds LIMIT", async () => {
    const n = SIDECAR_DETAILS_HUMAN_LIMIT;
    const orphans = Array.from({ length: n + 2 }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    expect(result.details!.length).toBeGreaterThan(result.detailsHuman!.length);
  });
});

// ---------------------------------------------------------------------------
// TC-018: detailsHuman equals full list when orphan count is at or below N
// ---------------------------------------------------------------------------

describe("TC-018: detailsHuman equals full list when count <= LIMIT", () => {
  it("exactly LIMIT orphans → no remainder line in detailsHuman", async () => {
    const n = SIDECAR_DETAILS_HUMAN_LIMIT;
    const orphans = Array.from({ length: n }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    // At exactly LIMIT, detailsHuman should show all paths (no remainder)
    const detailsHuman = result.detailsHuman ?? result.details ?? [];
    expect(detailsHuman.length).toBe(n);
    // No "…and" remainder line
    expect(detailsHuman.every((d) => !d.startsWith("…"))).toBe(true);
  });

  it("fewer than LIMIT orphans → detailsHuman matches full details", async () => {
    const n = Math.max(1, SIDECAR_DETAILS_HUMAN_LIMIT - 2);
    const orphans = Array.from({ length: n }, (_, i) => makeOrphan(`orphan-${i}`));
    const mockScan = makeMockScan(orphans);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    const detailsHuman = result.detailsHuman ?? result.details ?? [];
    expect(detailsHuman).toEqual(result.details);
  });

  it("single orphan → no rounding", async () => {
    const mockScan = makeMockScan([makeOrphan("single-orphan")]);
    const check = createOrphanSidecarsCheck(mockScan);

    const result = await check.check(ctx);

    const detailsHuman = result.detailsHuman ?? result.details ?? [];
    expect(detailsHuman).toHaveLength(1);
    expect(detailsHuman[0]).toContain("single-orphan");
  });
});

// ---------------------------------------------------------------------------
// SIDECAR_DETAILS_HUMAN_LIMIT is exported
// ---------------------------------------------------------------------------

describe("SIDECAR_DETAILS_HUMAN_LIMIT is exported and meaningful", () => {
  it("is a positive number", () => {
    expect(typeof SIDECAR_DETAILS_HUMAN_LIMIT).toBe("number");
    expect(SIDECAR_DETAILS_HUMAN_LIMIT).toBeGreaterThan(0);
  });
});

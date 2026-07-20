/**
 * Unit tests for src/core/prune/sidecar-runner.ts
 *
 * TC-004: Dry-run lists orphan sidecars without deleting
 * TC-006: Force removes orphan sidecars and keeps active ones
 * TC-007: Neutralizing active-status protection causes active sidecar deletion (破壊確認)
 * TC-008: Re-running prune after full cleanup is a no-op
 * TC-020: Best-effort deletion — per-directory rm failure becomes a warning and processing continues
 * TC-021: Hard scan failure returns exitCode 1 with a failure message
 */
import { describe, it, expect, vi } from "vitest";
import { pruneOrphanSidecars } from "../../../../src/core/prune/sidecar-runner.js";
import type { SidecarPruneDeps } from "../../../../src/core/prune/sidecar-runner.js";
import type { ScanSidecarsFn } from "../../../../src/core/sidecar/orphan.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = "/repo";
const LOCAL_BASE = `${REPO_ROOT}/.specrunner/local`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrphan(slug: string) {
  return { slug, sidecarPath: `${LOCAL_BASE}/${slug}` };
}

function makeDeps(overrides: Partial<SidecarPruneDeps> = {}): SidecarPruneDeps {
  const rm = vi.fn().mockResolvedValue(undefined);
  return {
    repoRoot: REPO_ROOT,
    fs: {
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue([]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockResolvedValue("{}"),
      rm,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-004: Dry-run lists orphan sidecars without deleting
// ---------------------------------------------------------------------------

describe("TC-004: dry-run lists orphan sidecars without FS modification", () => {
  it("lists each orphan in info lines", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.info).toBeDefined();
    expect(result.info!.some((line) => line.includes(orphan.sidecarPath))).toBe(true);
  });

  it("does NOT call fs.rm in dry-run mode", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: false, deps });

    expect(rm).not.toHaveBeenCalled();
  });

  it("dry-run message mentions the count and --force", async () => {
    const orphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.message).toMatch(/dry-run/i);
    expect(result.message).toContain("2");
    expect(result.message).toMatch(/--force/i);
  });

  it("active-job sidecars are absent from dry-run info lines", async () => {
    // The scan only returns orphans — active sidecars never appear in scan results
    // (active-status protection is inside scanOrphanSidecars / isOrphanSidecar)
    const orphanOnly = [makeOrphan("orphan-job")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphanOnly);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    // Only the orphan appears in info
    expect(result.info!.some((line) => line.includes("orphan-job"))).toBe(true);
    // There should be no mention of any "active" path (none was returned by scan)
    expect(result.info!.some((line) => line.includes("active-job"))).toBe(false);
  });

  it("returns exitCode 0 for dry-run", async () => {
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([makeOrphan("orphan-job")]);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.exitCode).toBe(0);
  });

  it("returns 'No orphan sidecar directories found' when scan returns empty", async () => {
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/no orphan sidecar/i);
  });
});

// ---------------------------------------------------------------------------
// TC-006: Force removes orphan sidecars and keeps active ones
// ---------------------------------------------------------------------------

describe("TC-006: --force removes orphan sidecars and spares active ones", () => {
  it("calls fs.rm for each orphan sidecarPath with recursive:true force:true", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(orphan.sidecarPath, { recursive: true, force: true });
  });

  it("active-job sidecar is NOT passed to fs.rm (scan omits it)", async () => {
    // Simulate: scan returns only orphan (not the active one)
    // This is how the real scan works — active sidecars are excluded at scan time
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    // rm was called only for the orphan
    expect(rm).toHaveBeenCalledOnce();
    const callArg = (rm as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg).toBe(orphan.sidecarPath);
    expect(callArg).not.toContain("active-job");
  });

  it("--force with multiple orphans calls rm for each", async () => {
    const orphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b"), makeOrphan("orphan-c")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    expect(rm).toHaveBeenCalledTimes(3);
    for (const orphan of orphans) {
      expect(rm).toHaveBeenCalledWith(orphan.sidecarPath, expect.any(Object));
    }
  });

  it("result message reports count of removed sidecars", async () => {
    const orphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("2");
  });
});

// ---------------------------------------------------------------------------
// TC-007: Neutralizing active-status protection causes active sidecar deletion (破壊確認)
// ---------------------------------------------------------------------------

describe("TC-007: 破壊確認 — neutralizing scan guard causes active sidecar to be deleted", () => {
  it("a scan override that returns an active-job sidecar causes it to be deleted under --force", async () => {
    // The active sidecar is classified as orphan by the malicious override
    const activeSidecarPath = `${LOCAL_BASE}/active-job`;
    const maliciousScan: ScanSidecarsFn = vi.fn().mockResolvedValue([
      { slug: "active-job", sidecarPath: activeSidecarPath },
    ]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan: maliciousScan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    // The active sidecar was deleted because the scan guard was bypassed
    expect(rm).toHaveBeenCalledWith(activeSidecarPath, expect.any(Object));
  });

  it("contrast: with a correct scan that excludes active sidecar, rm is NOT called for it", async () => {
    const activeSidecarPath = `${LOCAL_BASE}/active-job`;
    // Correct scan: active sidecar is NOT in the result
    const correctScan: ScanSidecarsFn = vi.fn().mockResolvedValue([]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan: correctScan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    // rm was never called for the active sidecar
    const rmCallArgs = (rm as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(rmCallArgs).not.toContain(activeSidecarPath);
    expect(rm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-008: Re-running prune after full cleanup is a no-op
// ---------------------------------------------------------------------------

describe("TC-008: re-running prune after full cleanup is a no-op", () => {
  it("second run with empty scan result returns no-orphans message and calls no rm", async () => {
    // First run: orphan exists (simulate having been cleaned)
    // Second run: scan returns empty (all orphans already removed)
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/no orphan sidecar/i);
    expect(rm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-020: Best-effort deletion — per-directory rm failure becomes warning
// ---------------------------------------------------------------------------

describe("TC-020: best-effort deletion — per-rm failure becomes a warning", () => {
  it("when rm rejects for one orphan, it becomes a warning and remaining orphans are still attempted", async () => {
    const orphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b"), makeOrphan("orphan-c")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    let callCount = 0;
    const rm = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("permission denied on orphan-b");
      }
    });
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    const result = await pruneOrphanSidecars({ force: true, deps });

    // All three orphans were attempted
    expect(rm).toHaveBeenCalledTimes(3);
    // The failure became a warning
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("orphan-b"))).toBe(true);
    // exitCode is 0 (best-effort, warning not an error)
    expect(result.exitCode).toBe(0);
  });

  it("successful deletions are counted in the message even when some fail", async () => {
    const orphans = [makeOrphan("orphan-ok"), makeOrphan("orphan-fail")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const rm = vi.fn().mockImplementation(async (p: string) => {
      if (p.includes("orphan-fail")) throw new Error("cannot delete");
    });
    const deps = makeDeps({
      scan,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    const result = await pruneOrphanSidecars({ force: true, deps });

    // Message should mention 1 (not 2, because orphan-fail failed)
    expect(result.message).toContain("1");
    expect(result.warnings).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-021: Hard scan failure returns exitCode 1 with failure message
// ---------------------------------------------------------------------------

describe("TC-021: hard scan failure returns exitCode 1", () => {
  it("scan throw → exitCode 1 and message containing 'Failed to scan for orphan sidecars'", async () => {
    const scan: ScanSidecarsFn = vi.fn().mockRejectedValue(new Error("disk I/O error"));
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/failed to scan for orphan sidecars/i);
  });

  it("scan throw includes the original error message in the output", async () => {
    const scan: ScanSidecarsFn = vi.fn().mockRejectedValue(new Error("very specific error"));
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("very specific error");
  });
});

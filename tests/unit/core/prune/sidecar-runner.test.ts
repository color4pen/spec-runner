/**
 * Unit tests for src/core/prune/sidecar-runner.ts
 *
 * TC-004: Dry-run lists orphan sidecars without deleting
 * TC-006: Force removes orphan sidecars and keeps active ones
 * TC-007: Neutralizing active-status protection causes active sidecar deletion (破壊確認)
 * TC-008: Re-running prune after full cleanup is a no-op
 * TC-020: Best-effort deletion — per-directory rm failure becomes a warning and processing continues
 * TC-021: Hard scan failure returns exitCode 1 with a failure message
 *
 * [prune-force-recheck-before-delete change — TC IDs below are from that change's test-cases.md]
 * TC-001: Active-after-scan sidecar is skipped under --force
 * TC-002: Removing the re-check causes the active sidecar to be deleted (破壊確認)
 * TC-003: Sidecars still orphan at re-check time are deleted
 * TC-004 (recheck): Skip does not fail the command (exit 0, warnings present)
 * TC-005: Dry-run performs no re-check and no deletion
 * TC-006 (recheck): Per-item rm failure is a best-effort warning, not a hard failure (with re-check)
 * TC-007 (recheck): Mixed re-check result — one slug skipped, one deleted
 * TC-008 (recheck): Re-check function that rejects is treated as fail-safe (no deletion)
 * TC-011: Dry-run with an injected re-check — re-check is never invoked
 * TC-013: Runner default is a pass-through when recheck is absent from deps
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

// =============================================================================
// Tests for change: prune-force-recheck-before-delete
//
// These tests target the per-slug re-check inserted immediately before each
// fs.rm in the --force loop.  TC IDs are from that change's test-cases.md.
// =============================================================================

// ---------------------------------------------------------------------------
// TC-001: Active-after-scan sidecar is skipped under --force
// ---------------------------------------------------------------------------

describe("TC-001 [recheck]: active-after-scan sidecar is skipped under --force", () => {
  it("fs.rm is NOT called when recheck returns false for slug-x", async () => {
    const orphan = makeOrphan("slug-x");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any; // slug-x became active after scan
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    await pruneOrphanSidecars({ force: true, deps });

    // Re-check reported slug-x is no longer orphan → rm must NOT be called
    expect(rm).not.toHaveBeenCalled();
  });

  it("a skip notice naming slug-x and the reason appears in warnings", async () => {
    const orphan = makeOrphan("slug-x");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any;
    const deps = makeDeps({ scan, recheck } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.warnings).toBeDefined();
    const warning = result.warnings!.find((w) => w.includes("slug-x"));
    expect(warning).toBeDefined();
    // Warning must name the reason: sidecar became active / no longer orphan
    expect(warning).toMatch(/no longer orphan|became active/i);
  });

  it("exitCode is 0 when sidecar is skipped by re-check", async () => {
    const orphan = makeOrphan("slug-x");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any;
    const deps = makeDeps({ scan, recheck } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 破壊確認 — removing the re-check causes active-turned sidecar to be deleted
// ---------------------------------------------------------------------------

describe("TC-002 [recheck]: 破壊確認 — no re-check means active-after-scan sidecar IS deleted", () => {
  it("without recheck injection, fs.rm IS called for a sidecar that became active after scan", async () => {
    // Same slug-x fixture as TC-001, but NO recheck injected.
    // The runner trusts the scan classification (default pass-through).
    // This demonstrates that the re-check in TC-001 is the load-bearing mechanism:
    // remove that branch and rm IS called.
    const orphan = makeOrphan("slug-x");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      scan,
      // No recheck: runner trusts scan classification
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    await pruneOrphanSidecars({ force: true, deps });

    // Without the re-check returning false, rm IS called.
    // If the re-check skip branch were present but TC-001's recheck returned false,
    // rm would NOT be called. This contrast proves the re-check is load-bearing.
    expect(rm).toHaveBeenCalledWith(orphan.sidecarPath, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// TC-003: Sidecars still orphan at re-check time are deleted
// ---------------------------------------------------------------------------

describe("TC-003 [recheck]: sidecars still orphan at re-check time are deleted as before", () => {
  it("both sidecars are deleted when recheck confirms they are still orphans", async () => {
    const orphans = [makeOrphan("orphan-a"), makeOrphan("orphan-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const rm = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(true) as any; // both still orphans
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(rm).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenCalledWith(orphans[0]!.sidecarPath, { recursive: true, force: true });
    expect(rm).toHaveBeenCalledWith(orphans[1]!.sidecarPath, { recursive: true, force: true });
    expect(result.message).toMatch(/removed 2 orphan sidecar/i);
  });
});

// ---------------------------------------------------------------------------
// TC-004 (recheck): Skip does not fail the command — exit 0, warnings present
// ---------------------------------------------------------------------------

describe("TC-004 [recheck]: skip does not fail the command — exit 0 with warnings", () => {
  it("exitCode is 0 when every scanned sidecar is skipped by re-check", async () => {
    const orphans = [makeOrphan("slug-a"), makeOrphan("slug-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any; // all became active
    const deps = makeDeps({ scan, recheck } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.exitCode).toBe(0);
  });

  it("skips appear as warnings when every sidecar is spared by re-check", async () => {
    const orphans = [makeOrphan("slug-a"), makeOrphan("slug-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any;
    const deps = makeDeps({ scan, recheck } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("slug-a"))).toBe(true);
    expect(result.warnings!.some((w) => w.includes("slug-b"))).toBe(true);
  });

  it("fs.rm is not called when all sidecars are skipped by re-check", async () => {
    const orphans = [makeOrphan("slug-a"), makeOrphan("slug-b")];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    const rm = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(false) as any;
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    await pruneOrphanSidecars({ force: true, deps });

    expect(rm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-005: Dry-run performs no re-check and no deletion
// ---------------------------------------------------------------------------

describe("TC-005 [recheck]: dry-run performs no re-check and no deletion", () => {
  it("orphans are listed as 'Would remove:' info lines in dry-run", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: false, deps });

    expect(result.info).toBeDefined();
    expect(
      result.info!.some(
        (line) => line.includes("Would remove:") && line.includes(orphan.sidecarPath),
      ),
    ).toBe(true);
  });

  it("neither re-check nor fs.rm is invoked in dry-run even when recheck is injected", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheckSpy = vi.fn().mockResolvedValue(true) as any;
    const deps = makeDeps({
      scan,
      recheck: recheckSpy,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    await pruneOrphanSidecars({ force: false, deps });

    expect(recheckSpy).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-006 (recheck): Per-item rm failure is a best-effort warning (with re-check confirming orphan)
// ---------------------------------------------------------------------------

describe("TC-006 [recheck]: per-item rm failure is a best-effort warning when re-check passes", () => {
  it("all three deletions are attempted, rm failure for the second becomes a warning, exitCode 0", async () => {
    const orphans = [
      makeOrphan("orphan-first"),
      makeOrphan("orphan-second"),
      makeOrphan("orphan-third"),
    ];
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue(orphans);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = vi.fn().mockResolvedValue(true) as any; // all still orphans at re-check time
    let callCount = 0;
    const rm = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("permission denied on orphan-second");
      }
    });
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: true, deps });

    // All three orphans were attempted (re-check passed for all)
    expect(rm).toHaveBeenCalledTimes(3);
    // The rm failure for the second became a warning
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("orphan-second"))).toBe(true);
    // exitCode stays 0 (best-effort)
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007 (recheck): Mixed re-check result — one slug skipped, one deleted
// ---------------------------------------------------------------------------

describe("TC-007 [recheck]: mixed re-check result — one slug skipped, one deleted", () => {
  it("rm called only for orphan-keep, warning names orphan-gone, message 'Removed 1', exitCode 0", async () => {
    // GIVEN the scan returns two orphan sidecars: orphan-keep and orphan-gone
    const orphanKeep = makeOrphan("orphan-keep");
    const orphanGone = makeOrphan("orphan-gone");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphanKeep, orphanGone]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // AND the injected recheck returns true for orphan-keep and false for orphan-gone
    const recheck = vi.fn().mockImplementation(
      async (_deps: unknown, slug: string) => slug === "orphan-keep",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    // WHEN pruneOrphanSidecars runs with force: true
    const result = await pruneOrphanSidecars({ force: true, deps });

    // THEN fs.rm is called only for orphan-keep's sidecar path
    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(orphanKeep.sidecarPath, { recursive: true, force: true });
    expect(rm).not.toHaveBeenCalledWith(orphanGone.sidecarPath, expect.anything());
    // AND the result message is "Removed 1 orphan sidecar(s)"
    expect(result.message).toMatch(/removed 1 orphan sidecar/i);
    // AND a warning names orphan-gone
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("orphan-gone"))).toBe(true);
    // AND exitCode is 0
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008 (recheck): Re-check function that rejects is treated as fail-safe (no deletion)
// ---------------------------------------------------------------------------

describe("TC-008 [recheck]: re-check that rejects is treated as fail-safe — no deletion", () => {
  it("fs.rm NOT called when recheck throws, warning references slug and re-check failure, exitCode 0", async () => {
    // GIVEN the scan returns one orphan sidecar
    const orphan = makeOrphan("fragile-slug");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // AND the injected recheck throws an error when called for that slug
    const recheck = vi.fn().mockRejectedValue(
      new Error("re-check network error"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    const deps = makeDeps({
      scan,
      recheck,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    // WHEN pruneOrphanSidecars runs with force: true
    const result = await pruneOrphanSidecars({ force: true, deps });

    // THEN fs.rm is NOT called for that sidecar's path (fail-safe: skip on uncertainty)
    expect(rm).not.toHaveBeenCalled();
    // AND a warning referencing the slug and the re-check failure appears in the output
    expect(result.warnings).toBeDefined();
    const warning = result.warnings!.find((w) => w.includes("fragile-slug"));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/re-check failed|re-check/i);
    // AND exitCode is 0
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-011: Dry-run with an injected re-check — re-check is never invoked
// ---------------------------------------------------------------------------

describe("TC-011 [recheck]: dry-run with injected re-check — re-check is never invoked", () => {
  it("injected recheck spy is never called under force: false", async () => {
    // GIVEN pruneOrphanSidecars is called with force: false
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // AND a spy recheck is injected into deps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheckSpy = vi.fn().mockResolvedValue(true) as any;
    const deps = makeDeps({
      scan,
      recheck: recheckSpy,
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    } as unknown as Partial<SidecarPruneDeps>);

    // WHEN the function runs
    await pruneOrphanSidecars({ force: false, deps });

    // THEN the injected recheck spy is never called
    expect(recheckSpy).not.toHaveBeenCalled();
    // AND fs.rm is never called
    expect(rm).not.toHaveBeenCalled();
  });

  it("orphan paths appear as 'Would remove:' info lines in dry-run with re-check injected", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheckSpy = vi.fn().mockResolvedValue(true) as any;
    const deps = makeDeps({ scan, recheck: recheckSpy } as unknown as Partial<SidecarPruneDeps>);

    const result = await pruneOrphanSidecars({ force: false, deps });

    // AND orphan paths are listed as "Would remove: …" info lines
    expect(result.info).toBeDefined();
    expect(result.info!.some((line) => line.includes("Would remove:"))).toBe(true);
    expect(recheckSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-013: Runner default is a pass-through when recheck is absent from deps
// ---------------------------------------------------------------------------

describe("TC-013 [recheck]: runner default is a pass-through when recheck is absent from deps", () => {
  it("deletion proceeds as before (trusts scan) when recheck is not provided", async () => {
    // GIVEN pruneOrphanSidecars is called with force: true
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const rm = vi.fn().mockResolvedValue(undefined);
    // AND the recheck field is NOT provided in deps
    const deps = makeDeps({
      scan,
      // No recheck — runner should use default pass-through (async () => true)
      fs: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        rm,
      },
    });

    // WHEN the function runs against a scan result with one orphan sidecar
    await pruneOrphanSidecars({ force: true, deps });

    // THEN deletion proceeds as before (trusts the scan, calls fs.rm)
    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(orphan.sidecarPath, { recursive: true, force: true });
  });

  it("no re-check skip warning is emitted when recheck is absent", async () => {
    const orphan = makeOrphan("orphan-job");
    const scan: ScanSidecarsFn = vi.fn().mockResolvedValue([orphan]);
    const deps = makeDeps({ scan });

    const result = await pruneOrphanSidecars({ force: true, deps });

    // The default trust-scan means no skip warnings about re-check
    const recheckSkipWarnings = (result.warnings ?? []).filter(
      (w) =>
        w.includes("no longer orphan") ||
        w.includes("became active") ||
        w.includes("re-check failed"),
    );
    expect(recheckSkipWarnings).toHaveLength(0);
  });
});

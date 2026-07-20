/**
 * Unit tests for src/core/sidecar/orphan.ts — the shared sidecar-orphan detection module.
 *
 * TC-001: Single detection function backs both consumers
 * TC-002: Archived / canceled / missing state is an orphan
 * TC-003: Active status is not an orphan
 * TC-007: Neutralizing active-status protection causes active sidecar deletion (predicate level)
 * TC-014: scanOrphanSidecars returns empty array when base dir is absent
 * TC-015: Non-directory entries under .specrunner/local/ are stat-filtered
 * TC-016: Scan results are sorted deterministically by slug
 */
import { describe, it, expect, vi } from "vitest";
import {
  isOrphanSidecar,
  scanOrphanSidecars,
  ACTIVE_STATUSES,
} from "../../../../src/core/sidecar/orphan.js";
import type { SidecarScanFs, ScanSidecarDeps } from "../../../../src/core/sidecar/orphan.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = "/repo";
const LOCAL_BASE = `${REPO_ROOT}/.specrunner/local`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFs(overrides: Partial<SidecarScanFs> = {}): SidecarScanFs {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    readFile: vi.fn().mockResolvedValue("{}"),
    ...overrides,
  };
}

function makeDeps(fs: SidecarScanFs): ScanSidecarDeps {
  return { repoRoot: REPO_ROOT, fs };
}

/**
 * Build a readFile mock that returns file content by path.
 * null → throw ENOENT; undefined → throw ENOENT (not in map).
 */
function makeReadFile(fileMap: Record<string, string | null>): SidecarScanFs["readFile"] {
  return vi.fn().mockImplementation(async (p: string) => {
    if (p in fileMap) {
      const content = fileMap[p];
      if (content === null) {
        const err = Object.assign(new Error(`ENOENT: no such file: ${p}`), { code: "ENOENT" });
        throw err;
      }
      return content;
    }
    const err = Object.assign(new Error(`ENOENT: no such file: ${p}`), { code: "ENOENT" });
    throw err;
  });
}

// ---------------------------------------------------------------------------
// TC-001: Single detection function backs both consumers
// ---------------------------------------------------------------------------

describe("TC-001: shared detection module exports", () => {
  it("exports scanOrphanSidecars as the single shared detection function", () => {
    // Both consumers (doctor check + prune runner) must import this function.
    // TC-017 and TC-004/TC-006 respectively verify each consumer delegates to it.
    expect(typeof scanOrphanSidecars).toBe("function");
  });

  it("exports isOrphanSidecar for unit-level testing of the predicate", () => {
    expect(typeof isOrphanSidecar).toBe("function");
  });

  it("exports ACTIVE_STATUSES so consumers can share the canonical active-status set", () => {
    expect(ACTIVE_STATUSES).toBeInstanceOf(Set);
  });
});

// ---------------------------------------------------------------------------
// TC-002: Archived / canceled / missing state is an orphan
// ---------------------------------------------------------------------------

describe("TC-002: archived / canceled / missing state is an orphan", () => {
  it("archived status → orphan", async () => {
    const sidecarDir = `${LOCAL_BASE}/my-slug`;
    const statePath = `${REPO_ROOT}/specrunner/changes/my-slug/state.json`;
    const fs = makeFs({
      readFile: makeReadFile({
        [`${sidecarDir}/liveness.json`]: null,
        [statePath]: JSON.stringify({ status: "archived" }),
      }),
    });
    const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
    expect(result).toBe(true);
  });

  it("canceled status → orphan", async () => {
    const sidecarDir = `${LOCAL_BASE}/my-slug`;
    const statePath = `${REPO_ROOT}/specrunner/changes/my-slug/state.json`;
    const fs = makeFs({
      readFile: makeReadFile({
        [`${sidecarDir}/liveness.json`]: null,
        [statePath]: JSON.stringify({ status: "canceled" }),
      }),
    });
    const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
    expect(result).toBe(true);
  });

  it("missing state.json in main checkout and no worktreePath → orphan", async () => {
    const sidecarDir = `${LOCAL_BASE}/my-slug`;
    const fs = makeFs({
      readFile: makeReadFile({
        // No liveness.json and no state.json → all ENOENT
        [`${sidecarDir}/liveness.json`]: null,
      }),
    });
    const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
    expect(result).toBe(true);
  });

  it("missing state.json in main checkout and worktree state also absent → orphan", async () => {
    const sidecarDir = `${LOCAL_BASE}/my-slug`;
    const worktreePath = "/repo/.git/specrunner-worktrees/my-slug-aabb1234";
    const fs = makeFs({
      readFile: makeReadFile({
        [`${sidecarDir}/liveness.json`]: JSON.stringify({ worktreePath }),
        // Main state: ENOENT (not in map)
        // Worktree state: ENOENT (not in map)
      }),
    });
    const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: Active status is not an orphan
// ---------------------------------------------------------------------------

describe("TC-003: active status is not an orphan", () => {
  const activeStatuses = ["running", "awaiting-resume", "awaiting-archive", "failed", "terminated"];

  for (const status of activeStatuses) {
    it(`${status} → not orphan`, async () => {
      const sidecarDir = `${LOCAL_BASE}/my-slug`;
      const statePath = `${REPO_ROOT}/specrunner/changes/my-slug/state.json`;
      const fs = makeFs({
        readFile: makeReadFile({
          [`${sidecarDir}/liveness.json`]: null,
          [statePath]: JSON.stringify({ status }),
        }),
      });
      const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
      expect(result).toBe(false);
    });
  }

  it("active status in worktree state.json (main ENOENT) → not orphan", async () => {
    const sidecarDir = `${LOCAL_BASE}/my-slug`;
    const worktreePath = "/repo/.git/specrunner-worktrees/my-slug-aabb1234";
    const worktreeStatePath = `${worktreePath}/specrunner/changes/my-slug/state.json`;
    const fs = makeFs({
      readFile: makeReadFile({
        [`${sidecarDir}/liveness.json`]: JSON.stringify({ worktreePath }),
        // Main state: ENOENT (not in map)
        [worktreeStatePath]: JSON.stringify({ status: "running" }),
      }),
    });
    const result = await isOrphanSidecar(makeDeps(fs), "my-slug", sidecarDir);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-007: Neutralizing active-status protection — predicate precondition
// ---------------------------------------------------------------------------

describe("TC-007 precondition: ACTIVE_STATUSES is the guard for active sidecars", () => {
  it("ACTIVE_STATUSES contains all five protective statuses", () => {
    // These are the statuses that protect sidecars from being classified as orphans.
    // The 破壊確認 proper (scan-override causing active sidecar deletion) is in
    // sidecar-runner.test.ts TC-007.
    for (const status of ["running", "awaiting-resume", "awaiting-archive", "failed", "terminated"]) {
      expect(ACTIVE_STATUSES.has(status)).toBe(true);
    }
  });

  it("ACTIVE_STATUSES does NOT include archived or canceled (those are orphans)", () => {
    expect(ACTIVE_STATUSES.has("archived")).toBe(false);
    expect(ACTIVE_STATUSES.has("canceled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-014: scanOrphanSidecars returns [] when base dir absent
// ---------------------------------------------------------------------------

describe("TC-014: scanOrphanSidecars returns [] when base dir absent", () => {
  it("returns [] when existsSync reports base dir does not exist", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(false),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toEqual([]);
  });

  it("returns [] without throwing when readdirSync throws", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      }),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toEqual([]);
  });

  it("returns [] when directory is empty", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue([]),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-015: Non-directory entries are stat-filtered
// ---------------------------------------------------------------------------

describe("TC-015: non-directory entries under .specrunner/local/ are stat-filtered", () => {
  it("skips file entries (isDirectory → false)", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue(["stray-file.txt"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toEqual([]);
  });

  it("skips entries where stat throws", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue(["broken-entry"]),
      stat: vi.fn().mockRejectedValue(new Error("stat failed")),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toEqual([]);
  });

  it("processes directory entries but skips file entries in a mixed list", async () => {
    const slugs = ["orphan-job", "stray-file.txt"];
    const dirResult = { isDirectory: () => true };
    const fileResult = { isDirectory: () => false };
    const statMock = vi.fn().mockImplementation(async (p: string) => {
      if (p.endsWith("orphan-job")) return dirResult;
      return fileResult;
    });
    const orphanStatePath = `${REPO_ROOT}/specrunner/changes/orphan-job/state.json`;
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue(slugs),
      stat: statMock,
      readFile: makeReadFile({
        [`${LOCAL_BASE}/orphan-job/liveness.json`]: null,
        [orphanStatePath]: JSON.stringify({ status: "archived" }),
      }),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    // Only orphan-job (a directory) should be returned
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe("orphan-job");
  });
});

// ---------------------------------------------------------------------------
// TC-016: Scan results are sorted deterministically by slug
// ---------------------------------------------------------------------------

describe("TC-016: scan results are sorted alphabetically by slug", () => {
  it("returns orphans in alphabetical order regardless of readdir order", async () => {
    const slugs = ["zebra-slug", "alpha-slug", "middle-slug"];
    const fileMap: Record<string, string | null> = {};
    for (const slug of slugs) {
      fileMap[`${LOCAL_BASE}/${slug}/liveness.json`] = null;
      fileMap[`${REPO_ROOT}/specrunner/changes/${slug}/state.json`] = JSON.stringify({ status: "archived" });
    }
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue(slugs), // intentionally unsorted
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: makeReadFile(fileMap),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result.map((o) => o.slug)).toEqual(["alpha-slug", "middle-slug", "zebra-slug"]);
  });

  it("OrphanSidecar entries include both slug and sidecarPath", async () => {
    const slug = "my-orphan";
    const fileMap: Record<string, string | null> = {
      [`${LOCAL_BASE}/${slug}/liveness.json`]: null,
      [`${REPO_ROOT}/specrunner/changes/${slug}/state.json`]: JSON.stringify({ status: "archived" }),
    };
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue([slug]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: makeReadFile(fileMap),
    });
    const result = await scanOrphanSidecars(makeDeps(fs));
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe(slug);
    expect(result[0]!.sidecarPath).toBe(`${LOCAL_BASE}/${slug}`);
  });
});

/**
 * Tests for JobStateStore.listWithSourceDirs().
 *
 * TC-SRC-01: active slug → sourceChangeDir matches specrunner/changes/<slug>
 * TC-SRC-02: archive slug → sourceChangeDir matches specrunner/changes/archive/<date>-<slug>
 * TC-SRC-03: same jobId in both active and archive → newer updatedAt wins, correct sourceChangeDir
 */

import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { JobStateStore } from "../job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalStateJson(opts: {
  jobId: string;
  slug: string;
  updatedAt?: string;
  status?: string;
}): string {
  const { jobId, slug, updatedAt = "2026-01-01T10:00:00.000Z", status = "archived" } = opts;
  return JSON.stringify({
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    request: {
      path: `/repo/specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status,
    branch: `fix/${slug}`,
    history: [],
    error: null,
    pipelineId: "standard-v1",
    steps: {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobStateStore.listWithSourceDirs", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  // TC-SRC-01
  it("TC-SRC-01: active slug entry has sourceChangeDir = specrunner/changes/<slug>", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-src-dirs-01-"));

    const slug = "my-feature";
    const jobId = "aaaaaaaa-0000-0000-0000-000000000001";
    const activeDir = path.join(tmpDir, "specrunner", "changes", slug);
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(
      path.join(activeDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, status: "awaiting-archive" }),
    );

    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: false });

    const entry = entries.find((e) => e.state.jobId === jobId);
    expect(entry).toBeDefined();
    expect(entry!.sourceChangeDir).toBe(path.join(tmpDir, "specrunner", "changes", slug));
  });

  // TC-SRC-02
  it("TC-SRC-02: archive slug entry has sourceChangeDir = specrunner/changes/archive/<date>-<slug>", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-src-dirs-02-"));

    const slug = "old-feature";
    const datedSlug = "2026-01-15-old-feature";
    const jobId = "bbbbbbbb-0000-0000-0000-000000000002";
    const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive", datedSlug);
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(
      path.join(archiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, status: "archived" }),
    );

    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: true });

    const entry = entries.find((e) => e.state.jobId === jobId);
    expect(entry).toBeDefined();
    expect(entry!.sourceChangeDir).toBe(
      path.join(tmpDir, "specrunner", "changes", "archive", datedSlug),
    );
  });

  // TC-SRC-03
  it("TC-SRC-03: same jobId in active and archive — newer updatedAt wins with its sourceChangeDir", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-src-dirs-03-"));

    const slug = "shared-job";
    const jobId = "cccccccc-0000-0000-0000-000000000003";
    const datedSlug = "2026-01-01-shared-job";

    // Archive entry — older
    const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive", datedSlug);
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(
      path.join(archiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, updatedAt: "2026-01-01T08:00:00.000Z", status: "archived" }),
    );

    // Active entry — newer (same jobId)
    const activeDir = path.join(tmpDir, "specrunner", "changes", slug);
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(
      path.join(activeDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, updatedAt: "2026-01-01T12:00:00.000Z", status: "awaiting-archive" }),
    );

    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: true });

    // Only one entry for this jobId (deduplicated)
    const matching = entries.filter((e) => e.state.jobId === jobId);
    expect(matching).toHaveLength(1);

    // The newer active entry wins
    expect(matching[0]!.sourceChangeDir).toBe(path.join(tmpDir, "specrunner", "changes", slug));
  });
});

// ---------------------------------------------------------------------------
// Worktree archive walk tests (T-04 / TC-003, TC-012, TC-013)
// ---------------------------------------------------------------------------

describe("JobStateStore.listWithSourceDirs — worktree archive walk (section 2b)", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  /**
   * TC-003: worktree archive/ entry is discovered when includeArchived: true.
   * After archive-record, the change folder lives in the worktree archive/ dir
   * (status still awaiting-archive — deferred transition).
   * listWithSourceDirs must find this entry and set sourceChangeDir to the worktree archive dir.
   */
  it("TC-003: worktree archive dir discovered with includeArchived: true; sourceChangeDir points to worktree archive", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-wt-archive-003-"));

    const slug = "my-feature";
    const datedSlug = "2026-07-01-my-feature";
    const jobId = "dddddddd-0000-0000-0000-000000000004";
    const worktreeName = `my-feature-${jobId.slice(0, 8)}`;

    // Create worktree archive structure:
    // <repoRoot>/.git/specrunner-worktrees/<wt>/specrunner/changes/archive/<dated-slug>/state.json
    const worktreeArchiveDir = path.join(
      tmpDir,
      ".git",
      "specrunner-worktrees",
      worktreeName,
      "specrunner",
      "changes",
      "archive",
      datedSlug,
    );
    await fs.mkdir(worktreeArchiveDir, { recursive: true });
    await fs.writeFile(
      path.join(worktreeArchiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, status: "awaiting-archive" }),
    );

    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: true });

    const entry = entries.find((e) => e.state.jobId === jobId);
    expect(entry).toBeDefined();
    // sourceChangeDir must point to the worktree archive dated dir
    expect(entry!.sourceChangeDir).toBe(worktreeArchiveDir);
    // Status is still awaiting-archive (deferred transition)
    expect(entry!.state.status).toBe("awaiting-archive");
  });

  /**
   * TC-012: worktree archive/ entry is NOT discovered when includeArchived: false.
   * The walk is gated by includeArchived — callers that do not need archived state
   * (cancel / inbox / default ps) must not pay the scan cost or see archive entries.
   */
  it("TC-012: worktree archive dir NOT discovered with includeArchived: false", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-wt-archive-012-"));

    const slug = "my-feature-2";
    const datedSlug = "2026-07-01-my-feature-2";
    const jobId = "eeeeeeee-0000-0000-0000-000000000005";
    const worktreeName = `my-feature-2-${jobId.slice(0, 8)}`;

    const worktreeArchiveDir = path.join(
      tmpDir,
      ".git",
      "specrunner-worktrees",
      worktreeName,
      "specrunner",
      "changes",
      "archive",
      datedSlug,
    );
    await fs.mkdir(worktreeArchiveDir, { recursive: true });
    await fs.writeFile(
      path.join(worktreeArchiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, status: "awaiting-archive" }),
    );

    // includeArchived: false — worktree archive must not be discovered
    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: false });

    const entry = entries.find((e) => e.state.jobId === jobId);
    expect(entry).toBeUndefined();
  });

  /**
   * TC-013: same jobId in main checkout archive and worktree archive → newest updatedAt wins.
   * Dedup must handle cross-section collisions correctly (section 1b vs section 2b).
   */
  it("TC-013: same jobId in main archive and worktree archive — newer updatedAt wins", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-wt-archive-013-"));

    const slug = "shared-feature";
    const datedSlug = "2026-07-01-shared-feature";
    const jobId = "ffffffff-0000-0000-0000-000000000006";
    const worktreeName = `shared-feature-${jobId.slice(0, 8)}`;

    // Main checkout archive — older entry
    const mainArchiveDir = path.join(tmpDir, "specrunner", "changes", "archive", datedSlug);
    await fs.mkdir(mainArchiveDir, { recursive: true });
    await fs.writeFile(
      path.join(mainArchiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, updatedAt: "2026-07-01T08:00:00.000Z", status: "archived" }),
    );

    // Worktree archive — newer entry (awaiting-archive, deferred transition)
    const worktreeArchiveDir = path.join(
      tmpDir,
      ".git",
      "specrunner-worktrees",
      worktreeName,
      "specrunner",
      "changes",
      "archive",
      datedSlug,
    );
    await fs.mkdir(worktreeArchiveDir, { recursive: true });
    await fs.writeFile(
      path.join(worktreeArchiveDir, "state.json"),
      makeMinimalStateJson({ jobId, slug, updatedAt: "2026-07-01T12:00:00.000Z", status: "awaiting-archive" }),
    );

    const entries = await JobStateStore.listWithSourceDirs(tmpDir, { includeArchived: true });

    // Only one entry for this jobId
    const matching = entries.filter((e) => e.state.jobId === jobId);
    expect(matching).toHaveLength(1);

    // The newer worktree archive entry wins
    expect(matching[0]!.sourceChangeDir).toBe(worktreeArchiveDir);
    expect(matching[0]!.state.status).toBe("awaiting-archive");
  });
});

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

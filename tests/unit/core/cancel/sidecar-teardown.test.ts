/**
 * Unit tests for cancel's jobId-scoped sidecar/marker teardown.
 *
 * TC-027: normal cancel deletes its own sidecar
 *   (spec.md > Requirement: cancel tears down sidecar only for its own jobId > Scenario: normal cancel deletes own)
 * TC-028: cancel leaves a foreign sidecar intact
 *   (spec.md > Requirement: cancel tears down sidecar only for its own jobId > Scenario: cancel leaves foreign intact)
 * TC-029: managed cancel deletes only its own marker
 *   (spec.md > Requirement: managed runtime > Scenario: managed cancel deletes only its own marker)
 * TC-030: --purge removes the slug directory when sidecar/marker matches jobId (should)
 * TC-031: --purge skips directory removal when sidecar belongs to a foreign non-terminal job
 * TC-032: managed marker is not unlinked when jobId does not match (should)
 *
 * Source: tasks.md > T-05
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { cancelSingleJob } from "../../../../src/core/cancel/runner.js";
import type { CancelDeps } from "../../../../src/core/cancel/runner.js";
import { buildInitialJobState, JobStateStore } from "../../../../src/store/job-state-store.js";
import type { JobStatus } from "../../../../src/state/schema.js";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import type { SpawnResult } from "../../../../src/util/spawn.js";
import { livenessJsonPath, managedMarkerPath } from "../../../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-sidecar-teardown-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await nodefs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeJob(
  status: JobStatus = "running",
  extras: Partial<{ pid: number | null; branch: string; worktreePath: string }> = {},
  slugOverride?: string,
): Promise<{ jobId: string; slug: string }> {
  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });
  const jobId = state.jobId;
  const slug = slugOverride ?? `teardown-${jobId.slice(0, 8)}`;
  const pid = "pid" in extras ? (extras.pid ?? null) : null;

  const slugDir = path.join(tempDir, "specrunner", "changes", slug);
  await nodefs.mkdir(slugDir, { recursive: true });
  await nodefs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
      repository: state.repository,
      session: null,
      step: "implementer",
      status,
      pid: pid ?? null,
      branch: extras.branch ?? null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
  );
  await nodefs.writeFile(path.join(slugDir, "events.jsonl"), "");

  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(livenessDir, { recursive: true });
  await nodefs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: extras.worktreePath ?? null, pid }),
  );

  return { jobId, slug };
}

async function writeForeignSidecar(slug: string, foreignJobId: string, foreignStatus: string = "running"): Promise<void> {
  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(livenessDir, { recursive: true });
  await nodefs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({ jobId: foreignJobId, worktreePath: null, pid: null }),
  );
}

async function writeMarker(slug: string, jobId: string): Promise<void> {
  const markerDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(markerDir, { recursive: true });
  await nodefs.writeFile(
    path.join(markerDir, "marker.json"),
    JSON.stringify({ jobId, createdAt: new Date().toISOString() }),
  );
}

function makeDeps(overrides: Partial<CancelDeps> = {}): CancelDeps {
  const spawnOk: (cmd: string, args: string[]) => Promise<SpawnResult> = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  const worktreeManager: WorktreeManager = {
    create: vi.fn().mockResolvedValue("/fake/worktree"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
  return {
    spawn: spawnOk as CancelDeps["spawn"],
    worktreeManager,
    sleep: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(false),
    repoRoot: tempDir,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-027: normal cancel deletes its own sidecar
// (spec.md Scenario: normal cancel deletes its own sidecar)
// ---------------------------------------------------------------------------

describe("TC-027: normal cancel deletes its own sidecar", () => {
  it("liveness.json is deleted after normal cancel when sidecar jobId matches", async () => {
    const { jobId, slug } = await makeJob("awaiting-resume");
    const deps = makeDeps();

    await cancelSingleJob({ jobId, force: true, purge: false, deps });

    const sidecarPath = path.join(tempDir, livenessJsonPath(slug));
    await expect(nodefs.access(sidecarPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

// ---------------------------------------------------------------------------
// TC-028: cancel leaves a foreign sidecar intact
// (spec.md Scenario: cancel leaves a foreign sidecar intact)
// ---------------------------------------------------------------------------

describe("TC-028: cancel leaves a foreign sidecar intact", () => {
  it("liveness.json is NOT deleted when sidecar records a different jobId", async () => {
    const { jobId } = await makeJob("awaiting-resume");
    const slug = `teardown-${jobId.slice(0, 8)}`;

    // Overwrite the sidecar to point to a different jobId (foreign)
    const foreignJobId = "foreign-job-0000-0000-0000-000000000001";
    await writeForeignSidecar(slug, foreignJobId, "running");

    const deps = makeDeps();
    await cancelSingleJob({ jobId, force: true, purge: false, deps });

    // Sidecar should still exist (belongs to foreign job)
    const sidecarPath = path.join(tempDir, livenessJsonPath(slug));
    const raw = await nodefs.readFile(sidecarPath, "utf-8");
    const data = JSON.parse(raw) as { jobId: string };
    expect(data.jobId).toBe(foreignJobId);
  });
});

// ---------------------------------------------------------------------------
// TC-029: managed cancel deletes only its own marker
// (spec.md > managed runtime scenario)
// ---------------------------------------------------------------------------

describe("TC-029: managed cancel deletes only its own marker", () => {
  it("marker.json is deleted when marker jobId matches the canceled job", async () => {
    const { jobId, slug } = await makeJob("running");
    await writeMarker(slug, jobId); // marker points to the job being canceled

    const deps = makeDeps();
    await cancelSingleJob({ jobId, force: true, purge: false, deps });

    const markerPath = path.join(tempDir, managedMarkerPath(slug));
    await expect(nodefs.access(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

// ---------------------------------------------------------------------------
// TC-030: --purge removes the slug directory when sidecar/marker matches jobId (should)
// ---------------------------------------------------------------------------

describe("TC-030: --purge removes the slug directory when sidecar matches jobId", () => {
  it("the .specrunner/local/<slug>/ directory is removed when sidecar jobId matches", async () => {
    const { jobId, slug } = await makeJob("awaiting-resume");
    const deps = makeDeps();

    await cancelSingleJob({ jobId, force: true, purge: true, deps });

    const localDir = path.join(tempDir, ".specrunner", "local", slug);
    await expect(nodefs.access(localDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

// ---------------------------------------------------------------------------
// TC-031: --purge skips directory removal when sidecar belongs to a foreign non-terminal job
// ---------------------------------------------------------------------------

describe("TC-031: --purge skips directory removal when sidecar belongs to foreign non-terminal job", () => {
  it("the .specrunner/local/<slug>/ directory is NOT removed when sidecar is foreign non-terminal", async () => {
    const { jobId } = await makeJob("awaiting-resume");
    const slug = `teardown-${jobId.slice(0, 8)}`;

    // Overwrite sidecar to foreign non-terminal job
    const foreignJobId = "foreign-non-terminal-00000000000001";
    await writeForeignSidecar(slug, foreignJobId, "running");

    const deps = makeDeps();
    await cancelSingleJob({ jobId, force: true, purge: true, deps });

    // Directory should still exist because it belongs to a foreign non-terminal job
    const localDir = path.join(tempDir, ".specrunner", "local", slug);
    await expect(nodefs.access(localDir)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-032: managed marker is not unlinked when jobId does not match (should)
// ---------------------------------------------------------------------------

describe("TC-032: managed marker is not unlinked when jobId does not match", () => {
  it("marker.json is left intact when marker jobId is a different job", async () => {
    const { jobId } = await makeJob("running");
    const slug = `teardown-${jobId.slice(0, 8)}`;

    // Write marker with a different jobId
    const differentJobId = "marker-different-job-000000000001";
    await writeMarker(slug, differentJobId);

    const deps = makeDeps();
    await cancelSingleJob({ jobId, force: true, purge: false, deps }); // normal cancel

    // Marker should still exist (different jobId)
    const markerPath = path.join(tempDir, managedMarkerPath(slug));
    const raw = await nodefs.readFile(markerPath, "utf-8");
    const data = JSON.parse(raw) as { jobId: string };
    expect(data.jobId).toBe(differentJobId);
  });
});

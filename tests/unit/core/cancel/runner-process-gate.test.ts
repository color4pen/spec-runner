/**
 * Tests for the new pid-resolution and process-death-gate behavior in cancelSingleJob (T-02, T-03, T-04).
 *
 * TC-001: state.pid drives the kill (pid 1234, status=awaiting-resume → SIGTERM sent)
 * TC-002: sidecar fills in a null state.pid (sidecar pid=5678, jobId match → kill targets 5678)
 * TC-003: foreign sidecar is not adopted (sidecar jobId mismatch → no kill)
 * TC-004: awaiting-resume + live pid → SIGTERM is sent (破壊確認: status gate removal)
 * TC-005: no resolvable pid warns and continues ("no PID recorded")
 * TC-011: group reap is reported in cancel output (info line)
 * TC-012: skipped kill reported in cancel output (warning line)
 *
 * Tests are intentionally RED until:
 *   - cancelSingleJob replaces the status gate with a pid-resolution gate (T-02)
 *   - CancelDeps gains optional isGroupLeader (T-03)
 *   - KillResult.groupKilled drives an info line in cancel output (T-04)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { cancelSingleJob } from "../../../../src/core/cancel/runner.js";
import type { CancelDeps } from "../../../../src/core/cancel/runner.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { JobStatus } from "../../../../src/state/schema.js";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";
import type { SpawnResult } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-cancel-gate-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await nodefs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write state.json + liveness.json for a job.
 * statePid and sidecarPid can be set independently to test sidecar fallback.
 */
async function makeJobWithPids(opts: {
  status?: JobStatus;
  statePid?: number | null;
  sidecarPid?: number | null;
  sidecarJobIdOverride?: string; // override sidecar.jobId to test foreign-jobId rejection
}): Promise<{ jobId: string; slug: string }> {
  const {
    status = "running",
    statePid = null,
    sidecarPid = null,
    sidecarJobIdOverride,
  } = opts;

  const state = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });
  const jobId = state.jobId;
  const slug = `gate-${jobId.slice(0, 8)}`;

  // Write slug canonical state
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
      step: "init",
      status,
      pid: statePid ?? null,
      branch: null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
  );
  await nodefs.writeFile(path.join(slugDir, "events.jsonl"), "");

  // Write liveness sidecar
  const livenessDir = path.join(tempDir, ".specrunner", "local", slug);
  await nodefs.mkdir(livenessDir, { recursive: true });
  await nodefs.writeFile(
    path.join(livenessDir, "liveness.json"),
    JSON.stringify({
      jobId: sidecarJobIdOverride ?? jobId, // use override to test foreign-jobId
      worktreePath: null,
      pid: sidecarPid ?? null,
    }),
  );

  return { jobId, slug };
}

/** Minimal CancelDeps mock with isGroupLeader. */
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
    // isGroupLeader is the new optional dep — default false (safe)
    isGroupLeader: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-001: state.pid drives the kill
// ---------------------------------------------------------------------------

describe("TC-001: state.pid drives the kill", () => {
  it("kill targets state.pid=1234 regardless of sidecar pid", async () => {
    // Use awaiting-resume so the test is RED with status gate and GREEN without it
    const { jobId } = await makeJobWithPids({
      status: "awaiting-resume",
      statePid: 1234,
      sidecarPid: 5678,
    });
    const kill = vi.fn();
    const isAlive = vi.fn().mockReturnValue(false);
    const deps = makeDeps({ kill, isAlive });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-001: kill must target state.pid (1234), not sidecar pid (5678)
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(5678, "SIGTERM");
  });
});

// ---------------------------------------------------------------------------
// TC-002: sidecar fills in a null state.pid
// ---------------------------------------------------------------------------

describe("TC-002: sidecar fills in a null state.pid", () => {
  it("kill targets sidecar.pid=5678 when state.pid is null and jobId matches", async () => {
    const { jobId } = await makeJobWithPids({
      status: "running",
      statePid: null,
      sidecarPid: 5678,
      // sidecarJobIdOverride is NOT set → sidecar.jobId === state.jobId (match)
    });
    const kill = vi.fn();
    const isAlive = vi.fn().mockReturnValue(false);
    const deps = makeDeps({ kill, isAlive });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-002: sidecar pid must be used as the kill target
    expect(kill).toHaveBeenCalledWith(5678, "SIGTERM");
  });
});

// ---------------------------------------------------------------------------
// TC-003: foreign sidecar is not adopted
// ---------------------------------------------------------------------------

describe("TC-003: foreign sidecar is not adopted", () => {
  it("no kill and warns when sidecar.jobId differs from state.jobId", async () => {
    const { jobId } = await makeJobWithPids({
      status: "running",
      statePid: null,
      sidecarPid: 5678,
      sidecarJobIdOverride: "different-job-id-0000000000000000",
    });
    const kill = vi.fn();
    const deps = makeDeps({ kill });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-003: foreign sidecar must NOT be used — kill must not be called at all
    expect(kill).not.toHaveBeenCalledWith(5678, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(5678, "SIGKILL");
    // TC-003: warn that no PID could be resolved
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("no PID recorded")]),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-004: awaiting-resume + live pid → SIGTERM is sent
// 破壊確認: if the state.status === "running" gate is restored, this test FAILS
// ---------------------------------------------------------------------------

describe("TC-004: awaiting-resume + live pid → SIGTERM sent (process-death gate)", () => {
  it("TC-004 (破壊確認): SIGTERM sent for awaiting-resume job with a resolved live pid", async () => {
    // key: status is awaiting-resume (NOT running) — current status-gate skips kill here
    const { jobId } = await makeJobWithPids({
      status: "awaiting-resume",
      statePid: 1234,
    });
    const kill = vi.fn();
    const isAlive = vi.fn().mockReturnValue(false);
    const deps = makeDeps({ kill, isAlive });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-004: SIGTERM must be sent even though status is awaiting-resume
    // 破壊確認: if `if (state.status === "running")` gate is restored, this assertion fails
    expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");
  });
});

// ---------------------------------------------------------------------------
// TC-005: no resolvable pid warns and continues
// ---------------------------------------------------------------------------

describe("TC-005: no resolvable pid warns and continues", () => {
  it("emits warning containing 'no PID recorded' when pid cannot be resolved", async () => {
    // state.pid=null, sidecar.pid=null → no pid from either source
    const { jobId } = await makeJobWithPids({
      status: "awaiting-resume",
      statePid: null,
      sidecarPid: null,
    });
    const kill = vi.fn();
    const deps = makeDeps({ kill });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-005: warning must contain "no PID recorded"
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("no PID recorded")]),
    );
    // TC-005: kill must NOT be called when no pid is resolvable
    expect(kill).not.toHaveBeenCalledWith(expect.any(Number), "SIGTERM");
  });
});

// ---------------------------------------------------------------------------
// TC-011: group reap reported in cancel output
// ---------------------------------------------------------------------------

describe("TC-011: group reap is reported in cancel output", () => {
  it("TC-011: result.info contains group-reap line when kill escalated and reaped a leader group", async () => {
    // state.pid=1234, isAlive always true → SIGKILL escalation fires
    // isGroupLeader=true → group kill attempted → KillResult.groupKilled=true → info line
    const { jobId } = await makeJobWithPids({
      status: "running",
      statePid: 1234,
    });
    const kill = vi.fn();
    // isAlive stays true → forces SIGKILL escalation (mocked sleep makes loops instant)
    const isAlive = vi.fn().mockReturnValue(true);
    const isGroupLeader = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ kill, isAlive, isGroupLeader });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-011: group signal must have been sent
    expect(kill).toHaveBeenCalledWith(-1234, "SIGKILL");
    // TC-011: info line about group reap must be present
    expect(result.info).toEqual(
      expect.arrayContaining([expect.stringMatching(/-1234|group/)]),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-012: skipped kill reported in cancel output
// ---------------------------------------------------------------------------

describe("TC-012: skipped kill reported in cancel output", () => {
  it("TC-012: warning emitted when cancel cannot resolve any pid (awaiting-resume, no pid)", async () => {
    // awaiting-resume + no pid in state or sidecar → current code skips the kill block entirely
    // New code: resolves no pid → emits "no PID recorded" warning
    const { jobId } = await makeJobWithPids({
      status: "awaiting-resume",
      statePid: null,
      sidecarPid: null,
    });
    const kill = vi.fn();
    const deps = makeDeps({ kill });

    const result = await cancelSingleJob({ jobId, force: false, purge: false, deps });

    expect(result.exitCode).toBe(0);
    // TC-012: warning distinguishes skipped kill from group reap
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("no PID recorded")]),
    );
    // TC-012: kill not called
    expect(kill).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSingleJob, type CancelDeps } from "../runner.js";
import type { WorktreeManager } from "../../worktree/manager.js";
import type { JobState } from "../../../state/schema.js";
import type { SpawnFn, SpawnResult } from "../../../util/spawn.js";
import { loadStateByJobId } from "../../job-access/load-by-job-id.js";

vi.mock("../../job-access/load-by-job-id.js", () => ({
  loadStateByJobId: vi.fn(),
}));

const FAKE_REPO_ROOT = "/repo";
const FAKE_JOB_ID = "11111111-2222-4333-8444-555555555555";
const FAKE_BRANCH = "fix/test";

beforeEach(() => {
  vi.mocked(loadStateByJobId).mockResolvedValue(makeState() as never);
});

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: FAKE_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/specrunner/changes/cancel-test/request.md",
      title: "Cancel Test",
      type: "bug-fix",
      slug: "cancel-test",
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status: "failed",
    pid: null,
    branch: FAKE_BRANCH,
    error: null,
    history: [],
    worktreePath: null,
    ...overrides,
  } as JobState;
}

function makeDeps(spawn: SpawnFn): CancelDeps {
  const worktreeManager: WorktreeManager = {
    create: vi.fn().mockResolvedValue("/fake/worktree"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };

  return {
    spawn,
    worktreeManager,
    sleep: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(false),
    repoRoot: FAKE_REPO_ROOT,
  };
}

function makeSpawnWithRemoteResult(remoteResult: SpawnResult): SpawnFn {
  return vi.fn().mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === "push" && args[1] === "origin" && args[2] === "--delete") {
      return Promise.resolve(remoteResult);
    }
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  }) as SpawnFn;
}

describe("cancelSingleJob — remote branch deletion idempotency", () => {
  it("T-cancel-branch-01: does not add a warning when the remote branch is already absent", async () => {
    const spawn = makeSpawnWithRemoteResult({
      exitCode: 1,
      stdout: "",
      stderr: "error: unable to delete 'refs/heads/fix/test': remote ref does not exist",
    });

    const result = await cancelSingleJob({ jobId: FAKE_JOB_ID, force: false, purge: false, deps: makeDeps(spawn) });

    expect(result.exitCode).toBe(0);
    expect(result.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("failed to delete remote branch")]),
    );
  });

  it("T-cancel-branch-02: adds a warning when remote branch deletion fails for another reason", async () => {
    const spawn = makeSpawnWithRemoteResult({ exitCode: 128, stdout: "", stderr: "remote: Repository not found." });

    const result = await cancelSingleJob({ jobId: FAKE_JOB_ID, force: false, purge: false, deps: makeDeps(spawn) });

    expect(result.exitCode).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("failed to delete remote branch")]),
    );
  });

  it("T-cancel-branch-03: does not add a warning when remote branch deletion succeeds", async () => {
    const spawn = makeSpawnWithRemoteResult({ exitCode: 0, stdout: "", stderr: "" });

    const result = await cancelSingleJob({ jobId: FAKE_JOB_ID, force: false, purge: false, deps: makeDeps(spawn) });

    expect(result.exitCode).toBe(0);
    expect(result.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("failed to delete remote branch")]),
    );
  });
});

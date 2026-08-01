/**
 * Integration tests for LocalRuntime.assertNoDuplicateLiveJob().
 *
 * Uses a real temp dir as repoRoot and writes real liveness.json files to verify
 * the wiring between LocalRuntime → checkDuplicateLiveJob → real fs + isProcessAlive.
 *
 * TC-LR-01: live pid (process.pid) → DUPLICATE_LIVE_JOB thrown
 * TC-LR-02: sidecar absent         → allowed (resolve)
 *
 * The dead-pid branch is covered deterministically by TC-02 in duplicate-slug-guard.test.ts
 * using injected deps; real-process dead-pid tests are inherently flaky and omitted here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import { SpecRunnerError } from "../../../../src/errors.js";
import { livenessJsonPath } from "../../../../src/util/paths.js";

// ---------------------------------------------------------------------------
// Minimal LocalRuntime construction helper (matches pattern in local.test.ts)
// ---------------------------------------------------------------------------

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

function makeLocalRuntime(repoRoot: string): LocalRuntime {
  return new LocalRuntime({
    cwd: repoRoot,
    githubClient: buildMockGitHubClient() as never,
    githubToken: "ghp_test",
    owner: "testowner",
    repo: "testrepo",
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;
const SLUG = "test-slug";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-lr-dup-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-LR-01: live pid (process.pid) → rejected
// ---------------------------------------------------------------------------

describe("TC-LR-01: liveness.json with process.pid (alive) → DUPLICATE_LIVE_JOB thrown", () => {
  it("throws SpecRunnerError with code DUPLICATE_LIVE_JOB", async () => {
    // Write liveness.json with the current process's pid (guaranteed alive)
    const sidecarPath = path.join(tempDir, livenessJsonPath(SLUG));
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ pid: process.pid, jobId: "job-A", worktreePath: "/wt", session: null }),
      "utf-8",
    );

    const runtime = makeLocalRuntime(tempDir);

    await expect(runtime.assertNoDuplicateLiveJob(tempDir, SLUG)).rejects.toBeInstanceOf(
      SpecRunnerError,
    );
  });

  it("error code is DUPLICATE_LIVE_JOB and message contains jobId job-A", async () => {
    const sidecarPath = path.join(tempDir, livenessJsonPath(SLUG));
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ pid: process.pid, jobId: "job-A", worktreePath: "/wt", session: null }),
      "utf-8",
    );

    const runtime = makeLocalRuntime(tempDir);

    try {
      await runtime.assertNoDuplicateLiveJob(tempDir, SLUG);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toBe("DUPLICATE_LIVE_JOB");
      expect((err as SpecRunnerError).message).toContain("job-A");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-LR-02: sidecar absent → allowed
// ---------------------------------------------------------------------------

describe("TC-LR-02: liveness.json absent → allowed (resolves)", () => {
  it("resolves without throwing when sidecar does not exist", async () => {
    const runtime = makeLocalRuntime(tempDir);

    // No sidecar file written → assertNoDuplicateLiveJob should not throw
    await expect(runtime.assertNoDuplicateLiveJob(tempDir, SLUG)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-015: managed runtime no-op – assertNoDuplicateLiveJob never throws
//
// TC-053 UPDATED: Under the new fail-closed slug occupancy invariant (R1/R2),
// the managed runtime must ALSO enforce the occupancy invariant.
// "Managed no-op" is replaced by: managed runtime rejects a start when the slug
// has a non-terminal job, just like LocalRuntime.
//
// The updated expectation: if slug S has a non-terminal job recorded in state,
// ManagedRuntime.assertNoDuplicateLiveJob throws SLUG_OCCUPIED (not silently allows).
//
// A sidecar-only fixture (liveness.json with live pid) is insufficient for the
// state-based guard; the fixture must include a non-terminal state.json.
// ---------------------------------------------------------------------------

function buildMockSessionClient() {
  return {
    createSession: vi.fn(),
    sendUserMessage: vi.fn(),
    pollUntilComplete: vi.fn(),
    streamEvents: vi.fn(),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  };
}

async function writeManagedJobState(
  repoRoot: string,
  slug: string,
  jobId: string,
  status: string,
): Promise<void> {
  const slugDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: `/specrunner/changes/${slug}/request.md`, title: "Test", type: "bug-fix", slug },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "implementer",
      status,
      pid: null,
      branch: null,
      error: null,
      history: [],
      _journal: { historyCount: 0, stepCounts: {} },
    }),
    "utf-8",
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");
}

describe("TC-015 / TC-053: ManagedRuntime.assertNoDuplicateLiveJob enforces occupancy (fail-closed)", () => {
  it("throws SLUG_OCCUPIED when slug has a non-terminal awaiting-resume job (managed path)", async () => {
    // TC-053: managed runtime now rejects occupied slugs (state-based, fail-closed)
    await writeManagedJobState(tempDir, SLUG, "managed-job-A", "awaiting-resume");

    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient() as never,
      buildMockGitHubClient() as never,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "ghp_test",
    );

    // NEW EXPECTATION: managed runtime now rejects when slug is occupied
    await expect(runtime.assertNoDuplicateLiveJob(tempDir, SLUG)).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("thrown error code is SLUG_OCCUPIED for managed runtime with non-terminal prior job", async () => {
    await writeManagedJobState(tempDir, SLUG, "managed-job-B", "running");

    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient() as never,
      buildMockGitHubClient() as never,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "ghp_test",
    );

    try {
      await runtime.assertNoDuplicateLiveJob(tempDir, SLUG);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as SpecRunnerError).code).toMatch(/SLUG_OCCUPIED/);
    }
  });

  it("resolves without throwing when sidecar is absent and no non-terminal state exists", async () => {
    // Absent state → no occupant → allow (this behavior is unchanged)
    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient() as never,
      buildMockGitHubClient() as never,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "ghp_test",
    );

    await expect(runtime.assertNoDuplicateLiveJob(tempDir, SLUG)).resolves.toBeUndefined();
  });

  it("resolves without throwing when slug has only terminal (canceled) jobs", async () => {
    await writeManagedJobState(tempDir, SLUG, "managed-job-C", "canceled");

    const runtime = new ManagedRuntime(
      tempDir,
      buildMockSessionClient() as never,
      buildMockGitHubClient() as never,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "ghp_test",
    );

    // Terminal job → slug is free → allow
    await expect(runtime.assertNoDuplicateLiveJob(tempDir, SLUG)).resolves.toBeUndefined();
  });
});

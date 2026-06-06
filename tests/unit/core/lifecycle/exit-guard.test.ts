/**
 * TC-037: createExitGuardHandler per-job isolation tests.
 *
 * Verifies that:
 * (1) When fired with a targetJobId, only the target job's state transitions to
 *     awaiting-resume; other running jobs are not affected.
 * (2) When no matching worktree dir is found for the jobId, the handler falls
 *     back to the global scan and transitions all running jobs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createExitGuardHandler } from "../../../../src/core/lifecycle/exit-guard.js";
import { JobStateStore } from "../../../../src/store/job-state-store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "exit-guard-perjob-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a job state to slug dir so list() can find it for global-scan fallback tests.
 * Returns the slug used (for loading state in assertions).
 */
async function writeLegacyState(
  repoRoot: string,
  jobId: string,
  status = "running",
): Promise<string> {
  const slug = `legacy-${jobId.slice(0, 8)}`;
  const state = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status,
    branch: null,
    history: [],
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };

  const slugDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(state, null, 2), "utf-8");
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

  // Write liveness sidecar so resolveStateStoreByJobId can find the store
  const sidecarDir = path.join(repoRoot, ".specrunner", "local", slug);
  await fs.mkdir(sidecarDir, { recursive: true });
  await fs.writeFile(
    path.join(sidecarDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: null }),
    "utf-8",
  );
  return slug;
}

/**
 * Write a slug-based state.json + empty events.jsonl in the worktree path.
 *
 * Layout: {worktreePath}/specrunner/changes/{slug}/state.json
 */
async function writeSlugState(
  worktreePath: string,
  slug: string,
  jobId: string,
  status = "running",
): Promise<void> {
  const changeDir = path.join(worktreePath, "specrunner", "changes", slug);
  await fs.mkdir(changeDir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    // slug-mode: no worktreePath/pid/session; no request.path/slug (injected on load)
    request: { title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    step: "design",
    status,
    branch: `change/${slug}-${jobId.slice(0, 8)}`,
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };
  await fs.writeFile(
    path.join(changeDir, "state.json"),
    JSON.stringify(stateJson, null, 2),
    "utf-8",
  );
  // events.jsonl: start empty
  await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");
}

/**
 * Wait for the async void IIFE inside the handler to complete.
 */
function waitForHandler(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

// ---------------------------------------------------------------------------
// TC-037-1: per-job mode — only target job transitions; other jobs unchanged
// ---------------------------------------------------------------------------
describe("TC-037-1: per-job exit guard — only target job transitions to awaiting-resume", () => {
  it("target job → awaiting-resume; other running job → unchanged", async () => {
    const targetJobId = "aabbccdd-0000-0000-0000-000000000001";
    const otherJobId = "11223344-0000-0000-0000-000000000002";
    const slug = "my-feature";
    const jobId8 = targetJobId.slice(0, 8); // "aabbccdd"

    // Set up the worktree directory for the target job
    const worktreeDir = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId8}`);
    await writeSlugState(worktreeDir, slug, targetJobId, "running");

    // Set up a legacy running job (other job — should NOT be affected)
    const otherSlug = await writeLegacyState(tempDir, otherJobId, "running");

    // Fire the per-job handler
    const handler = createExitGuardHandler(tempDir, targetJobId);
    handler();
    await waitForHandler();

    // Target job must be awaiting-resume
    const targetStore = new JobStateStore(targetJobId, tempDir, { slug, stateRoot: worktreeDir });
    const targetState = await targetStore.load();
    expect(targetState.status).toBe("awaiting-resume");

    // Other job must be unchanged (still running)
    const otherStore = new JobStateStore(otherJobId, tempDir, { slug: otherSlug, stateRoot: tempDir });
    const otherState = await otherStore.load();
    expect(otherState.status).toBe("running");
  });

  it("non-running target job → no status change", async () => {
    const targetJobId = "aabbccdd-0000-0000-0000-000000000003";
    const slug = "finished-feature";
    const jobId8 = targetJobId.slice(0, 8);

    const worktreeDir = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId8}`);
    await writeSlugState(worktreeDir, slug, targetJobId, "awaiting-archive");

    const handler = createExitGuardHandler(tempDir, targetJobId);
    handler();
    await waitForHandler();

    // Non-running target → guard should skip it
    const targetStore = new JobStateStore(targetJobId, tempDir, { slug, stateRoot: worktreeDir });
    const targetState = await targetStore.load();
    expect(targetState.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-037-2: fallback to global scan when no matching worktree found
// ---------------------------------------------------------------------------
describe("TC-037-2: per-job exit guard — global scan fallback when worktree not found", () => {
  it("no worktrees dir → falls back to global scan, transitions all running jobs", async () => {
    const jobId1 = "ccddccdd-0000-0000-0000-000000000001";
    const jobId2 = "eeffeeff-0000-0000-0000-000000000002";

    // Both jobs in legacy format (running)
    const slug1 = await writeLegacyState(tempDir, jobId1, "running");
    const slug2 = await writeLegacyState(tempDir, jobId2, "running");

    // No .git/specrunner-worktrees/ directory exists
    // Fire with a jobId that matches no worktree → global scan
    const unknownJobId = "ffffffff-0000-0000-0000-000000000099";
    const handler = createExitGuardHandler(tempDir, unknownJobId);
    handler();
    await waitForHandler();

    // Global scan: both running jobs → awaiting-resume
    const store1 = new JobStateStore(jobId1, tempDir, { slug: slug1, stateRoot: tempDir });
    const store2 = new JobStateStore(jobId2, tempDir, { slug: slug2, stateRoot: tempDir });
    const state1 = await store1.load();
    const state2 = await store2.load();
    expect(state1.status).toBe("awaiting-resume");
    expect(state2.status).toBe("awaiting-resume");
  });

  it("worktrees dir exists but no matching entry → falls back to global scan", async () => {
    const targetJobId = "deadbeef-0000-0000-0000-000000000001";
    const otherLegacyJobId = "cafebabe-0000-0000-0000-000000000002";

    // Create worktrees dir with a different worktree (not matching targetJobId8)
    const worktreesDir = path.join(tempDir, ".git", "specrunner-worktrees");
    const wrongWorktreeDir = path.join(worktreesDir, "other-slug-aaaaaaaa");
    await fs.mkdir(path.join(wrongWorktreeDir, "specrunner", "changes", "other-slug"), { recursive: true });

    // Legacy running job
    const otherSlug = await writeLegacyState(tempDir, otherLegacyJobId, "running");

    // Fire with targetJobId (no matching worktree)
    const handler = createExitGuardHandler(tempDir, targetJobId);
    handler();
    await waitForHandler();

    // Global scan: legacy running job → awaiting-resume
    const otherStore = new JobStateStore(otherLegacyJobId, tempDir, { slug: otherSlug, stateRoot: tempDir });
    const otherState = await otherStore.load();
    expect(otherState.status).toBe("awaiting-resume");
  });

  it("per-job handler fires only once (fired guard)", async () => {
    const targetJobId = "aabbccdd-0000-0000-0000-000000000099";
    const slug = "guarded-feature";
    const jobId8 = targetJobId.slice(0, 8);

    const worktreeDir = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId8}`);
    await writeSlugState(worktreeDir, slug, targetJobId, "running");

    const handler = createExitGuardHandler(tempDir, targetJobId);

    // Call twice — only first should execute
    handler();
    handler();
    await waitForHandler();

    // Check stderr.write was called exactly once for the transitioning message
    const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const transitionCalls = calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "string" && args[0].includes("transitioning to awaiting-resume"),
    );
    expect(transitionCalls.length).toBe(1);
  });
});

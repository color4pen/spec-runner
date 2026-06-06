import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../../../store/job-state-store.js";
import { createExitGuardHandler } from "../exit-guard.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-exit-guard-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Helper to create a job state in slug dir (for list()) and legacy flat file (for load()).
 */
async function createJobState(repoRoot: string, jobId: string, status: string): Promise<void> {
  const slug = `guard-${jobId.slice(0, 8)}`;
  const state = {
    version: 1,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "new-feature", title: "test", slug },
    repository: { owner: "test", name: "test" },
    session: null,
    step: "init",
    status,
    pid: 12345,
    branch: null,
    history: [],
    error: null,
  };

  // Write legacy flat file (for JobStateStore.load() fallback after persist)
  const jobsDir = path.join(repoRoot, ".specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(state), "utf-8");

  // Write to slug dir (for list() to find it)
  const slugDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({ ...state, _journal: { historyCount: 0, stepCounts: {} } }),
    "utf-8",
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");
}

describe("createExitGuardHandler", () => {
  it("running job → transitioned to awaiting-resume", async () => {
    const jobId = "aaaaaaaa-0000-0000-0000-000000000001";
    await createJobState(tempDir, jobId, "running");

    const handler = createExitGuardHandler(tempDir);
    handler();

    // Wait for async work in void IIFE
    await new Promise((resolve) => setTimeout(resolve, 100));

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();
    expect(state.status).toBe("awaiting-resume");
  });

  it("non-running job → unchanged", async () => {
    const jobId = "aaaaaaaa-0000-0000-0000-000000000002";
    await createJobState(tempDir, jobId, "awaiting-archive");

    const handler = createExitGuardHandler(tempDir);
    handler();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();
    expect(state.status).toBe("awaiting-archive");
  });

  it("handler called twice → only first execution runs (fired guard)", async () => {
    const jobId = "aaaaaaaa-0000-0000-0000-000000000003";
    await createJobState(tempDir, jobId, "running");

    const handler = createExitGuardHandler(tempDir);

    // Call twice
    handler();
    handler();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // stderr.write should have been called exactly once with the warning
    const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const warnCalls = calls.filter((args: unknown[]) =>
      typeof args[0] === "string" && args[0].includes("transitioning to awaiting-resume"),
    );
    expect(warnCalls.length).toBe(1);
  });

  it("I/O error on scan → swallowed, no crash", async () => {
    // Pass a non-existent directory — JobStateStore.list returns [] gracefully
    const handler = createExitGuardHandler(path.join(tempDir, "nonexistent"));
    expect(() => handler()).not.toThrow();

    // No error should propagate
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../../../store/job-state-store.js";
import { createExitGuardHandler } from "../exit-guard.js";
import {
  markSignalHandlerFired,
  isSignalHandlerFired,
  resetSignalHandlerFiredForTest,
} from "../signal-state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-exit-guard-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  resetSignalHandlerFiredForTest();
});

/**
 * Helper to create a job state in slug dir (for list()) and liveness sidecar (for resolveStateStoreByJobId).
 */
async function createJobState(repoRoot: string, jobId: string, status: string): Promise<void> {
  const slug = `guard-${jobId.slice(0, 8)}`;
  const state = {
    version: 2,
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

  // Write to slug dir (for list() to find it)
  const slugDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({ ...state, _journal: { historyCount: 0, stepCounts: {} } }),
    "utf-8",
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

  // Write liveness sidecar (for resolveStateStoreByJobId to find slug → store)
  const sidecarDir = path.join(repoRoot, ".specrunner", "local", slug);
  await fs.mkdir(sidecarDir, { recursive: true });
  await fs.writeFile(
    path.join(sidecarDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: null }),
    "utf-8",
  );
}

/**
 * Helper to create a job state with a custom step value.
 */
async function createJobStateWithStep(
  repoRoot: string,
  jobId: string,
  status: string,
  step: string,
): Promise<void> {
  const slug = `guard-${jobId.slice(0, 8)}`;
  const state = {
    version: 2,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "new-feature", title: "test", slug },
    repository: { owner: "test", name: "test" },
    session: null,
    step,
    status,
    pid: 12345,
    branch: null,
    history: [],
    error: null,
  };

  const slugDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(
    path.join(slugDir, "state.json"),
    JSON.stringify({ ...state, _journal: { historyCount: 0, stepCounts: {} } }),
    "utf-8",
  );
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

  const sidecarDir = path.join(repoRoot, ".specrunner", "local", slug);
  await fs.mkdir(sidecarDir, { recursive: true });
  await fs.writeFile(
    path.join(sidecarDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: null }),
    "utf-8",
  );
}

/**
 * The exit guard performs its state transition inside a fire-and-forget async
 * task (a process exit handler cannot itself be awaited). Poll the store until
 * the job reaches `expected` (or `maxMs` elapses) instead of assuming a fixed
 * delay: under full-suite CPU load the async file I/O can miss a fixed window,
 * which is the sole source of this suite's historical flakiness.
 */
async function loadUntilStatus(
  store: JobStateStore,
  expected: string,
  maxMs = 2000,
) {
  const deadline = Date.now() + maxMs;
  let state = await store.load();
  while (state.status !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    state = await store.load();
  }
  return state;
}

describe("createExitGuardHandler", () => {
  it("running job → transitioned to awaiting-resume", async () => {
    const jobId = "aaaaaaaa-0000-0000-0000-000000000001";
    await createJobState(tempDir, jobId, "running");

    const handler = createExitGuardHandler(tempDir);
    handler();

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await loadUntilStatus(store, "awaiting-resume");
    expect(state.status).toBe("awaiting-resume");
  });

  it("non-running job → unchanged", async () => {
    const jobId = "aaaaaaaa-0000-0000-0000-000000000002";
    await createJobState(tempDir, jobId, "awaiting-archive");

    const handler = createExitGuardHandler(tempDir);
    handler();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
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

// ---------------------------------------------------------------------------
// T-05: resumePoint 書き込みのテスト
// ---------------------------------------------------------------------------

describe("exit-guard: resumePoint が正しく書き込まれる", () => {
  it("global scan — step が truthy な running job は resumePoint が書かれる", async () => {
    const jobId = "bbbbbbbb-0000-0000-0000-000000000001";
    await createJobStateWithStep(tempDir, jobId, "running", "implementer");

    const handler = createExitGuardHandler(tempDir);
    handler();

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await loadUntilStatus(store, "awaiting-resume");

    expect(state.status).toBe("awaiting-resume");
    expect((state as Record<string, unknown>)["resumePoint"]).toBeDefined();
    const rp = (state as Record<string, unknown>)["resumePoint"] as { step: string; reason: string; iterationsExhausted: number };
    expect(rp.step).toBe("implementer");
    expect(rp.reason).toBe("signal");
    expect(rp.iterationsExhausted).toBe(0);
  });

  it("global scan — step が空文字の running job は resumePoint が書かれない", async () => {
    const jobId = "bbbbbbbb-0000-0000-0000-000000000002";
    await createJobStateWithStep(tempDir, jobId, "running", "");

    const handler = createExitGuardHandler(tempDir);
    handler();

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await loadUntilStatus(store, "awaiting-resume");

    expect(state.status).toBe("awaiting-resume");
    expect((state as Record<string, unknown>)["resumePoint"]).toBeFalsy();
  });

  it("per-job モード — step が truthy な running job は resumePoint が書かれる", async () => {
    const jobId = "cccccccc-0000-0000-0000-000000000001";
    const jobId8 = jobId.slice(0, 8);
    const slug = `guard-${jobId8}`;

    // Set up worktree dir ending with -<jobId8> inside .git/specrunner-worktrees/
    const worktreesDir = path.join(tempDir, ".git", "specrunner-worktrees");
    const worktreePath = path.join(worktreesDir, slug);
    const slugDir = path.join(worktreePath, "specrunner", "changes", slug);
    await fs.mkdir(slugDir, { recursive: true });

    const stateData = {
      version: 2,
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "implementer",
      status: "running",
      pid: 12345,
      branch: null,
      history: [],
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateData), "utf-8");
    await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

    // per-job mode: jobId provided, no noWorktree flag
    const handler = createExitGuardHandler(tempDir, jobId);
    handler();

    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: worktreePath });
    const state = await loadUntilStatus(store, "awaiting-resume");

    expect(state.status).toBe("awaiting-resume");
    expect((state as Record<string, unknown>)["resumePoint"]).toBeDefined();
    const rp = (state as Record<string, unknown>)["resumePoint"] as { step: string; reason: string; iterationsExhausted: number };
    expect(rp.step).toBe("implementer");
    expect(rp.reason).toBe("signal");
    expect(rp.iterationsExhausted).toBe(0);
  });

  it("no-worktree モード — resumePoint が書かれる", async () => {
    const jobId = "bbbbbbbb-0000-0000-0000-000000000003";
    const slug = `guard-${jobId.slice(0, 8)}`;

    // Write state directly (no liveness sidecar needed for no-worktree mode)
    const slugDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(slugDir, { recursive: true });
    const stateData = {
      version: 2,
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "build-fixer",
      status: "running",
      pid: 12345,
      branch: null,
      history: [],
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateData), "utf-8");
    await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

    const handler = createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug });
    handler();

    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await loadUntilStatus(store, "awaiting-resume");

    expect(state.status).toBe("awaiting-resume");
    expect((state as Record<string, unknown>)["resumePoint"]).toBeDefined();
    const rp = (state as Record<string, unknown>)["resumePoint"] as { step: string; reason: string; iterationsExhausted: number };
    expect(rp.step).toBe("build-fixer");
    expect(rp.reason).toBe("signal");
    expect(rp.iterationsExhausted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T-08: signal handler fired → exit-guard skips write (duplicate suppression)
// ---------------------------------------------------------------------------

describe("exit-guard: signal handler fired → duplicate interruption suppressed", () => {
  it("signal handler fired — exit-guard does NOT append interruption (events.jsonl unchanged) [no-worktree mode]", async () => {
    // TC-008: uses no-worktree mode so handleNoWorktreeExit is exercised.
    // handleNoWorktreeExit calls appendInterruption when signal NOT fired, and skips it
    // when signal IS fired — making events.jsonl the correct observable for the guard.
    // (Global scan mode never calls appendInterruption, so checking events.jsonl there
    // is vacuous; this test must use a mode where appendInterruption is on the call path.)
    const jobId = "dddddddd-0000-0000-0000-000000000001";
    const slug = `guard-${jobId.slice(0, 8)}`;

    const slugDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(slugDir, { recursive: true });
    const stateData = {
      version: 2,
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "implementer",
      status: "running",
      pid: 12345,
      branch: null,
      history: [],
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateData), "utf-8");
    await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

    const eventsPath = path.join(slugDir, "events.jsonl");
    const before = (await fs.readFile(eventsPath, "utf-8")).split("\n").filter(Boolean).length;

    // Simulate signal handler having fired
    markSignalHandlerFired();

    // no-worktree mode: handleNoWorktreeExit is invoked, which calls appendInterruption
    // when the signal guard is NOT active — but skips it when the guard IS active.
    const handler = createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug });
    handler();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = (await fs.readFile(eventsPath, "utf-8")).split("\n").filter(Boolean).length;
    // Signal guard is active — no interruption line should have been appended
    expect(after).toBe(before);
  });

  it("signal handler fired — exit-guard does NOT persist state (status stays 'running')", async () => {
    const jobId = "dddddddd-0000-0000-0000-000000000002";
    await createJobStateWithStep(tempDir, jobId, "running", "implementer");

    markSignalHandlerFired();

    const handler = createExitGuardHandler(tempDir);
    handler();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await store.load();
    // Status must NOT have been changed by exit-guard
    expect(state.status).toBe("running");
  });

  it("signal handler NOT fired — exit-guard proceeds normally (awaiting-resume)", async () => {
    const jobId = "dddddddd-0000-0000-0000-000000000003";
    await createJobStateWithStep(tempDir, jobId, "running", "implementer");

    // Do NOT call markSignalHandlerFired() — this is the non-signal exit path

    const handler = createExitGuardHandler(tempDir);
    handler();

    const slug = `guard-${jobId.slice(0, 8)}`;
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await loadUntilStatus(store, "awaiting-resume");
    expect(state.status).toBe("awaiting-resume");
  });

  it("signal handler fired — per-job mode also skips write", async () => {
    const jobId = "dddddddd-0000-0000-0000-000000000004";
    const jobId8 = jobId.slice(0, 8);
    const slug = `guard-${jobId8}`;

    const worktreesDir = path.join(tempDir, ".git", "specrunner-worktrees");
    const worktreePath = path.join(worktreesDir, slug);
    const slugDir = path.join(worktreePath, "specrunner", "changes", slug);
    await fs.mkdir(slugDir, { recursive: true });

    const stateData = {
      version: 2,
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "code-review",
      status: "running",
      pid: 12345,
      branch: null,
      history: [],
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateData), "utf-8");
    await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

    markSignalHandlerFired();

    const handler = createExitGuardHandler(tempDir, jobId);
    handler();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: worktreePath });
    const state = await store.load();
    expect(state.status).toBe("running");
  });

  it("signal handler fired — no-worktree mode also skips write", async () => {
    const jobId = "dddddddd-0000-0000-0000-000000000005";
    const slug = `guard-${jobId.slice(0, 8)}`;

    const slugDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(slugDir, { recursive: true });
    const stateData = {
      version: 2,
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "design",
      status: "running",
      pid: 12345,
      branch: null,
      history: [],
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateData), "utf-8");
    await fs.writeFile(path.join(slugDir, "events.jsonl"), "", "utf-8");

    markSignalHandlerFired();

    const handler = createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug });
    handler();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await store.load();
    expect(state.status).toBe("running");
  });
});

// ---------------------------------------------------------------------------
// TC-015: signal-state.ts module contract — initial / mark / reset cycle
// ---------------------------------------------------------------------------

describe("signal-state: module contract (TC-015)", () => {
  // afterEach in the outer scope already calls resetSignalHandlerFiredForTest(),
  // so each test starts with the flag cleared.

  it("initial state: isSignalHandlerFired() returns false", () => {
    // No call to markSignalHandlerFired() — flag must be false out of the box.
    expect(isSignalHandlerFired()).toBe(false);
  });

  it("after markSignalHandlerFired(): isSignalHandlerFired() returns true", () => {
    markSignalHandlerFired();
    expect(isSignalHandlerFired()).toBe(true);
  });

  it("after resetSignalHandlerFiredForTest(): isSignalHandlerFired() returns false again", () => {
    markSignalHandlerFired();
    expect(isSignalHandlerFired()).toBe(true); // sanity-check mark worked
    resetSignalHandlerFiredForTest();
    expect(isSignalHandlerFired()).toBe(false);
  });
});

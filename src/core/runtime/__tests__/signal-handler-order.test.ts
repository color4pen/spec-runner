/**
 * TC-016: signalCleanup calls markSignalHandlerFired() before the first await.
 *
 * Validates the ordering contract in local.ts:registerCleanup():
 *   const signalCleanup = async (): Promise<void> => {
 *     markSignalHandlerFired();      ← synchronous, before any await
 *     try {
 *       const store = makeStore();
 *       const current = await store.load();  ← first await
 *       ...
 *
 * The test mocks store.load to capture isSignalHandlerFired() at the exact
 * moment it is called, then asserts the flag was already true.
 *
 * This ordering is a future-edit risk: if markSignalHandlerFired() is moved
 * to after the first await, exit-guard's beforeExit handler can fire between
 * the signal and the flag set, causing a duplicate interruption record.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LocalRuntime } from "../local.js";
import { JobStateStore, type NormalizedJobState } from "../../../store/job-state-store.js";
import {
  isSignalHandlerFired,
  resetSignalHandlerFiredForTest,
} from "../../lifecycle/signal-state.js";

// Minimal fake state that satisfies transitionJob("running" → "awaiting-resume")
function makeFakeState(jobId: string): NormalizedJobState {
  return {
    version: 2,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "new-feature", title: "test", slug: "tc016-slug" },
    repository: { owner: "test", name: "test" },
    session: null,
    step: "implementer",
    status: "running",
    pid: null,
    branch: null,
    history: [],
    error: null,
    steps: {},
  } as unknown as NormalizedJobState;
}

describe("TC-016: signalCleanup marks signal handler fired before first await", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlerFiredForTest();
  });

  it("isSignalHandlerFired() is true when store.load() is invoked (before first await resolves)", async () => {
    const jobId = "tc016-00-0000-0000-000000000001";

    // Capture the signal-handler flag state at the moment store.load() is called
    let signalStateDuringLoad: boolean | null = null;
    vi.spyOn(JobStateStore.prototype, "load").mockImplementation(async () => {
      signalStateDuringLoad = isSignalHandlerFired();
      return makeFakeState(jobId);
    });

    // Suppress downstream I/O (appendInterruption, persist) — best-effort anyway
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);

    // Prevent actual process termination
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    // Build runtime with private workspace/slug fields populated so makeStore() works
    const runtime = new LocalRuntime({ cwd: "/tmp/tc016-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "tc016-slug";
    rt["workspace"] = { cwd: "/tmp/tc016-repo", worktreePath: undefined };

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // store.load must have been called (sanity check)
    expect(signalStateDuringLoad).not.toBeNull();
    // And the flag must have been set before load was called
    expect(signalStateDuringLoad).toBe(true);
  });
});

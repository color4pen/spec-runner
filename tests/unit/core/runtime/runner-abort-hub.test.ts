/**
 * Tests for LocalRuntime signal handler + QueryAbortHub integration (T-07).
 *
 * TC-008: SIGTERM aborts the registered query controller
 *         破壊確認: abortActive() 除去でコントローラが abort されないことを固定
 * TC-009: awaiting-resume is still persisted after abort
 * TC-010: drain timeout does not block awaiting-resume persist and exit
 *
 * Tests follow the same private-field access pattern as signal-handler-order.test.ts.
 * Tests are intentionally RED until LocalRuntime wires QueryAbortHub and signalCleanup
 * calls hub.abortActive() + hub.drain() before the persist flow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { JobStateStore, type NormalizedJobState } from "../../../../src/store/job-state-store.js";
import {
  isSignalHandlerFired,
  resetSignalHandlerFiredForTest,
} from "../../../../src/core/lifecycle/signal-state.js";
import type { QueryAbortHub } from "../../../../src/core/lifecycle/query-abort-hub.js";

function makeFakeState(jobId: string): NormalizedJobState {
  return {
    version: 2,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "new-feature", title: "test", slug: "abort-hub-slug" },
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

describe("TC-008/009/010: LocalRuntime signal handler + QueryAbortHub", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlerFiredForTest();
  });

  // TC-008
  it("TC-008: registered AbortController is aborted when signalCleanup runs (破壊確認)", async () => {
    const jobId = "tc008-00-0000-0000-000000000001";

    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: "/tmp/tc008-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "abort-hub-slug";
    rt["workspace"] = { cwd: "/tmp/tc008-repo", worktreePath: undefined };

    // Access the hub from LocalRuntime's private field
    const hub = rt["hub"] as QueryAbortHub;
    expect(hub).toBeDefined();

    // Register a controller and wire it to auto-deregister on abort (so drain resolves fast)
    const controller = new AbortController();
    const deregister = hub.register(controller);
    controller.signal.addEventListener("abort", deregister, { once: true });

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // TC-008: controller must be aborted
    // 破壊確認: if hub.abortActive() is removed from signalCleanup, this assertion fails
    expect(controller.signal.aborted).toBe(true);
  });

  // TC-009
  it("TC-009: awaiting-resume is persisted after abort hub drains", async () => {
    const jobId = "tc009-00-0000-0000-000000000001";

    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    const persistSpy = vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: "/tmp/tc009-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "abort-hub-slug";
    rt["workspace"] = { cwd: "/tmp/tc009-repo", worktreePath: undefined };

    // Register a controller that auto-deregisters on abort so drain is fast
    const hub = rt["hub"] as QueryAbortHub;
    const controller = new AbortController();
    const deregister = hub.register(controller);
    controller.signal.addEventListener("abort", deregister, { once: true });

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // TC-009: awaiting-resume state must be persisted after abort+drain
    expect(persistSpy).toHaveBeenCalled();
    const persistedState = persistSpy.mock.calls[0]?.[0];
    expect(persistedState?.status).toBe("awaiting-resume");
  });

  // TC-010
  it("TC-010: drain timeout does not block awaiting-resume persist and exit", async () => {
    vi.useFakeTimers();
    const jobId = "tc010-00-0000-0000-000000000001";

    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    const persistSpy = vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: "/tmp/tc010-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "abort-hub-slug";
    rt["workspace"] = { cwd: "/tmp/tc010-repo", worktreePath: undefined };

    // Register a controller that NEVER deregisters — simulates a stuck query
    const hub = rt["hub"] as QueryAbortHub;
    const stuckController = new AbortController();
    hub.register(stuckController);
    // NOTE: intentionally not wiring auto-deregister — drain must time out

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    // Run signalCleanup and advance all timers so the drain timeout fires
    const cleanupPromise = signalCleanup();
    await vi.runAllTimersAsync();
    await cleanupPromise;

    // TC-010: persist must still be called even after drain timed out
    expect(persistSpy).toHaveBeenCalled();
    const persistedState = persistSpy.mock.calls[0]?.[0];
    expect(persistedState?.status).toBe("awaiting-resume");

    vi.useRealTimers();
  });

  // Regression: markSignalHandlerFired still runs before first await (TC-016 invariant preserved)
  it("isSignalHandlerFired() is true before first await even with hub drain", async () => {
    const jobId = "tc-hub-016-0000-0000-000000000001";
    let signalStateDuringLoad: boolean | null = null;

    vi.spyOn(JobStateStore.prototype, "load").mockImplementation(async () => {
      signalStateDuringLoad = isSignalHandlerFired();
      return makeFakeState(jobId);
    });
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: "/tmp/tc-hub-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "abort-hub-slug";
    rt["workspace"] = { cwd: "/tmp/tc-hub-repo", worktreePath: undefined };

    // Auto-deregistering controller so drain resolves fast
    const hub = rt["hub"] as QueryAbortHub;
    const controller = new AbortController();
    const deregister = hub.register(controller);
    controller.signal.addEventListener("abort", deregister, { once: true });

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    expect(signalStateDuringLoad).not.toBeNull();
    expect(signalStateDuringLoad).toBe(true);
  });
});

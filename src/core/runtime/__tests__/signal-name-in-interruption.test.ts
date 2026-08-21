/**
 * Pinning tests for signal-name-in-interruption:
 *
 * TC-001–TC-003: SIGINT/SIGTERM/SIGHUP → appendInterruption called with signal field (local runtime)
 * TC-005, TC-007: transition message includes signal name (local runtime)
 * TC-006, TC-008, TC-009: transition message includes signal name (managed runtime)
 * TC-010: resumePoint.reason unchanged in local runtime (SIGTERM)
 * TC-011: resumePoint.reason unchanged in managed runtime (SIGTERM)
 * TC-013–TC-016: SIGHUP handler registration and deregistration in both runtimes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LocalRuntime } from "../local.js";
import { ManagedRuntime } from "../managed.js";
import { JobStateStore, type NormalizedJobState } from "../../../store/job-state-store.js";
import { resetSignalHandlerFiredForTest } from "../../lifecycle/signal-state.js";
import { createExitGuardHandler } from "../../lifecycle/exit-guard.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";

// Increase listener limit to suppress MaxListenersExceededWarning in tests
// that register signal handlers on multiple runtime instances.
process.setMaxListeners(50);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JOB_ID = "signal-00-0000-0000-000000000001";
const SLUG = "signal-test-slug";

/** Minimal fake state that satisfies transitionJob("running" → "awaiting-resume") */
function makeFakeState(jobId: string): NormalizedJobState {
  return {
    version: 2,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "bug-fix", title: "test", slug: SLUG },
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

function makeLocalRuntime(): LocalRuntime {
  const runtime = new LocalRuntime({ cwd: "/tmp/signal-test-repo", githubClient: {} as never });
  const rt = runtime as unknown as Record<string, unknown>;
  rt["currentSlug"] = SLUG;
  rt["workspace"] = { cwd: "/tmp/signal-test-repo", worktreePath: undefined };
  return runtime;
}

function makeManagedRuntime(): ManagedRuntime {
  const mockGithubClient = {} as unknown as GitHubClient;
  const mockSessionClient = {} as unknown as SessionClient;
  const repo: OriginInfo = { owner: "testowner", name: "testrepo" };
  const runtime = new ManagedRuntime(
    "/tmp/signal-test-repo",
    mockSessionClient,
    mockGithubClient,
    repo,
    undefined,
    "fake-token",
  );
  const mr = runtime as unknown as Record<string, unknown>;
  mr["currentSlug"] = SLUG;
  return runtime;
}

// ---------------------------------------------------------------------------
// LocalRuntime: signal name in interruption record and transition message
// ---------------------------------------------------------------------------

describe("LocalRuntime: signal name in interruption record and transition message", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlerFiredForTest();
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    it(`${signal}: appendInterruption receives { signal: "${signal}", reason: "signal", type: "interruption" }`, async () => {
      const appendInterruptionSpy = vi
        .spyOn(JobStateStore.prototype, "appendInterruption")
        .mockResolvedValue(undefined);
      vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
      vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
      vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const runtime = makeLocalRuntime();
      const handle = runtime.registerCleanup(JOB_ID, "implementer");
      const { signalCleanup } = handle as unknown as {
        signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
      };

      await signalCleanup(signal);
      // Deregister handlers to avoid leaking listeners across tests
      await runtime.teardown(handle, "awaiting-archive");

      expect(appendInterruptionSpy).toHaveBeenCalledOnce();
      const record = appendInterruptionSpy.mock.calls[0]![0];
      expect(record.type).toBe("interruption");
      expect(record.reason).toBe("signal");
      expect(record.signal).toBe(signal);
    });

    it(`${signal}: transition history message contains "${signal}"`, async () => {
      vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
      vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
      const persistSpy = vi
        .spyOn(JobStateStore.prototype, "persist")
        .mockResolvedValue(undefined);
      vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const runtime = makeLocalRuntime();
      const handle = runtime.registerCleanup(JOB_ID, "implementer");
      const { signalCleanup } = handle as unknown as {
        signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
      };

      await signalCleanup(signal);
      // Deregister handlers to avoid leaking listeners across tests
      await runtime.teardown(handle, "awaiting-archive");

      expect(persistSpy).toHaveBeenCalledOnce();
      const persistedState = persistSpy.mock.calls[0]![0] as NormalizedJobState;
      const lastEntry = persistedState.history?.at(-1);
      expect(lastEntry?.message).toContain(signal);
      expect(lastEntry?.message).toContain(`Interrupted by ${signal}`);
    });
  }

  it("SIGTERM: reason field in interruption record is 'signal' (backward-compat pin)", async () => {
    const appendInterruptionSpy = vi
      .spyOn(JobStateStore.prototype, "appendInterruption")
      .mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = makeLocalRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");
    const { signalCleanup } = handle as unknown as {
      signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
    };

    await signalCleanup("SIGTERM");
    await runtime.teardown(handle, "awaiting-archive");

    const record = appendInterruptionSpy.mock.calls[0]![0];
    expect(record.reason).toBe("signal");
  });

  it("TC-010: SIGTERM: resumePoint.reason remains 'Interrupted by signal' (not changed to signal name)", async () => {
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
    const persistSpy = vi
      .spyOn(JobStateStore.prototype, "persist")
      .mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = makeLocalRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");
    const { signalCleanup } = handle as unknown as {
      signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
    };

    await signalCleanup("SIGTERM");
    await runtime.teardown(handle, "awaiting-archive");

    const persistedState = persistSpy.mock.calls[0]![0] as NormalizedJobState & {
      resumePoint?: { reason: string };
    };
    expect(persistedState.resumePoint?.reason).toBe("Interrupted by signal");
  });
});

// ---------------------------------------------------------------------------
// LocalRuntime: SIGHUP handler registration and deregistration (TC-013, TC-014)
// ---------------------------------------------------------------------------

describe("LocalRuntime: SIGHUP handler registration and deregistration", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlerFiredForTest();
  });

  it("TC-013: registerCleanup calls process.on('SIGHUP', signalCleanup)", () => {
    const onSpy = vi.spyOn(process, "on");

    const runtime = makeLocalRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");

    const sighupCalls = onSpy.mock.calls.filter((c) => c[0] === "SIGHUP");
    expect(sighupCalls.length).toBeGreaterThanOrEqual(1);

    // Clean up handlers to avoid leaking into other tests
    // teardown deregisters all three handlers
    const internals = handle as unknown as {
      signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
    };
    process.off("SIGINT", internals.signalCleanup);
    process.off("SIGTERM", internals.signalCleanup);
    process.off("SIGHUP", internals.signalCleanup);
  });

  it("TC-014: teardown calls process.off('SIGHUP', signalCleanup)", async () => {
    const offSpy = vi.spyOn(process, "off");

    const runtime = makeLocalRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");

    // Clear spy calls accumulated during registerCleanup (none expected, but be safe)
    offSpy.mockClear();

    // teardown deregisters SIGINT, SIGTERM, SIGHUP
    await runtime.teardown(handle, "awaiting-archive");

    const sighupCalls = offSpy.mock.calls.filter((c) => c[0] === "SIGHUP");
    expect(sighupCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime: signal name in transition message (TC-006, TC-008, TC-009)
// ---------------------------------------------------------------------------

describe("ManagedRuntime: signal name in transition message", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    it(`${signal}: transition history message contains "${signal}"`, async () => {
      vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
      const persistSpy = vi
        .spyOn(JobStateStore.prototype, "persist")
        .mockResolvedValue(undefined);
      vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const runtime = makeManagedRuntime();
      const handle = runtime.registerCleanup(JOB_ID, "implementer");
      const { signalCleanup } = handle as unknown as {
        signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
      };

      await signalCleanup(signal);
      // Deregister handlers to avoid leaking listeners across tests
      await runtime.teardown(handle, "done");

      expect(persistSpy).toHaveBeenCalledOnce();
      const persistedState = persistSpy.mock.calls[0]![0] as NormalizedJobState;
      const lastEntry = persistedState.history?.at(-1);
      expect(lastEntry?.message).toContain(signal);
      expect(lastEntry?.message).toContain(`Interrupted by ${signal}`);
    });
  }

  it("TC-011: SIGTERM: resumePoint.reason remains 'Interrupted by signal' (managed runtime)", async () => {
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
    const persistSpy = vi
      .spyOn(JobStateStore.prototype, "persist")
      .mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = makeManagedRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");
    const { signalCleanup } = handle as unknown as {
      signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
    };

    await signalCleanup("SIGTERM");
    await runtime.teardown(handle, "done");

    const persistedState = persistSpy.mock.calls[0]![0] as NormalizedJobState & {
      resumePoint?: { reason: string };
    };
    expect(persistedState.resumePoint?.reason).toBe("Interrupted by signal");
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime: SIGHUP handler registration and deregistration (TC-015, TC-016)
// ---------------------------------------------------------------------------

describe("ManagedRuntime: SIGHUP handler registration and deregistration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-015: registerCleanup calls process.on('SIGHUP', signalCleanup)", () => {
    const onSpy = vi.spyOn(process, "on");

    const runtime = makeManagedRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");

    const sighupCalls = onSpy.mock.calls.filter((c) => c[0] === "SIGHUP");
    expect(sighupCalls.length).toBeGreaterThanOrEqual(1);

    // Clean up registered handlers
    const internals = handle as unknown as {
      signalCleanup: (signal: NodeJS.Signals) => Promise<void>;
    };
    process.off("SIGINT", internals.signalCleanup);
    process.off("SIGTERM", internals.signalCleanup);
    process.off("SIGHUP", internals.signalCleanup);
  });

  it("TC-016: teardown calls process.off('SIGHUP', signalCleanup)", async () => {
    const offSpy = vi.spyOn(process, "off");

    const runtime = makeManagedRuntime();
    const handle = runtime.registerCleanup(JOB_ID, "implementer");

    offSpy.mockClear();

    await runtime.teardown(handle, "done");

    const sighupCalls = offSpy.mock.calls.filter((c) => c[0] === "SIGHUP");
    expect(sighupCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TC-004: exit-guard fires (no signal handler ran) — signal field absent
// ---------------------------------------------------------------------------

describe("TC-004: exit-guard fires (no signal handler ran) — signal field absent", () => {
  beforeEach(() => {
    // Ensure signal handler has NOT fired — exit-guard should proceed normally
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlerFiredForTest();
  });

  it("appendInterruption called by exit-guard has no 'signal' field", async () => {
    const appendInterruptionSpy = vi
      .spyOn(JobStateStore.prototype, "appendInterruption")
      .mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(JOB_ID));
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // no-worktree mode invokes handleNoWorktreeExit which calls appendInterruption
    const handler = createExitGuardHandler("/fake/repo", JOB_ID, { noWorktree: true, slug: SLUG });
    handler();

    // The handler is fire-and-forget async; wait for microtasks/macrotasks to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(appendInterruptionSpy).toHaveBeenCalledOnce();
    const record = appendInterruptionSpy.mock.calls[0]![0];
    expect(record.type).toBe("interruption");
    expect(record.reason).toBe("signal");
    // exit-guard does NOT know which signal fired — signal field must be absent
    expect(record).not.toHaveProperty("signal");
  });
});

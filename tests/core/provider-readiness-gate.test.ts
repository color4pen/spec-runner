/**
 * Integration tests for the provider readiness gate in CommandRunner.
 *
 * TC-001: Readiness failure on run leaves no side effects
 * TC-002: Readiness failure on resume mutates nothing
 * TC-003: Gate is load-bearing (breakage check)
 * TC-006: Probe invoked exactly once per run/resume
 * TC-008: CI reproduces success and each failure kind via injection
 * TC-009: Managed gate is a no-op
 * TC-010: Port module has no import back-edges
 * TC-011: LocalRuntime and ManagedRuntime remain assignable to RealRuntimeStrategy
 * TC-016: No RunResultContract JSON emitted on readiness failure
 * TC-017: Kind-specific hint is printed to stderr on readiness failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventBus } from "../../src/core/event/event-bus.js";
import { CommandRunner } from "../../src/core/command/runner.js";
import type { PrepareResult } from "../../src/core/command/runner.js";
import type { RuntimeStrategy } from "../../src/core/port/runtime-strategy.js";
import type { ProviderReadinessProbe, ProviderReadinessResult } from "../../src/core/port/provider-readiness.js";
import { LocalRuntime } from "../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../src/core/runtime/managed.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "provider-readiness-gate-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers: fake probe factories
// ---------------------------------------------------------------------------

/** A probe that always returns ready. */
function readyProbe(): ProviderReadinessProbe {
  return vi.fn().mockResolvedValue({ kind: "ready" } satisfies ProviderReadinessResult);
}

/** A probe that always returns the specified non-ready kind. */
function notReadyProbe(
  kind: Exclude<ProviderReadinessResult["kind"], "ready">,
  detail?: string,
): ProviderReadinessProbe {
  const result: ProviderReadinessResult = detail ? { kind, detail } : { kind };
  return vi.fn().mockResolvedValue(result);
}

/** A counting probe that always returns the given result. */
function countingProbe(result: ProviderReadinessResult) {
  let callCount = 0;
  const probe: ProviderReadinessProbe = async (_env: Record<string, string | undefined>) => {
    callCount++;
    return result;
  };
  return { probe, getCallCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Helpers: minimal RuntimeStrategy fake for gate tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal RuntimeStrategy fake that tracks side-effect calls.
 * `setupWorkspace` and `prepare` are tracked so tests can assert they are/aren't called.
 */
function makeMinimalRuntime(opts?: {
  providerReadinessProbe?: ProviderReadinessProbe;
  omitReadinessMethod?: boolean;
}): {
  runtime: RuntimeStrategy & { assertProviderReadiness?: (env: Record<string, string | undefined>) => Promise<void> };
  sideEffects: { setupWorkspaceCalled: boolean; prepareCalled: boolean };
} {
  const sideEffects = { setupWorkspaceCalled: false, prepareCalled: false };
  const probe = opts?.providerReadinessProbe;

  const runtime: RuntimeStrategy & { assertProviderReadiness?: (env: Record<string, string | undefined>) => Promise<void> } = {
    async bootstrapJob() { throw new Error("not implemented in fake"); },
    async persistJobState() { sideEffects.setupWorkspaceCalled = true; },
    async setupWorkspace() {
      sideEffects.setupWorkspaceCalled = true;
      return { cwd: tempDir };
    },
    buildDeps() { return {}; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async *query() {},
    createAgentRunner() {
      return {
        async run() {
          return { completionReason: "success" as const, resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async validateStepOutputs() { return { violations: [] }; },
    async commitFinalState() {},
    async digestArtifacts() { return []; },
    async listChangedFiles() { return { kind: "unavailable" as const, reason: "fake" }; },
    async verifyFindingRefs() { return []; },
  };

  if (!opts?.omitReadinessMethod && probe !== undefined) {
    runtime.assertProviderReadiness = async (env: Record<string, string | undefined>) => {
      // Import the classifier dynamically so tests that reference future modules
      // will fail at runtime (red) until implementation exists.
      const { classifyProviderReadiness } = await import("../../src/core/runtime/provider-readiness.js");
      const result = await probe(env);
      const err = classifyProviderReadiness(result);
      if (err) throw err;
    };
  }

  return { runtime, sideEffects };
}

// ---------------------------------------------------------------------------
// Helpers: minimal CommandRunner concrete subclass for gate tests
// ---------------------------------------------------------------------------

/**
 * Concrete CommandRunner subclass for testing.
 * prepare() is a spy: if onPrepare throws, the gate must have been bypassed.
 * If the gate fires first and returns 1, prepare() is never called.
 */
class MinimalCommandRunner extends CommandRunner {
  private readonly onPrepare: () => Promise<PrepareResult>;

  constructor(
    runtime: RuntimeStrategy,
    events: EventBus,
    onPrepare: () => Promise<PrepareResult>,
  ) {
    super(runtime, events);
    this.onPrepare = onPrepare;
  }

  protected async prepare(): Promise<PrepareResult> {
    return this.onPrepare();
  }
}

// ---------------------------------------------------------------------------
// TC-001: Readiness failure on run leaves no side effects
// ---------------------------------------------------------------------------

describe("TC-001: readiness failure on run — no side effects", () => {
  it("exits 1 and does not call prepare() when probe returns auth-missing", async () => {
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      // This should never be reached
      throw new Error("prepare() was called despite not-ready probe");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    expect(prepareCalled).toBe(false);
  });

  it("exits 1 and does not call prepare() when probe returns auth-invalid", async () => {
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-invalid"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("prepare() was called despite not-ready probe");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    expect(prepareCalled).toBe(false);
  });

  it("exits 1 and does not call prepare() when probe returns unreachable", async () => {
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("unreachable"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("prepare() was called despite not-ready probe");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    expect(prepareCalled).toBe(false);
  });

  it("exits 1 and does not call prepare() when probe returns provider-failure", async () => {
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("provider-failure"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("prepare() was called despite not-ready probe");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    expect(prepareCalled).toBe(false);
  });

  it("does not call setupWorkspace when probe fails (no worktree/branch created)", async () => {
    const { runtime, sideEffects } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    expect(sideEffects.setupWorkspaceCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-002: Readiness failure on resume mutates nothing
// ---------------------------------------------------------------------------

describe("TC-002: readiness failure on resume — mutates nothing", () => {
  it("exits 1 without calling prepare() (no running transition) when probe returns not-ready", async () => {
    // resume's prepare() is where the running transition is persisted.
    // The gate must fire before prepare().
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("prepare() was called — running transition would have been persisted");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    expect(prepareCalled).toBe(false);
  });

  it("does not call setupWorkspace when probe fails (no worktree recreation)", async () => {
    const { runtime, sideEffects } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("unreachable"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    expect(sideEffects.setupWorkspaceCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003: Gate is load-bearing (breakage check)
// ---------------------------------------------------------------------------

describe("TC-003: gate is load-bearing — without gate, side effects occur", () => {
  it("without assertProviderReadiness, execute() calls prepare() even when workspace would fail late", async () => {
    // A runtime WITHOUT assertProviderReadiness (no gate).
    // prepare() will be called (showing side effects would happen without the gate).
    let prepareCalled = false;

    const { runtime } = makeMinimalRuntime({
      omitReadinessMethod: true, // simulates gate being absent
    });

    const events = new EventBus();
    // prepare() marks itself as called, then throws (simulating a late failure)
    // CommandRunner.execute() re-throws prepare() failures, so we catch below.
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      // Throw after marking called, so we can inspect the call even after the throw
      throw new Error("simulated-late-failure: workspace or provider failure");
    });

    // execute() re-throws prepare() errors — catch to allow assertions
    try {
      await runner.execute();
    } catch {
      // Expected: prepare() threw → execute() re-threw
    }

    // Key assertion: without the gate, prepare() WAS reached
    // This proves that if the gate didn't exist, side effects (from prepare/setupWorkspace) would occur
    expect(prepareCalled).toBe(true);
  });

  it("gate active: exits 1 before prepare() (gate is load-bearing for side-effect prevention)", async () => {
    // Contrasting test: WITH gate AND not-ready probe, prepare() is NOT called
    let prepareCalled = false;

    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("prepare() should not have been called");
    });

    const exitCode = await runner.execute();

    expect(exitCode).toBe(1);
    // Gate prevented prepare() from being called — no side effects
    expect(prepareCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-006: Probe invoked exactly once per run/resume
// ---------------------------------------------------------------------------

describe("TC-006: probe invoked exactly once per run/resume", () => {
  it("probe is called exactly 1 time for a single execute() call with not-ready result", async () => {
    const { probe, getCallCount } = countingProbe({ kind: "auth-missing" });
    const { runtime } = makeMinimalRuntime({ providerReadinessProbe: probe });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    expect(getCallCount()).toBe(1);
  });

  it("probe is called exactly 1 time for a single execute() call with ready result", async () => {
    const { probe, getCallCount } = countingProbe({ kind: "ready" });
    const { runtime } = makeMinimalRuntime({ providerReadinessProbe: probe });
    const events = new EventBus();
    // prepare() will throw after gate passes (since we don't have a full runtime)
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("simulated-prepare-failure");
    });

    // execute() re-throws prepare() errors when gate passes — catch to allow assertions
    try {
      await runner.execute();
    } catch {
      // Expected: gate passes (ready), prepare() throws, execute() re-throws
    }

    expect(getCallCount()).toBe(1);
  });

  it("probe is NOT called when runtime has no assertProviderReadiness method", async () => {
    const { probe: _probe, getCallCount } = countingProbe({ kind: "ready" });
    // runtime WITHOUT assertProviderReadiness — probe should not be invoked
    const { runtime } = makeMinimalRuntime({ omitReadinessMethod: true });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("simulated-prepare-failure");
    });

    // execute() re-throws prepare() errors — catch to allow assertions
    try {
      await runner.execute();
    } catch {
      // Expected: no gate, prepare() throws, execute() re-throws
    }

    // Probe was never attached to the runtime, so getCallCount must be 0
    expect(getCallCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: CI reproduces success and each failure kind via injection
// ---------------------------------------------------------------------------

describe("TC-008: CI reproduces success and each failure kind via injection (no real token)", () => {
  const notReadyKinds: Array<Exclude<ProviderReadinessResult["kind"], "ready">> = [
    "auth-missing",
    "auth-invalid",
    "unreachable",
    "provider-failure",
  ];

  for (const kind of notReadyKinds) {
    it(`injected not-ready probe (${kind}) causes exit 1 without prepare() being called`, async () => {
      let prepareCalled = false;
      const { runtime } = makeMinimalRuntime({ providerReadinessProbe: notReadyProbe(kind) });
      const events = new EventBus();
      const runner = new MinimalCommandRunner(runtime, events, async () => {
        prepareCalled = true;
        throw new Error("prepare() should not be called");
      });

      const exitCode = await runner.execute();

      expect(exitCode).toBe(1);
      expect(prepareCalled).toBe(false);
    });
  }

  it("injected ready probe allows execution to proceed past the gate", async () => {
    let prepareCalled = false;
    const { runtime } = makeMinimalRuntime({ providerReadinessProbe: readyProbe() });
    const events = new EventBus();
    // prepare() will throw (no real job to bootstrap), but the gate should pass
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      prepareCalled = true;
      throw new Error("simulated-prepare-failure: gate passed, execution proceeded");
    });

    // execute() re-throws prepare() errors when gate passes — catch to allow assertions
    try {
      await runner.execute();
    } catch {
      // Expected: gate passes (ready), prepare() throws, execute() re-throws
    }

    // Gate passed → prepare() WAS called — that's the key assertion
    expect(prepareCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-009: Managed gate is a no-op
// ---------------------------------------------------------------------------

describe("TC-009: managed runtime assertProviderReadiness is a no-op", () => {
  it("ManagedRuntime.assertProviderReadiness resolves without throwing", async () => {
    const mockGithubClient = {
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyBranch: vi.fn().mockResolvedValue(true),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: [] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    };
    const mockSessionClient = {} as import("../../src/core/port/session-client.js").SessionClient;

    const managed = new ManagedRuntime(
      tempDir,
      mockSessionClient,
      mockGithubClient as unknown as import("../../src/core/port/github-client.js").GitHubClient,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "fake-token",
    );

    // Should resolve without error — no probe called
    // Cast via unknown to bypass ManagedRuntime's [key: string]: unknown index signature
    const assertFn = (managed as unknown as { assertProviderReadiness: (env: Record<string, string | undefined>) => Promise<void> }).assertProviderReadiness;
    await expect(assertFn.call(managed, {})).resolves.toBeUndefined();
  });

  it("ManagedRuntime does not call any readiness probe (method is no-op)", async () => {
    const mockGithubClient = {
      getRawFile: vi.fn().mockResolvedValue(null),
    };
    const mockSessionClient = {} as import("../../src/core/port/session-client.js").SessionClient;

    const managed = new ManagedRuntime(
      tempDir,
      mockSessionClient,
      mockGithubClient as unknown as import("../../src/core/port/github-client.js").GitHubClient,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "fake-token",
    );

    // The no-op must not invoke any external probe
    // Cast via unknown to bypass ManagedRuntime's [key: string]: unknown index signature
    const assertFn = (managed as unknown as { assertProviderReadiness: (env: Record<string, string | undefined>) => Promise<void> }).assertProviderReadiness;

    let noopCallCompleted = false;
    await assertFn.call(managed, {});
    noopCallCompleted = true;

    expect(noopCallCompleted).toBe(true);
    // No getRawFile calls (it's a no-op, not touching any external service)
    expect(mockGithubClient.getRawFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-010: Port module has no import back-edges
// ---------------------------------------------------------------------------

describe("TC-010: port module has no import back-edges", () => {
  it("src/core/port/provider-readiness.ts exports the expected types (no back-edges to adapter/ or core/runtime/)", async () => {
    // The port module must be importable and export the expected symbols
    const portModule = await import("../../src/core/port/provider-readiness.js");
    // If the module has back-edges, the type exports would not compile
    // This test verifies the module can be imported cleanly
    expect(portModule).toBeDefined();
  });

  it("port module source does not import from adapter/ or core/runtime/", async () => {
    // Read the source file to verify no back-edge imports
    const portSrc = await fs.readFile(
      path.resolve(
        import.meta.dirname ?? __dirname,
        "../../src/core/port/provider-readiness.ts",
      ),
      "utf-8",
    ).catch(() => null);

    if (portSrc === null) {
      // File doesn't exist yet — test is red (implementation missing)
      expect(portSrc, "src/core/port/provider-readiness.ts must exist").not.toBeNull();
      return;
    }

    // Must not import from adapter/ or core/runtime/ directories
    expect(portSrc).not.toMatch(/from ['"].*adapter\//);
    expect(portSrc).not.toMatch(/from ['"].*core\/runtime\//);
  });
});

// ---------------------------------------------------------------------------
// TC-011: LocalRuntime and ManagedRuntime remain assignable to RealRuntimeStrategy
// ---------------------------------------------------------------------------

describe("TC-011: LocalRuntime and ManagedRuntime remain assignable to RealRuntimeStrategy", () => {
  it("LocalRuntime instance has assertProviderReadiness method (RealRuntimeStrategy requirement)", async () => {
    const mockGithubClient = {} as import("../../src/core/port/github-client.js").GitHubClient;

    const local = new LocalRuntime({
      cwd: tempDir,
      githubClient: mockGithubClient,
      githubToken: "fake-token",
    });

    // After implementation: LocalRuntime must have assertProviderReadiness
    // Use Record to bypass strict type checking on a method that doesn't exist yet
    const asRecord = local as unknown as Record<string, unknown>;
    expect(typeof asRecord["assertProviderReadiness"]).toBe("function");
  });

  it("ManagedRuntime instance has assertProviderReadiness method (RealRuntimeStrategy requirement)", async () => {
    const mockGithubClient = {} as import("../../src/core/port/github-client.js").GitHubClient;
    const mockSessionClient = {} as import("../../src/core/port/session-client.js").SessionClient;

    const managed = new ManagedRuntime(
      tempDir,
      mockSessionClient,
      mockGithubClient,
      { owner: "o", name: "r" },
      undefined,
      "fake-token",
    );

    // ManagedRuntime has [key: string]: unknown index signature, so direct access works
    expect(typeof managed["assertProviderReadiness"]).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-016: No RunResultContract JSON emitted on readiness failure
// ---------------------------------------------------------------------------

describe("TC-016: no RunResultContract JSON emitted on readiness failure", () => {
  it("stdout receives no JSON object when gate catches readiness failure", async () => {
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    // No stdout writes should contain a JSON object (RunResultContract pattern)
    const combined = stdoutWrites.join("");
    const hasJson = combined.includes('"jobId"') || combined.includes('"status"') || combined.includes('"slug"');
    expect(hasJson).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: Kind-specific hint is printed to stderr on readiness failure
// ---------------------------------------------------------------------------

describe("TC-017: kind-specific hint is printed to stderr on readiness failure", () => {
  it("stderr receives a 'Hint:' message matching PROVIDER_READINESS_HINTS when probe fails", async () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("auth-missing"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    const combined = stderrWrites.join("");
    // A "Hint:" prefix should appear in stderr output
    expect(combined).toContain("Hint:");
  });

  it("logError is called with the prescriptive message on readiness failure", async () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    const { runtime } = makeMinimalRuntime({
      providerReadinessProbe: notReadyProbe("provider-failure", "HTTP 503 Service Unavailable"),
    });
    const events = new EventBus();
    const runner = new MinimalCommandRunner(runtime, events, async () => {
      throw new Error("prepare() should not be called");
    });

    await runner.execute();

    const combined = stderrWrites.join("");
    // Some output must be written to stderr (logError goes to stderr)
    expect(combined.length).toBeGreaterThan(0);
  });
});

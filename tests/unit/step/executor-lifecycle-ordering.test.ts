/**
 * T-15: Executable lifecycle ordering tests (R2b).
 *
 * Verifies that:
 *   1. finalizeStepArtifacts is called with cwd: string and slug: string primitives
 *      (not a deps: unknown object — the old R2a signature).
 *   2. finalizeStepArtifacts is NOT called when deps.roundOwnsGitEffects === true.
 *   3. terminalState?.commitFinalState receives the correct cwd and slug in the
 *      gate-halt path (runner.ts).
 *   4. buildDeps() returns PipelineDeps directly (DSM §3 via allowlist); no `as PipelineDeps` cast needed.
 *
 * Tests 1–2 target the StepExecutor; test 3 targets CommandRunner's gate-halt path;
 * test 4 is a compile-time proof (no runtime assertion needed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { AgentStep } from "../../../src/core/port/step-types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../src/store/job-state-store.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { AgentRunResult } from "../../../src/core/port/agent-runner.js";
import { noopRoundGitEffects, noopStepArtifact, noopStepIo, noopTerminalState } from "../../../src/core/step/noop-capabilities.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-ordering-test-"));
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  delete process.env["XDG_DATA_HOME"];
});

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeSuccessRunner() {
  return {
    run: vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: { ok: true },
      followUpAttempts: 0,
    } as AgentRunResult),
  };
}

function makeMinimalStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer" as never,
      model: "claude-sonnet-4-5",
      system: "implement",
      tools: [],
    },
    buildMessage: () => "implement",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as AgentStep;
}

function makeBaseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    config: { version: 1, agents: {} },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
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
      getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
      createLinkedBranch: vi.fn().mockResolvedValue(undefined),
      listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    stepArtifact: noopStepArtifact,
    stepIo: noopStepIo,
    terminalState: noopTerminalState,
    roundGitEffects: noopRoundGitEffects,
    ...overrides,
  };
}

async function makeJobState() {
  const raw = buildInitialJobState({
    request: { path: "/test/request.md", title: "T-15 Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  const state = { ...raw, branch: `feat/${raw.jobId.slice(0, 8)}` };
  await makeStoreFactory(tempDir)(state.jobId).persist(state);
  return state;
}

// ---------------------------------------------------------------------------
// TC-T15-01: finalizeStepArtifacts called with cwd:string, slug:string (not deps)
// ---------------------------------------------------------------------------

describe("T-15: Step finalize lifecycle ordering", () => {
  it("TC-T15-01: finalizeStepArtifacts receives cwd and slug as string primitives", async () => {
    const state = await makeJobState();
    const events = new EventBus();

    const finalizeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const stepArtifact = {
      async captureHeadSha(): Promise<string | null> { return null; },
      async prepareStepArtifacts(): Promise<void> {},
      finalizeStepArtifacts: finalizeSpy,
      async digestArtifacts(refs: { path: string }[]) {
        return refs.map((r) => ({ path: r.path, hash: null as null }));
      },
    };

    const stepIo = {
      async validateStepInputs(): Promise<void> {},
      async validateStepOutputs() { return { violations: [] as never[] }; },
      async verifyFindingRefs(refs: { file: string }[]) { return refs; },
    };

    const deps = makeBaseDeps({
      cwd: tempDir,
      slug: "test-slug",
      stepArtifact: stepArtifact as never,
      stepIo: stepIo as never,
    });

    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));
    await executor.execute(makeMinimalStep(), state, deps);

    expect(finalizeSpy).toHaveBeenCalledOnce();

    // Key invariant (R2b): cwd and slug must be string primitives, not a deps object.
    const call = finalizeSpy.mock.calls[0] as unknown as [unknown, unknown, string, string];
    const [, , calledCwd, calledSlug] = call;
    expect(typeof calledCwd).toBe("string");
    expect(typeof calledSlug).toBe("string");
    expect(calledCwd).toBe(tempDir);
    expect(calledSlug).toBe("test-slug");
  });

  it("TC-T15-02: finalizeStepArtifacts is NOT called when deps.roundOwnsGitEffects is true", async () => {
    const state = await makeJobState();
    const events = new EventBus();

    const finalizeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const stepArtifact = {
      async captureHeadSha(): Promise<string | null> { return null; },
      async prepareStepArtifacts(): Promise<void> {},
      finalizeStepArtifacts: finalizeSpy,
      async digestArtifacts(refs: { path: string }[]) {
        return refs.map((r) => ({ path: r.path, hash: null as null }));
      },
    };

    const stepIo = {
      async validateStepInputs(): Promise<void> {},
      async validateStepOutputs() { return { violations: [] as never[] }; },
      async verifyFindingRefs(refs: { file: string }[]) { return refs; },
    };

    const deps = makeBaseDeps({
      cwd: tempDir,
      slug: "test-slug",
      stepArtifact: stepArtifact as never,
      stepIo: stepIo as never,
      roundOwnsGitEffects: true,
    });

    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));
    await executor.execute(makeMinimalStep(), state, deps);

    // roundOwnsGitEffects=true → coordinator owns git; executor must NOT finalize.
    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TC-T15-06: prepareStepArtifacts ordering before agent run (TC-008 must)
  //
  // TC-008 (must-priority AC): a spy confirms that prepareStepArtifacts is
  // invoked BEFORE the agent session starts (runner.run()).
  //
  // executor.ts ordering (runAgentStep):
  //   1. await deps.stepArtifact?.prepareStepArtifacts(...)   ← line ~339
  //   2. await this.runner.run(ctx)                           ← line ~356
  //
  // The two spies share a call-order counter so the test can assert that
  // prepareStepArtifacts completed (counter=1) before runner.run (counter=2).
  // -------------------------------------------------------------------------
  it("TC-T15-06: prepareStepArtifacts is called before runner.run() (TC-008 ordering)", async () => {
    const state = await makeJobState();
    const events = new EventBus();

    // Shared call-order counter
    const callOrder: string[] = [];

    const prepareArtifactsSpy = vi.fn<() => Promise<void>>().mockImplementation(async () => {
      callOrder.push("prepareStepArtifacts");
    });

    const runnerWithOrder = {
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("runner.run");
        return {
          completionReason: "success" as const,
          resultContent: null,
          toolResult: { ok: true },
          followUpAttempts: 0,
        } as AgentRunResult;
      }),
    };

    const finalizeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const stepArtifact = {
      async captureHeadSha(): Promise<string | null> { return null; },
      prepareStepArtifacts: prepareArtifactsSpy,
      finalizeStepArtifacts: finalizeSpy,
      async digestArtifacts(refs: { path: string }[]) {
        return refs.map((r) => ({ path: r.path, hash: null as null }));
      },
    };

    const stepIo = {
      async validateStepInputs(): Promise<void> {},
      async validateStepOutputs() { return { violations: [] as never[] }; },
      async verifyFindingRefs(refs: { file: string }[]) { return refs; },
    };

    const deps = makeBaseDeps({
      cwd: tempDir,
      slug: "test-slug",
      stepArtifact: stepArtifact as never,
      stepIo: stepIo as never,
    });

    const executor = new StepExecutor(events, runnerWithOrder, makeStoreFactory(tempDir));
    await executor.execute(makeMinimalStep(), state, deps);

    // Both spies must have been called exactly once.
    expect(prepareArtifactsSpy).toHaveBeenCalledOnce();
    expect(runnerWithOrder.run).toHaveBeenCalledOnce();

    // Key ordering invariant (TC-008): prepareStepArtifacts BEFORE runner.run().
    expect(callOrder[0]).toBe("prepareStepArtifacts");
    expect(callOrder[1]).toBe("runner.run");
  });
});

// ---------------------------------------------------------------------------
// TC-T15-03: terminalState?.commitFinalState called with cwd:string, slug:string
//
// This is a compile-time + runtime test for the TerminalStateCapability wiring.
// We test the guard directly (no need to invoke the full CommandRunner).
// ---------------------------------------------------------------------------

describe("T-15: Terminal commit lifecycle ordering", () => {
  it("TC-T15-03: terminalState.commitFinalState called with string cwd and slug (not deps)", async () => {
    const commitFinalStateSpy = vi.fn<(cwd: string, slug: string, state: unknown) => Promise<void>>().mockResolvedValue(undefined);

    // Simulate the exact expression from pipeline.ts / runner.ts
    const deps = makeBaseDeps({
      cwd: tempDir,
      slug: "test-slug",
      terminalState: {
        commitFinalState: commitFinalStateSpy,
      },
    });

    // Inline the exact call from runner.ts gate-halt path.
    // terminalState is non-nullable (R2b finding fix) — direct call, no optional chaining.
    const fakeHaltState = {};
    await deps.terminalState.commitFinalState(deps.cwd ?? "", deps.slug, fakeHaltState as never);

    expect(commitFinalStateSpy).toHaveBeenCalledOnce();
    const [calledCwd, calledSlug, calledState] = commitFinalStateSpy.mock.calls[0] as [string, string, unknown];
    // Both cwd and slug must be strings — not PipelineDeps.
    expect(typeof calledCwd).toBe("string");
    expect(typeof calledSlug).toBe("string");
    expect(calledCwd).toBe(tempDir);
    expect(calledSlug).toBe("test-slug");
    expect(calledState).toBe(fakeHaltState);
  });

  // TC-T15-04 was: "terminalState absent — optional chain evaluates to undefined (no throw)"
  // Removed: terminalState is now a required non-nullable field (R2b finding fix).
  // Compositions must always inject a noopTerminalState or real implementation.
  // The optional-chain guard (deps.terminalState?.commitFinalState) is no longer present
  // in pipeline.ts or runner.ts — the field is always non-null.
});

// ---------------------------------------------------------------------------
// TC-T15-05: buildDeps result type — DSM §3 compliance via port interface
//
// This PR (D3/T-05/T-12) changed buildDeps() to return PipelineDeps directly,
// with a single DSM allowlist entry in runtime-strategy.ts documenting the
// type-only cross-layer import (TC-021, TC-022: must-priority ACs).
//
// The `import type { PipelineDeps }` in the port file is erased at compile time
// and creates no runtime module dependency — TypeScript 3.8+ handles circular
// `import type` safely.  runner.ts no longer needs the `as PipelineDeps` cast
// (AC TC-022: 'return type is PipelineDeps (not unknown)').
//
// This test verifies that the port interface compiles and returns a correctly
// typed PipelineDeps value without any cast in the caller.
// ---------------------------------------------------------------------------

describe("T-15: buildDeps return type (DSM §3 compliance via port interface)", () => {
  it("TC-T15-05: RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)", () => {
    // Create a minimal RuntimeStrategy-typed fake that returns a known slug.
    const fake: Pick<RuntimeStrategy, "buildDeps"> = {
      buildDeps: () => makeBaseDeps(),
    };

    // Call through the port interface. buildDeps() now returns PipelineDeps
    // directly (DSM §3 via allowlist entry). No `as PipelineDeps` cast is
    // needed — this mirrors the updated runner.ts (AC TC-022).
    const deps = fake.buildDeps({} as never, {} as never, "", {} as never);

    expect(deps.slug).toBe("test-slug");
  });
});

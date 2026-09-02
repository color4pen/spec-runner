/**
 * Tests for main-checkout drift detection in StepExecutor.
 *
 * TC-DD-001: no drift → step succeeds (guard passes)
 * TC-DD-002: drift detected → state transitions to awaiting-resume with MAIN_CHECKOUT_WRITE_DETECTED
 * TC-DD-003: guardBefore null (no strategy) → drift check skipped, step succeeds
 * TC-DD-004: drift factory produces correct resumePoint and interruption kind
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { MainCheckoutGuardSnapshot } from "../../../src/core/port/runtime-strategy.js";
import type { StepArtifactLifecycleCapability } from "../../../src/core/step/step-capability.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import { noopRoundGitEffects, noopStepArtifact, noopStepIo, noopTerminalState } from "../../../src/core/step/noop-capabilities.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-drift-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug", baseBranch: "main" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeSuccessRunner(): AgentRunner {
  return {
    async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
    },
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

/**
 * Build a StepArtifactLifecycleCapability with injectable snapshotMainCheckoutGuard.
 */
function makeStepArtifact(opts: {
  snapshotBefore: MainCheckoutGuardSnapshot | null;
  snapshotAfter: MainCheckoutGuardSnapshot | null;
}): StepArtifactLifecycleCapability {
  let callCount = 0;
  return {
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async snapshotMainCheckoutGuard() {
      return callCount++ === 0 ? opts.snapshotBefore : opts.snapshotAfter;
    },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
  };
}

function makeDeps(stepArtifact?: StepArtifactLifecycleCapability): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "bug-fix",
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
    stepArtifact: stepArtifact ?? noopStepArtifact,
    stepIo: noopStepIo,
    terminalState: noopTerminalState,
    roundGitEffects: noopRoundGitEffects,
  };
}

function makeStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { name: "specrunner-implementer", role: "implementer", model: "claude-sonnet-4-5", system: "impl", tools: [] },
    buildMessage: () => "implement",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-DD-001: no drift → step succeeds
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-DD-001: no drift → step succeeds", () => {
  it("completes without error when before and after snapshots are identical", async () => {
    const jobId = "tc-dd-001";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const snapshot: MainCheckoutGuardSnapshot = { entries: [{ path: ".specrunner/config.json", hash: "abc123" }] };
    const stepArtifactCap = makeStepArtifact({ snapshotBefore: snapshot, snapshotAfter: snapshot });

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    const result = await executor.execute(makeStep(), state, makeDeps(stepArtifactCap));
    expect(result.status).toBe("running");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DD-002: drift detected → awaiting-resume + MAIN_CHECKOUT_WRITE_DETECTED
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-DD-002: drift detected → awaiting-resume", () => {
  it("transitions to awaiting-resume and throws MAIN_CHECKOUT_WRITE_DETECTED", async () => {
    const jobId = "tc-dd-002";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const before: MainCheckoutGuardSnapshot = { entries: [{ path: ".specrunner/config.json", hash: "hash-a" }] };
    const after: MainCheckoutGuardSnapshot = { entries: [{ path: ".specrunner/config.json", hash: "hash-b" }] };
    const stepArtifactCap = makeStepArtifact({ snapshotBefore: before, snapshotAfter: after });

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));

    let caughtErr: Error & { state?: JobState } | undefined;
    try {
      await executor.execute(makeStep(), state, makeDeps(stepArtifactCap));
    } catch (err) {
      caughtErr = err as Error & { state?: JobState };
    }

    expect(caughtErr).toBeDefined();
    expect((caughtErr as Error & { code?: string })?.code).toBe("MAIN_CHECKOUT_WRITE_DETECTED");
    // State should be awaiting-resume
    const errState = caughtErr?.state;
    expect(errState?.status).toBe("awaiting-resume");
    expect(errState?.resumePoint?.reason).toBe("main checkout write detected");
    expect(errState?.mainCheckoutDrift).toBeDefined();
    expect(errState?.mainCheckoutDrift?.changes).toHaveLength(1);
    expect(errState?.mainCheckoutDrift?.changes[0]?.kind).toBe("modified");
    expect(errState?.error?.code).toBe("MAIN_CHECKOUT_WRITE_DETECTED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DD-003: no strategy → drift check skipped, step succeeds
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-DD-003: no runtimeStrategy → drift check skipped", () => {
  it("completes successfully when no runtimeStrategy is provided", async () => {
    const jobId = "tc-dd-003";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));
    const result = await executor.execute(makeStep(), state, makeDeps());
    expect(result.status).toBe("running");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DD-004: drift halt includes resumePoint and mainCheckoutDrift in state
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-DD-004: drift halt state has expected fields", () => {
  it("sets mainCheckoutDrift.detectedAtStep to the step name", async () => {
    const jobId = "tc-dd-004";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const before: MainCheckoutGuardSnapshot = { entries: [] };
    // After: one new entry → "created" drift
    const after: MainCheckoutGuardSnapshot = { entries: [{ path: ".specrunner/config.json", hash: "new-hash" }] };
    const stepArtifactCap = makeStepArtifact({ snapshotBefore: before, snapshotAfter: after });

    const executor = new StepExecutor(new EventBus(), makeSuccessRunner(), makeStoreFactory(tempDir));

    let caughtErr: Error & { state?: JobState } | undefined;
    try {
      await executor.execute(makeStep(), state, makeDeps(stepArtifactCap));
    } catch (err) {
      caughtErr = err as Error & { state?: JobState };
    }

    const errState = caughtErr?.state;
    expect(errState?.mainCheckoutDrift?.detectedAtStep).toBe("implementer");
    expect(errState?.resumePoint?.step).toBe("implementer");
  });
});

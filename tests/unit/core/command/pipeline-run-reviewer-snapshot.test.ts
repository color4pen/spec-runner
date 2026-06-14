/**
 * T-05: call-site behavioral test — reviewer snapshot gating in PipelineRunCommand.prepare().
 *
 * Verifies that jobState.reviewers is set/unset according to the combined condition:
 *   reviewers.length > 0  AND  descriptorHasReviewerInsertionPoint(descriptor)
 *
 * Cases:
 *   1. design-only + reviewer defs present  → jobState.reviewers UNDEFINED
 *   2. standard + reviewer defs present     → jobState.reviewers SET (count & name match)
 *   3. fast + reviewer defs present         → jobState.reviewers SET
 *   4. reviewers.length === 0               → jobState.reviewers UNDEFINED (any pipeline)
 *
 * Harness mirrors pipeline-run-gate.test.ts (TestablePipelineRunCommand subclass,
 * makeFakeRuntime, makeFakePreflightResult) with reviewer-focused mocks added.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PipelineRunCommand } from "../../../../src/core/command/pipeline-run.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, CleanupHandle, WorkspaceContext } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { PreflightResult } from "../../../../src/core/preflight.js";
import type { ParsedRequest } from "../../../../src/parser/types.js";
import type { ReviewerDefinition } from "../../../../src/core/reviewers/types.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock loadReviewerDefinitions so tests can control what reviewer defs are returned.
// We import the mock fn via vi.mocked() after the vi.mock() call.
vi.mock("../../../../src/core/reviewers/load.js", () => ({
  loadReviewerDefinitions: vi.fn(),
}));

// Mock validateReviewerDefinitions to be a no-op so fake defs never fail validation.
vi.mock("../../../../src/core/reviewers/validate.js", () => ({
  validateReviewerDefinitions: vi.fn(),
}));

// Import after mock registration
const { loadReviewerDefinitions } = await import("../../../../src/core/reviewers/load.js");
const loadMock = vi.mocked(loadReviewerDefinitions);

// ---------------------------------------------------------------------------
// Fake reviewer definition helpers
// ---------------------------------------------------------------------------

function makeFakeReviewerDef(name: string): ReviewerDefinition {
  return {
    name,
    maxIterations: 2,
    purpose: `Purpose for ${name}`,
    criteria: `Criteria for ${name}`,
    judgment: `Judgment for ${name}`,
    freeText: "",
    filename: `${name}.md`,
  };
}

// ---------------------------------------------------------------------------
// Test helpers (mirroring pipeline-run-gate.test.ts)
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-reviewer-snapshot-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeFakePreflightResult(pipelineId?: string): PreflightResult {
  const request: ParsedRequest = {
    type: "new-feature",
    title: "Test Request",
    slug: "test-slug",
    baseBranch: "main",
    content: "# Test\n\n## Meta\n\n- **type**: new-feature",
    adr: false,
    pipeline: pipelineId,
  };

  return {
    config: { version: 1, runtime: "local", agents: {} },
    repo: { owner: "testowner", name: "testrepo" },
    request,
    githubToken: "ghp_test_token",
    githubTokenSource: "env",
  };
}

/**
 * Build a fake RuntimeStrategy with bootstrapJob returning a fresh initial state.
 * canDeriveChangedFiles is set to `() => canDerive` when canDerive is a boolean.
 */
function makeFakeRuntime(
  canDerive: boolean | "absent",
): RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } {
  const initialState = buildInitialJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
    // No reviewers param → reviewers field absent on initial state
  });

  const bootstrapJobSpy = vi.fn().mockResolvedValue(initialState);

  const runtime: RuntimeStrategy & { bootstrapJob: ReturnType<typeof vi.fn> } = {
    bootstrapJob: bootstrapJobSpy,
    persistJobState: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: tempDir } as WorkspaceContext),
    buildDeps: vi.fn().mockReturnValue({}),
    registerCleanup: vi.fn().mockReturnValue({} as CleanupHandle),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue([]),
  };

  if (canDerive !== "absent") {
    runtime.canDeriveChangedFiles = () => canDerive;
  }

  return runtime;
}

/** Thin subclass exposing protected prepare() for testing. */
class TestablePipelineRunCommand extends PipelineRunCommand {
  public async testPrepare(): Promise<PrepareResult> {
    return this.prepare();
  }
}

function makeCommand(
  preflightResult: PreflightResult,
  runtime: RuntimeStrategy,
): TestablePipelineRunCommand {
  return new TestablePipelineRunCommand(
    runtime,
    new EventBus(),
    "/fake/path/to/request.md", // non-canonical → requestSlug = null
    preflightResult,
    { cwd: tempDir },
  );
}

// ---------------------------------------------------------------------------
// T-05-1: design-only + reviewer defs present → jobState.reviewers undefined
// ---------------------------------------------------------------------------

describe("T-05-1: design-only + reviewer defs present → jobState.reviewers is NOT set", () => {
  it("jobState.reviewers is undefined when pipeline=design-only and reviewers are loaded", async () => {
    const fakeDefs = [makeFakeReviewerDef("security"), makeFakeReviewerDef("style")];
    loadMock.mockResolvedValue(fakeDefs);

    // design-only has no permissionScope → gate does not fire, canDerive=false is fine
    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult("design-only");
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeUndefined();
  });

  it("no UnsupportedRuntimeCapabilityError for design-only + canDerive=false (gate does not fire)", async () => {
    const fakeDefs = [makeFakeReviewerDef("security")];
    loadMock.mockResolvedValue(fakeDefs);

    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult("design-only");
    const command = makeCommand(preflightResult, runtime);

    // Should resolve without error (no permissionScope on design-only)
    await expect(command.testPrepare()).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T-05-2: standard + reviewer defs present → jobState.reviewers is SET
// ---------------------------------------------------------------------------

describe("T-05-2: standard + reviewer defs present → jobState.reviewers is SET", () => {
  it("jobState.reviewers is defined and matches loaded defs (excluding filename)", async () => {
    const fakeDefs = [makeFakeReviewerDef("security"), makeFakeReviewerDef("style")];
    loadMock.mockResolvedValue(fakeDefs);

    // standard has no permissionScope → no gate
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(undefined); // default = "standard"
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeDefined();
    expect(result.jobState.reviewers).toHaveLength(2);
    // Verify name is preserved (ReviewerSnapshot = ReviewerDefinition minus filename)
    expect(result.jobState.reviewers![0]!.name).toBe("security");
    expect(result.jobState.reviewers![1]!.name).toBe("style");
  });

  it("jobState.reviewers does not contain the filename field", async () => {
    const fakeDefs = [makeFakeReviewerDef("security")];
    loadMock.mockResolvedValue(fakeDefs);

    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(undefined);
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeDefined();
    expect((result.jobState.reviewers![0] as unknown as Record<string, unknown>)["filename"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-05-3: fast + reviewer defs present → jobState.reviewers is SET
// ---------------------------------------------------------------------------

describe("T-05-3: fast + reviewer defs present → jobState.reviewers is SET", () => {
  it("jobState.reviewers is defined for pipeline=fast when canDerive=true", async () => {
    const fakeDefs = [makeFakeReviewerDef("arch-guard")];
    loadMock.mockResolvedValue(fakeDefs);

    // fast has permissionScope → canDerive=true required to pass gate
    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult("fast");
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeDefined();
    expect(result.jobState.reviewers).toHaveLength(1);
    expect(result.jobState.reviewers![0]!.name).toBe("arch-guard");
  });
});

// ---------------------------------------------------------------------------
// T-05-4: reviewers.length === 0 → jobState.reviewers UNDEFINED (any pipeline)
// ---------------------------------------------------------------------------

describe("T-05-4: reviewers.length === 0 → jobState.reviewers is NOT set", () => {
  it("standard + no reviewer defs → jobState.reviewers is undefined", async () => {
    loadMock.mockResolvedValue([]);

    const runtime = makeFakeRuntime(true);
    const preflightResult = makeFakePreflightResult(undefined); // standard
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeUndefined();
  });

  it("design-only + no reviewer defs → jobState.reviewers is undefined", async () => {
    loadMock.mockResolvedValue([]);

    const runtime = makeFakeRuntime(false);
    const preflightResult = makeFakePreflightResult("design-only");
    const command = makeCommand(preflightResult, runtime);

    const result = await command.testPrepare();

    expect(result.jobState.reviewers).toBeUndefined();
  });
});

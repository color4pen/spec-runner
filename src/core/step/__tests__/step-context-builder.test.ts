/**
 * Unit tests for buildStepContext — permission-layer-git-write-denial additions.
 *
 * TC-039: scoped step の AgentRunContext に正しい writeScope が設定される (must)
 * TC-040: guarded step の AgentRunContext に正しい writeScope が設定される (must)
 * TC-041: declaredWritePaths に gitState artifact が含まれない (should)
 * TC-042: writes() が undefined の step では declaredWritePaths が空配列になる (should)
 *
 * These tests will FAIL until T-04 implements writeScope computation in buildStepContext.
 * After T-03 adds AgentWriteScope to AgentRunContext and T-04 populates it, they will go green.
 */
import { describe, it, expect, vi } from "vitest";
import { buildStepContext, type BuildStepContextFs } from "../step-context-builder.js";
import type { AgentStep } from "../../port/step-types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJobState(slug = "test-slug"): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${slug}/request.md`,
      title: "Test Request",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: `feat/${slug}-abc12345`,
    history: [],
    error: null,
    steps: {},
  };
}

function makeDeps(slug = "test-slug"): PipelineDeps {
  const store = {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
  return {
    cwd: "/tmp/test-worktree",
    slug,
    config: { version: 1, runtime: "local", agents: {} } as never,
    request: {
      type: "new-feature",
      title: "Test Request",
      slug,
      baseBranch: "main",
      content: "## Test request content",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "testowner",
    repo: "testrepo",
    spawn: vi.fn() as never,
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    repoRoot: undefined,
    runtimeStrategy: undefined,
  } as PipelineDeps;
}

const stubFsAdapter: BuildStepContextFs = {
  readFile: async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
  readdir: async () => [],
};

const stubEmitFn = vi.fn();

// ---------------------------------------------------------------------------
// TC-039: scoped step のスコープを設定する
// ---------------------------------------------------------------------------

describe("TC-039: scoped step の AgentRunContext に正しい writeScope が設定される", () => {
  it("sets writeScope with stagingMode='scoped', correct declaredWritePaths, stepName, slug", async () => {
    // TC-039: scoped step (spec-review is NOT in GUARDED_WRITE_STEPS → stagingMode = "scoped")
    // NOTE: This test FAILS until T-04 adds writeScope computation to buildStepContext.
    // After implementation: ctx.writeScope === { stepName: "spec-review", slug: "test-slug",
    //   declaredWritePaths: ["specrunner/changes/test-slug/spec-review-result-001.md"],
    //   stagingMode: "scoped" }
    const slug = "test-slug";
    const resultPath = `specrunner/changes/${slug}/spec-review-result-001.md`;

    const step: AgentStep = {
      kind: "agent",
      name: "spec-review",  // NOT in GUARDED_WRITE_STEPS → stagingMode = "scoped"
      agent: {
        name: "specrunner-spec-review",
        role: "spec-review",
        model: "claude-sonnet-4-6",
        system: "review the spec",
        tools: [],
      },
      buildMessage: () => "review",
      resultFilePath: () => resultPath,
      parseResult: () => ({ verdict: "approved", findingsPath: null }),
      writes: (_state, _deps) => [
        { artifact: "file" as const, path: resultPath },
      ],
    };

    const state = makeJobState(slug);
    const deps = makeDeps(slug);
    const ctx = await buildStepContext(step, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    // TC-039: writeScope must be present (fails until T-04)
    expect(ctx.writeScope).toBeDefined();
    expect(ctx.writeScope?.stagingMode).toBe("scoped");
    expect(ctx.writeScope?.stepName).toBe("spec-review");
    expect(ctx.writeScope?.slug).toBe(slug);
    expect(ctx.writeScope?.declaredWritePaths).toEqual([resultPath]);

    // managedPaths: pipelineManagedPaths(slug) — egress ledger paths denied for all steps
    expect(ctx.writeScope?.managedPaths).toEqual([
      `specrunner/changes/${slug}/state.json`,
      `specrunner/changes/${slug}/events.jsonl`,
      `specrunner/changes/${slug}/usage.json`,
      `specrunner/changes/${slug}/bite-evidence-result.md`,
      `specrunner/changes/${slug}/pr-create-result.md`,
    ]);

    // forbiddenPaths: protectedCanonPaths(slug) minus declaredWritePaths
    // resultPath is not a protected canon path, so all canon paths are forbidden
    expect(ctx.writeScope?.forbiddenPaths).toEqual([
      `specrunner/changes/${slug}/request.md`,
      `specrunner/changes/${slug}/spec.md`,
      `specrunner/changes/${slug}/design.md`,
      `specrunner/changes/${slug}/tasks.md`,
      `specrunner/changes/${slug}/test-cases.md`,
      `specrunner/changes/${slug}/request-review-attestation.json`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-040: guarded step のスコープを設定する
// ---------------------------------------------------------------------------

describe("TC-040: guarded step の AgentRunContext に正しい writeScope が設定される", () => {
  it("sets writeScope with stagingMode='guarded', correct declaredWritePaths, stepName, slug", async () => {
    // TC-040: guarded step (implementer IS in GUARDED_WRITE_STEPS → stagingMode = "guarded")
    // NOTE: This test FAILS until T-04 adds writeScope computation to buildStepContext.
    const slug = "test-slug";
    const implNotesPath = `specrunner/changes/${slug}/implementation-notes.md`;

    const step: AgentStep = {
      kind: "agent",
      name: "implementer",  // IS in GUARDED_WRITE_STEPS → stagingMode = "guarded"
      agent: {
        name: "specrunner-implementer",
        role: "implementer",
        model: "claude-sonnet-4-6",
        system: "implement the spec",
        tools: [],
      },
      buildMessage: () => "implement",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      writes: (_state, _deps) => [
        { artifact: "file" as const, path: implNotesPath },
      ],
    };

    const state = makeJobState(slug);
    const deps = makeDeps(slug);
    const ctx = await buildStepContext(step, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    // TC-040: writeScope must be present (fails until T-04)
    expect(ctx.writeScope).toBeDefined();
    expect(ctx.writeScope?.stagingMode).toBe("guarded");
    expect(ctx.writeScope?.stepName).toBe("implementer");
    expect(ctx.writeScope?.slug).toBe(slug);
    expect(ctx.writeScope?.declaredWritePaths).toEqual([implNotesPath]);

    // managedPaths: pipelineManagedPaths(slug)
    expect(ctx.writeScope?.managedPaths).toEqual([
      `specrunner/changes/${slug}/state.json`,
      `specrunner/changes/${slug}/events.jsonl`,
      `specrunner/changes/${slug}/usage.json`,
      `specrunner/changes/${slug}/bite-evidence-result.md`,
      `specrunner/changes/${slug}/pr-create-result.md`,
    ]);

    // forbiddenPaths: protectedCanonPaths(slug) minus declaredWritePaths
    // implNotesPath is not a protected canon path, so all canon paths are forbidden
    expect(ctx.writeScope?.forbiddenPaths).toEqual([
      `specrunner/changes/${slug}/request.md`,
      `specrunner/changes/${slug}/spec.md`,
      `specrunner/changes/${slug}/design.md`,
      `specrunner/changes/${slug}/tasks.md`,
      `specrunner/changes/${slug}/test-cases.md`,
      `specrunner/changes/${slug}/request-review-attestation.json`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-041 (should): gitState artifact is excluded from declaredWritePaths
// ---------------------------------------------------------------------------

describe("TC-041: declaredWritePaths に gitState artifact が含まれない", () => {
  it("filters out gitState artifacts from writes() before populating declaredWritePaths", async () => {
    // TC-041: writes() returns mixed file+gitState; only "file" artifact paths should appear
    const slug = "test-slug";
    const filePath = `specrunner/changes/${slug}/result.md`;

    const step: AgentStep = {
      kind: "agent",
      name: "design",  // scoped step
      agent: {
        name: "specrunner-design",
        role: "design",
        model: "claude-sonnet-4-6",
        system: "design",
        tools: [],
      },
      buildMessage: () => "design",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      writes: (_state, _deps) => [
        { artifact: "gitState" as const, path: "" },
        { artifact: "file" as const, path: filePath },
      ],
    };

    const state = makeJobState(slug);
    const deps = makeDeps(slug);
    const ctx = await buildStepContext(step, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    expect(ctx.writeScope).toBeDefined();
    // Only file artifact paths, not gitState
    expect(ctx.writeScope?.declaredWritePaths).toEqual([filePath]);
    expect(ctx.writeScope?.declaredWritePaths).not.toContain("");
  });
});

// ---------------------------------------------------------------------------
// TC-042 (should): writes() undefined → declaredWritePaths is empty array
// ---------------------------------------------------------------------------

describe("TC-042: writes() が undefined の step では declaredWritePaths が空配列になる", () => {
  it("produces empty declaredWritePaths (not null/undefined) when writes() is not defined", async () => {
    // TC-042: step without writes() declaration → declaredWritePaths = []
    const slug = "test-slug";

    const step: AgentStep = {
      kind: "agent",
      name: "conformance",  // scoped step, no writes()
      agent: {
        name: "specrunner-conformance",
        role: "conformance",
        model: "claude-sonnet-4-6",
        system: "conformance check",
        tools: [],
      },
      buildMessage: () => "check",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      // writes: omitted intentionally
    };

    const state = makeJobState(slug);
    const deps = makeDeps(slug);
    const ctx = await buildStepContext(step, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    expect(ctx.writeScope).toBeDefined();
    expect(ctx.writeScope?.declaredWritePaths).toEqual([]);
    // Must be an array, not null/undefined
    expect(Array.isArray(ctx.writeScope?.declaredWritePaths)).toBe(true);
  });
});

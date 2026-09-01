/**
 * Unit tests for the unpushable-path OutputContract kind.
 *
 * Output Contract: unpushable-path kind (Requirement 4):
 *   TC-013: No unpushable-path contract declared under undeclared environment
 *   TC-030: buildOutputFollowUpPrompt generates a path-listing section for violations
 *
 * Follow-up Limit: maxAttempts stays at 2 (T-08):
 *   TC-033: unpushable-path contract keeps maxAttempts=2; per-attempt filtering limits prompt to attempt=1 only
 *   TC-034: Contracts without unpushable-path retain the default maxAttempts of 2
 *
 * Follow-up: exactly one turn (Requirement 4):
 *   TC-011: Follow-up resolves the violation and the step proceeds
 *   TC-012: At most one follow-up is sent even when the violation persists (prompt filtered at attempt>=2)
 */

import { describe, it, expect, vi } from "vitest";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import {
  buildOutputFollowUpPrompt,
  OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
} from "../../../src/core/step/output-verify.js";
import { buildStepContext } from "../../../src/core/step/step-context-builder.js";
import type { PushCapability } from "../../../src/git/push-capability.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { PipelineDeps, PipelineDepsBuilder } from "../../../src/core/types.js";
import type { OutputViolation } from "../../../src/core/port/output-contract.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import { WORKFLOWS_PATTERN } from "../../../src/git/push-capability.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Implement something",
      adr: false,
    },
    slug: "test-slug",
    ...overrides,
  };
}

const declaringCapability: PushCapability = {
  patterns: [WORKFLOWS_PATTERN],
  source: "GitHub Actions installation token (ghs_) cannot push to .github/workflows/**",
};

// ---------------------------------------------------------------------------
// TC-013: No unpushable-path contract in undeclared environment
// ---------------------------------------------------------------------------

describe("TC-013: ImplementerStep.outputContracts — undeclared environment", () => {
  it("TC-013: no unpushable-path contract when pushCapability is null", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: null });
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.filter((c) => c.kind === "unpushable-path");
    expect(unpushable).toHaveLength(0);
  });

  it("TC-013: no unpushable-path contract when pushCapability is undefined", () => {
    const state = makeState();
    const deps = makeDeps(); // no pushCapability
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.filter((c) => c.kind === "unpushable-path");
    expect(unpushable).toHaveLength(0);
  });

  it("TC-013: no unpushable-path contract when pushCapability has empty patterns", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: { patterns: [], source: "none" } });
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.filter((c) => c.kind === "unpushable-path");
    expect(unpushable).toHaveLength(0);
  });

  it("exactly one unpushable-path contract when patterns are declared", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: declaringCapability });
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.filter((c) => c.kind === "unpushable-path");
    expect(unpushable).toHaveLength(1);
  });

  it("declared unpushable-path contract has follow-up policy", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: declaringCapability });
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.find((c) => c.kind === "unpushable-path");
    expect(unpushable?.policy).toBe("follow-up");
  });

  it("declared unpushable-path contract carries the patterns", () => {
    const state = makeState();
    const deps = makeDeps({ pushCapability: declaringCapability });
    const contracts = ImplementerStep.outputContracts!(state, deps);
    const unpushable = contracts.find((c) => c.kind === "unpushable-path");
    expect(unpushable?.patterns).toEqual([WORKFLOWS_PATTERN]);
  });

  it("existing contracts (tasks-complete etc.) are unchanged when capability is absent", () => {
    const state = makeState();
    const depsWithout = makeDeps();
    const depsWithCapability = makeDeps({ pushCapability: declaringCapability });

    const withoutContracts = ImplementerStep.outputContracts!(state, depsWithout);
    const withCapabilityContracts = ImplementerStep.outputContracts!(state, depsWithCapability);

    // Without capability: only the baseline contracts (tasks-complete)
    const withoutNonUnpushable = withoutContracts.filter((c) => c.kind !== "unpushable-path");
    const withCapabilityNonUnpushable = withCapabilityContracts.filter((c) => c.kind !== "unpushable-path");

    // The baseline contracts should be identical
    expect(withoutNonUnpushable).toEqual(withCapabilityNonUnpushable);
  });
});

// ---------------------------------------------------------------------------
// TC-030: buildOutputFollowUpPrompt generates section for unpushable-path violations
// ---------------------------------------------------------------------------

describe("TC-030: buildOutputFollowUpPrompt for unpushable-path violations", () => {
  const unpushableViolation: OutputViolation = {
    kind: "unpushable-path",
    path: "",
    policy: "follow-up",
    detail: [".github/workflows/ci.yml"],
  };

  it("TC-030: prompt contains the matched path", () => {
    const prompt = buildOutputFollowUpPrompt([unpushableViolation]);
    expect(prompt).toContain(".github/workflows/ci.yml");
  });

  it("TC-030: prompt instructs agent to remove the change or satisfy requirement without the path", () => {
    const prompt = buildOutputFollowUpPrompt([unpushableViolation]);
    // The prompt should contain instructions about removing or alternatives
    expect(prompt.toLowerCase()).toMatch(/remove|satisfy|without/);
  });

  it("multiple matched paths appear in the prompt", () => {
    const violation: OutputViolation = {
      kind: "unpushable-path",
      path: "",
      policy: "follow-up",
      detail: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
    };
    const prompt = buildOutputFollowUpPrompt([violation]);
    expect(prompt).toContain(".github/workflows/ci.yml");
    expect(prompt).toContain(".github/workflows/deploy.yml");
  });

  it("prompt includes an unpushable-path heading section", () => {
    const prompt = buildOutputFollowUpPrompt([unpushableViolation]);
    // The section should be specifically for unpushable path constraint
    expect(prompt).toContain("Unpushable path");
  });
});

// ---------------------------------------------------------------------------
// TC-033, TC-034, TC-011, TC-012: maxAttempts behavior via buildStepContext
// ---------------------------------------------------------------------------

/**
 * Build a minimal PipelineDeps for buildStepContext testing.
 * Uses a spy runtimeStrategy to observe outputVerification config.
 */
function makePipelineDeps(
  overrides: Partial<PipelineDeps> = {},
): PipelineDeps {
  const mockStrategy: RuntimeStrategy & PipelineDepsBuilder = {
    async *query() {},
    createAgentRunner() {
      return { async run() { return { completionReason: "success" as const, resultContent: null, toolResult: null, followUpAttempts: 0 }; } };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async snapshotMainCheckoutGuard() { return null; },
    async validateStepInputs() {},
    async bootstrapJob() { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async validateStepOutputs() { return { violations: [] }; },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
    // R2c: previously optional methods, now required on RuntimeStrategy
    async assertProviderReadiness() {},
    async assertNoDuplicateLiveJob() {},
    async reloadJobState() { throw new Error("not implemented"); },
    canDeriveChangedFiles: () => false,
    async listWorktreeChanges() { return { kind: "success" as const, paths: [] }; },
    async listCommitChangedFiles() { return { kind: "unavailable" as const, reason: "test" }; },
    async readFileAtCommit() { return { kind: "unavailable" as const, reason: "test" }; },
    async readRevisionContent() { return { current: null, prior: null }; },
    async lastCommitTouchingPath() { return { kind: "unavailable" as const, reason: "test" }; },
  };

  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature" as const,
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Implement something",
      adr: false,
    },
    slug: "test-slug",
    stepArtifact: mockStrategy as never,
    stepIo: mockStrategy as never,
    ...overrides,
  } as unknown as PipelineDeps;
}

describe("TC-033 & TC-034: maxAttempts and per-attempt filtering in outputVerification policy", () => {
  const fakeFsAdapter = {
    async readFile(_path: string, _enc: string): Promise<string> {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    async readdir(_dir: string): Promise<string[]> {
      return [];
    },
  };

  const unpushableViolation: import("../../../src/core/port/output-contract.js").OutputViolation = {
    kind: "unpushable-path",
    path: "",
    policy: "follow-up",
    detail: [".github/workflows/ci.yml"],
  };

  const tasksViolation: import("../../../src/core/port/output-contract.js").OutputViolation = {
    kind: "tasks-complete",
    path: "specrunner/changes/test-slug/tasks.md",
    policy: "follow-up",
    detail: ["Implement feature"],
  };

  // TC-033: unpushable-path contract → maxAttempts stays at default (2), but buildPrompt
  // filters unpushable-path violations on attempt >= 1 (exactly 1 follow-up for unpushable-path).
  it("TC-033: maxAttempts=2 (default) even when unpushable-path is in follow-up contracts", async () => {
    const state = makeState();
    const deps = makePipelineDeps({
      pushCapability: declaringCapability,
    });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    expect(ctx.policy.outputVerification).toBeDefined();
    // maxAttempts stays at the default so tasks-complete retains 2 repair opportunities.
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(OUTPUT_FOLLOWUP_MAX_ATTEMPTS);
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(2);
  });

  it("TC-033: buildPrompt at attempt=1 includes unpushable-path violations (adapters use 1-based numbering)", async () => {
    const state = makeState();
    const deps = makePipelineDeps({ pushCapability: declaringCapability });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    const prompt = ctx.policy.outputVerification!.buildPrompt([unpushableViolation, tasksViolation], 1);
    // On attempt 1 (first follow-up in 1-based adapter loop), both violations appear in the prompt
    expect(prompt).toContain("Unpushable path");
    expect(prompt).toContain(".github/workflows/ci.yml");
    expect(prompt).toContain("Incomplete tasks");
  });

  it("TC-033: buildPrompt at attempt=2 excludes unpushable-path violations (exactly 1 follow-up for unpushable-path)", async () => {
    const state = makeState();
    const deps = makePipelineDeps({ pushCapability: declaringCapability });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    const prompt = ctx.policy.outputVerification!.buildPrompt([unpushableViolation, tasksViolation], 2);
    // On attempt >= 2, unpushable-path is filtered — tasks-complete still appears (up to 2 repair attempts).
    expect(prompt).not.toContain("Unpushable path");
    expect(prompt).not.toContain(".github/workflows/ci.yml");
    expect(prompt).toContain("Incomplete tasks");
  });

  it("TC-033: tasks-complete violation appears in both attempt=1 and attempt=2 prompts (2 repair opportunities)", async () => {
    const state = makeState();
    const deps = makePipelineDeps({ pushCapability: declaringCapability });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    const prompt1 = ctx.policy.outputVerification!.buildPrompt([tasksViolation], 1);
    const prompt2 = ctx.policy.outputVerification!.buildPrompt([tasksViolation], 2);

    // tasks-complete appears in both prompts — maximum 2 repair attempts maintained
    expect(prompt1).toContain("Incomplete tasks");
    expect(prompt2).toContain("Incomplete tasks");
  });

  // TC-034: no unpushable-path → maxAttempts=2 (default), behavior unchanged
  it("TC-034: maxAttempts=2 (default) when no unpushable-path in contracts", async () => {
    const state = makeState();
    const deps = makePipelineDeps({
      pushCapability: null, // no capability
    });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    expect(ctx.policy.outputVerification).toBeDefined();
    // Should use the default OUTPUT_FOLLOWUP_MAX_ATTEMPTS
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(OUTPUT_FOLLOWUP_MAX_ATTEMPTS);
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(2);
  });

  it("TC-034: buildPrompt behavior is identical with and without unpushable-path contract for tasks-complete", async () => {
    const state = makeState();
    const depsWithCapability = makePipelineDeps({ pushCapability: declaringCapability });
    const depsWithout = makePipelineDeps({ pushCapability: null });

    const ctxWith = await buildStepContext(ImplementerStep, state, depsWithCapability, "/fake/cwd", () => {}, fakeFsAdapter);
    const ctxWithout = await buildStepContext(ImplementerStep, state, depsWithout, "/fake/cwd", () => {}, fakeFsAdapter);

    // For tasks-complete violations at attempt=2 (second follow-up), both contexts should produce identical prompts
    const promptWith = ctxWith.policy.outputVerification!.buildPrompt([tasksViolation], 2);
    const promptWithout = ctxWithout.policy.outputVerification!.buildPrompt([tasksViolation], 2);
    expect(promptWith).toBe(promptWithout);
  });

  // TC-011: Follow-up resolves the violation — outputVerification detect returns empty
  it("TC-011: when violations resolve, outputVerification.detect returns empty violations", async () => {
    const state = makeState();
    // Simulate: after follow-up, validateStepOutputs returns no violations
    const strategy = makePipelineDeps({ pushCapability: declaringCapability }).stepIo! as unknown as import("../../../src/core/port/runtime-strategy.js").RuntimeStrategy;
    vi.spyOn(strategy, "validateStepOutputs").mockResolvedValue({ violations: [] });

    const deps = makePipelineDeps({
      pushCapability: declaringCapability,
      stepIo: strategy as never,
    });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    // When detect returns no violations, the output gate should not trigger
    const result = await ctx.policy.outputVerification!.detect();
    expect(result.violations).toHaveLength(0);
  });

  // TC-012: Unpushable-path appears in prompt only on attempt 1 (first follow-up, 1-based)
  it("TC-012: unpushable-path violation appears in buildPrompt at attempt=1 but not attempt=2", async () => {
    const state = makeState();
    const deps = makePipelineDeps({ pushCapability: declaringCapability });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    // Attempt 1: unpushable-path included — this is the one and only follow-up for it
    const prompt1 = ctx.policy.outputVerification!.buildPrompt([unpushableViolation], 1);
    expect(prompt1).toContain("Unpushable path");
    expect(prompt1).toContain(".github/workflows/ci.yml");

    // Attempt 2: only unpushable-path violation remains — all violations filtered → null.
    // The adapter treats null as "skip this repair turn", enforcing the exactly-one-follow-up
    // invariant: no second repair turn is sent even when the violation persists.
    const prompt2 = ctx.policy.outputVerification!.buildPrompt([unpushableViolation], 2);
    expect(prompt2).toBeNull();
  });

  it("TC-012: maxAttempts=2 (not 1) so tasks-complete can use both attempts while unpushable-path is prompt-limited", async () => {
    const state = makeState();
    const deps = makePipelineDeps({ pushCapability: declaringCapability });

    const ctx = await buildStepContext(
      ImplementerStep,
      state,
      deps,
      "/fake/cwd",
      () => {},
      fakeFsAdapter,
    );

    // maxAttempts is now 2 (not 1): the repair loop can run twice for tasks-complete
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(OUTPUT_FOLLOWUP_MAX_ATTEMPTS);
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(2);
  });
});

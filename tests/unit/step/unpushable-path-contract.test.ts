/**
 * Unit tests for the unpushable-path OutputContract kind.
 *
 * Output Contract: unpushable-path kind (Requirement 4):
 *   TC-013: No unpushable-path contract declared under undeclared environment
 *   TC-030: buildOutputFollowUpPrompt generates a path-listing section for violations
 *
 * Follow-up Limit: maxAttempts=1 (T-08):
 *   TC-033: unpushable-path contract sets maxAttempts to 1
 *   TC-034: Contracts without unpushable-path retain the default maxAttempts of 2
 *
 * Follow-up: exactly one turn (Requirement 4):
 *   TC-011: Follow-up resolves the violation and the step proceeds
 *   TC-012: At most one follow-up is sent even when the violation persists
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
import type { PipelineDeps } from "../../../src/core/types.js";
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
  const mockStrategy: RuntimeStrategy = {
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
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async commitFinalState() {},
    async bootstrapJob() { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async validateStepOutputs() { return { violations: [] }; },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
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
    runtimeStrategy: mockStrategy,
    ...overrides,
  } as unknown as PipelineDeps;
}

describe("TC-033 & TC-034: maxAttempts in outputVerification policy", () => {
  const fakeFsAdapter = {
    async readFile(_path: string, _enc: string): Promise<string> {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    async readdir(_dir: string): Promise<string[]> {
      return [];
    },
  };

  // TC-033: unpushable-path contract → maxAttempts=1
  it("TC-033: maxAttempts=1 when unpushable-path is in follow-up contracts", async () => {
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
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(1);
  });

  // TC-034: no unpushable-path → maxAttempts=2 (default)
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

  // TC-011: Follow-up resolves the violation — outputVerification detect returns empty
  it("TC-011: when violations resolve, outputVerification.detect returns empty violations", async () => {
    const state = makeState();
    // Simulate: after follow-up, validateStepOutputs returns no violations
    const strategy = makePipelineDeps({ pushCapability: declaringCapability }).runtimeStrategy!;
    vi.spyOn(strategy, "validateStepOutputs").mockResolvedValue({ violations: [] });

    const deps = makePipelineDeps({
      pushCapability: declaringCapability,
      runtimeStrategy: strategy,
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

  // TC-012: At most one follow-up is sent (maxAttempts=1)
  it("TC-012: maxAttempts=1 ensures at most one follow-up attempt for unpushable-path", async () => {
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

    // With maxAttempts=1, the repair loop will send exactly one follow-up then halt
    expect(ctx.policy.outputVerification!.maxAttempts).toBe(1);
    // Verify the constant is different from the default (2)
    expect(ctx.policy.outputVerification!.maxAttempts).toBeLessThan(OUTPUT_FOLLOWUP_MAX_ATTEMPTS);
  });
});

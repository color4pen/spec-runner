/**
 * T-03: Design step output contract — spec-exempt type (chore) vs spec-required type (bug-fix).
 *
 * Verifies that buildAllOutputContracts:
 * - excludes spec.md from produced contracts for chore (verify: false → no halt possible)
 * - includes spec.md produced contract for bug-fix (verify: true → scaffold detection active)
 *
 * Also verifies that design.md and tasks.md contracts are present for all types.
 */
import { describe, it, expect } from "vitest";
import { buildAllOutputContracts } from "../output-verify.js";
import { DesignStep } from "../design.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import { SPEC_TEMPLATE } from "../../../templates/step-output-templates.js";
import { changeFolderPath } from "../../../util/paths.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(type: string): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "Test", type, slug: "my-change" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: "change/my-change-abc12345",
    history: [],
    error: null,
    steps: {} as JobState["steps"],
  };
}

function makeDeps(type: string): StepDeps {
  const slug = "my-change";
  return {
    slug,
    request: {
      title: "Test",
      type,
      slug,
      content: "Request content.",
      baseBranch: "main",
      adr: false,
    },
    config: {} as StepDeps["config"],
  };
}

// ---------------------------------------------------------------------------
// T-03: chore — spec.md excluded from produced contracts
// ---------------------------------------------------------------------------

describe("buildAllOutputContracts — chore (spec-exempt)", () => {
  it("spec.md is NOT in produced contracts", () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract).toBeUndefined();
  });

  it("design.md IS in produced contracts", () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const designContract = contracts.find((c) => c.path === `${folder}/design.md`);
    expect(designContract).toBeDefined();
    expect(designContract!.kind).toBe("produced");
  });

  it("tasks.md IS in produced contracts", () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const tasksContract = contracts.find((c) => c.path === `${folder}/tasks.md`);
    expect(tasksContract).toBeDefined();
    expect(tasksContract!.kind).toBe("produced");
  });
});

// ---------------------------------------------------------------------------
// T-03: bug-fix — spec.md included in produced contracts with SPEC_TEMPLATE scaffold
// ---------------------------------------------------------------------------

describe("buildAllOutputContracts — bug-fix (spec-required)", () => {
  it("spec.md IS in produced contracts", () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract).toBeDefined();
    expect(specContract!.kind).toBe("produced");
  });

  it("spec.md contract scaffold equals SPEC_TEMPLATE", () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract!.scaffold).toBe(SPEC_TEMPLATE);
  });

  it("spec.md contract policy is 'halt'", () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract!.policy).toBe("halt");
  });

  it("design.md and tasks.md are also in produced contracts", () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const designContract = contracts.find((c) => c.path === `${folder}/design.md`);
    const tasksContract = contracts.find((c) => c.path === `${folder}/tasks.md`);
    expect(designContract).toBeDefined();
    expect(tasksContract).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T-03: other spec-required types also include spec.md
// ---------------------------------------------------------------------------

describe("buildAllOutputContracts — spec-change (spec-required)", () => {
  it("spec.md IS in produced contracts", () => {
    const state = makeState("spec-change");
    const deps = makeDeps("spec-change");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract).toBeDefined();
  });
});

describe("buildAllOutputContracts — new-feature (spec-required)", () => {
  it("spec.md IS in produced contracts", () => {
    const state = makeState("new-feature");
    const deps = makeDeps("new-feature");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract).toBeDefined();
  });
});

describe("buildAllOutputContracts — refactoring (spec-required)", () => {
  it("spec.md IS in produced contracts", () => {
    const state = makeState("refactoring");
    const deps = makeDeps("refactoring");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);

    const folder = changeFolderPath(deps.slug);
    const specPath = `${folder}/spec.md`;
    const specContract = contracts.find((c) => c.path === specPath);
    expect(specContract).toBeDefined();
  });
});

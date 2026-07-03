/**
 * T-04: Runtime consistency for spec-exempt design contracts.
 *
 * Core claim: exemption is applied at the contract construction layer
 * (buildAllOutputContracts), so neither runtime implementation needs to change.
 * Both runtimes see the same contract list; when spec.md is absent from that
 * list, neither runtime can produce a spec.md violation.
 *
 * LocalRuntime coverage: LocalRuntime.validateStepOutputs iterates only over
 * the contracts it receives. Because buildAllOutputContracts excludes spec.md
 * for chore (verify:false), LocalRuntime never reads the spec.md file at all —
 * no injectable seam or real-fs test is required to prove the absence of violation.
 *
 * ManagedRuntime coverage: tested explicitly via mock getRawFile — spec.md
 * content = SPEC_EXEMPT_NOTE causes no violation because no spec.md contract
 * exists in the chore contract list.
 */
import { describe, it, expect } from "vitest";
import { ManagedRuntime } from "../managed.js";
import { buildAllOutputContracts } from "../../step/output-verify.js";
import { DesignStep } from "../../step/design.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../../step/types.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import {
  SPEC_TEMPLATE,
  SPEC_EXEMPT_NOTE,
} from "../../../templates/step-output-templates.js";
import { changeFolderPath } from "../../../util/paths.js";

// ---------------------------------------------------------------------------
// Helpers — state / deps factory
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
    branch: "test-branch",
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
// ManagedRuntime factory (mock getRawFile — no real I/O)
// ---------------------------------------------------------------------------

function makeManagedRuntime(
  getRawFile: (owner: string, name: string, branch: string, filePath: string) => Promise<string | null>,
): ManagedRuntime {
  const mockGithubClient = { getRawFile } as unknown as GitHubClient;
  const mockSessionClient = {} as SessionClient;
  const repo: OriginInfo = { owner: "testowner", name: "testrepo" };
  return new ManagedRuntime(
    "/cwd",
    mockSessionClient,
    mockGithubClient,
    repo,
    // spawnFn: undefined → default; git fetch is caught on failure and ignored
    undefined,
    "fake-token",
  );
}

// ---------------------------------------------------------------------------
// T-04: chore design — no spec.md contract → no violation in either runtime
// ---------------------------------------------------------------------------

describe("T-04: chore design — no spec.md contract (spec-exempt)", () => {
  it("buildAllOutputContracts excludes spec.md for chore", () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);
    // No spec.md contract → LocalRuntime never reads spec.md → no violation possible
    expect(contracts.find((c) => c.path === `${folder}/spec.md`)).toBeUndefined();
  });

  it("ManagedRuntime: no spec.md violation even when getRawFile returns SPEC_EXEMPT_NOTE", async () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);

    const managedRuntime = makeManagedRuntime(async (_owner, _name, _branch, filePath) => {
      if (filePath === `${folder}/spec.md`) return SPEC_EXEMPT_NOTE;
      if (filePath === `${folder}/design.md`) return "# Design\n\n## Context\nSome context.\n";
      if (filePath === `${folder}/tasks.md`) return "# Tasks\n\n- [x] Done\n";
      return null;
    });

    const result = await managedRuntime.validateStepOutputs(contracts, "/cwd", "test-branch");
    const specViolations = result.violations.filter((v) => v.path === `${folder}/spec.md`);
    expect(specViolations).toHaveLength(0);
  });

  it("ManagedRuntime: zero total violations when design.md and tasks.md are non-empty", async () => {
    const state = makeState("chore");
    const deps = makeDeps("chore");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);

    const managedRuntime = makeManagedRuntime(async (_owner, _name, _branch, filePath) => {
      if (filePath === `${folder}/design.md`) return "# Design\n\nSome real content.\n";
      if (filePath === `${folder}/tasks.md`) return "# Tasks\n\n- [x] Done\n";
      return null;
    });

    const result = await managedRuntime.validateStepOutputs(contracts, "/cwd", "test-branch");
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-04: bug-fix design — spec.md contract present → violation when scaffold unchanged
// ---------------------------------------------------------------------------

describe("T-04: bug-fix design — spec.md violation when scaffold unchanged (regression)", () => {
  it("buildAllOutputContracts includes spec.md with SPEC_TEMPLATE scaffold for bug-fix", () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);
    const specContract = contracts.find((c) => c.path === `${folder}/spec.md`);
    expect(specContract).toBeDefined();
    expect(specContract!.scaffold).toBe(SPEC_TEMPLATE);
    expect(specContract!.policy).toBe("halt");
  });

  it("ManagedRuntime: spec.md violation when getRawFile returns SPEC_TEMPLATE scaffold", async () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);

    const managedRuntime = makeManagedRuntime(async (_owner, _name, _branch, filePath) => {
      if (filePath === `${folder}/spec.md`) return SPEC_TEMPLATE; // untouched scaffold
      if (filePath === `${folder}/design.md`) return "# Design\n\nSome content.\n";
      if (filePath === `${folder}/tasks.md`) return "# Tasks\n\n- [x] Done\n";
      return null;
    });

    const result = await managedRuntime.validateStepOutputs(contracts, "/cwd", "test-branch");
    const specViolations = result.violations.filter((v) => v.path === `${folder}/spec.md`);
    expect(specViolations).toHaveLength(1);
    expect(specViolations[0]!.policy).toBe("halt");
  });

  it("ManagedRuntime: no spec.md violation when getRawFile returns non-scaffold content", async () => {
    const state = makeState("bug-fix");
    const deps = makeDeps("bug-fix");
    const contracts = buildAllOutputContracts(DesignStep, state, deps);
    const folder = changeFolderPath(deps.slug);

    const managedRuntime = makeManagedRuntime(async (_owner, _name, _branch, filePath) => {
      if (filePath === `${folder}/spec.md`) return "# Spec\n\n## Requirements\n\n### Requirement: Foo SHALL bar\n\nFoo SHALL bar.\n\n#### Scenario: bar\n\n**Given** foo\n**When** bar\n**Then** baz\n";
      if (filePath === `${folder}/design.md`) return "# Design\n\nSome content.\n";
      if (filePath === `${folder}/tasks.md`) return "# Tasks\n\n- [x] Done\n";
      return null;
    });

    const result = await managedRuntime.validateStepOutputs(contracts, "/cwd", "test-branch");
    const specViolations = result.violations.filter((v) => v.path === `${folder}/spec.md`);
    expect(specViolations).toHaveLength(0);
  });
});

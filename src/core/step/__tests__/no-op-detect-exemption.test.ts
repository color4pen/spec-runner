/**
 * detectNoOp — findingTargetPaths / pipelineManagedPaths 省略時は従来と同一 verdict
 *
 * Tests that the optional parameters of `detectNoOp` are backward-compatible:
 * - Omitting both preserves the exact pre-existing behavior (exempt = ∅)
 * - Providing findingTargetPaths exempts named paths from the artifact filter
 * - pipelineManagedPaths caps the exemption (named path is not counted as work)
 *
 * Note: findingsRoutingApproved was removed (D5 / severity-fixability-split).
 * The suppression test (TC-011 approved findings-routing) is also removed.
 *
 * Source: tasks.md > T-02 (Acceptance Criteria) / design.md > D2
 */

import { describe, it, expect, vi } from "vitest";
import { detectNoOp } from "../no-op-detect.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(noOpDetect?: boolean) {
  return {
    kind: "agent" as const,
    name: "code-fixer",
    agent: { id: "code-fixer-agent" } as never,
    completionVerdict: "approved" as const,
    noOpDetect,
    buildMessage: () => "fix the code",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeRuntimeStrategy(changedFiles: string[]) {
  return {
    captureHeadSha: vi.fn(async () => "abc123head" as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => [] as never[]),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: changedFiles })),
  };
}

const BASE_PARAMS = {
  headBeforeStep: "abc123",
  cwd: "/tmp/worktree",
  branch: "feat/example-abc12345",
  completionReason: "success" as const,
} as const;

// ---------------------------------------------------------------------------
// TC-011: params omitted → same verdict as before param introduction
// ---------------------------------------------------------------------------

describe("detectNoOp — findingTargetPaths / pipelineManagedPaths 省略時は従来と同一", () => {
  // Source: tasks.md > T-02 (Acceptance Criteria) / design.md > D2
  // When both params are omitted, detectNoOp MUST behave exactly as it did before
  // the param was introduced (exempt = ∅).
  //
  // Note: findingsRoutingApproved was removed (D5). Artifact-only no-ops are now
  // always escalated regardless of whether code-review was approved+fixable.

  it("artifact-only changes, params omitted → 'needs-fix' (same as pre-param behavior)", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      // findingTargetPaths: omitted → exempt = ∅ → same as before
      // pipelineManagedPaths: omitted → managed = ∅
    });
    expect(result).toBe("needs-fix");
  });

  it("no changed files, params omitted → 'needs-fix' (same as pre-param behavior)", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
    });
    expect(result).toBe("needs-fix");
  });

  it("source files changed, params omitted → undefined (not a no-op, same as before)", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy(["src/foo.ts"]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
    });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-011 extended: findingTargetPaths exempts named paths from the artifact filter
// ---------------------------------------------------------------------------

describe("detectNoOp — findingTargetPaths exemption", () => {
  it("finding-named artifact path IS counted as work when in findingTargetPaths", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/implementation-notes.md",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      findingTargetPaths: ["specrunner/changes/example/implementation-notes.md"],
      pipelineManagedPaths: [], // state.json etc. are managed; implementation-notes.md is not
    });
    // implementation-notes.md is exempt (finding named it) → sourceFiles = [it] → not empty → no override
    expect(result).toBeUndefined();
  });

  it("artifact path NOT in findingTargetPaths is still filtered as artifact", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/other-doc.md",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      findingTargetPaths: ["specrunner/changes/example/implementation-notes.md"],
      pipelineManagedPaths: [],
    });
    // other-doc.md is NOT in findingTargetPaths → not exempt → sourceFiles = [] → needs-fix
    expect(result).toBe("needs-fix");
  });

  it("pipelineManagedPaths caps the exemption — named state.json still filtered", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      // state.json is in both findingTargetPaths AND pipelineManagedPaths → cap wins → not exempt
      findingTargetPaths: ["specrunner/changes/example/state.json"],
      pipelineManagedPaths: [
        "specrunner/changes/example/state.json",
        "specrunner/changes/example/events.jsonl",
        "specrunner/changes/example/usage.json",
        "specrunner/changes/example/bite-evidence-result.md",
        "specrunner/changes/example/pr-create-result.md",
      ],
    });
    // state.json is capped (managed) → exempt = ∅ after subtraction → sourceFiles = [] → needs-fix
    expect(result).toBe("needs-fix");
  });

  it("only pipelineManagedPaths files changed, findingTargetPaths empty → needs-fix", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "specrunner/changes/example/events.jsonl",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      findingTargetPaths: [],
      pipelineManagedPaths: [
        "specrunner/changes/example/state.json",
        "specrunner/changes/example/events.jsonl",
      ],
    });
    expect(result).toBe("needs-fix");
  });

  it("source file in findingTargetPaths still counts as work (no regression)", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy(["src/foo.ts"]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      findingTargetPaths: ["src/foo.ts"],
      pipelineManagedPaths: [],
    });
    // src/foo.ts is not an artifact prefix path → sourceFiles contains it regardless of exempt
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Backward compat: noOpDetect === false / completionReason !== "success"
// ---------------------------------------------------------------------------

describe("detectNoOp — unchanged early-return paths", () => {
  it("noOpDetect: false → undefined (unchanged by new params)", async () => {
    const step = makeStep(false);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      findingTargetPaths: ["specrunner/changes/example/state.json"],
      pipelineManagedPaths: [],
    });
    expect(result).toBeUndefined();
    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();
  });

  it("completionReason !== 'success' → undefined (unchanged by new params)", async () => {
    const step = makeStep(true);
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
    ]);
    const result = await detectNoOp(step, runtimeStrategy as never, {
      ...BASE_PARAMS,
      completionReason: "timeout",
      findingTargetPaths: ["specrunner/changes/example/state.json"],
      pipelineManagedPaths: [],
    });
    expect(result).toBeUndefined();
    expect(runtimeStrategy.listChangedFiles).not.toHaveBeenCalled();
  });
});

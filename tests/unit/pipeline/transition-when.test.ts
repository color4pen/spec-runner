/**
 * Unit tests for context-aware (`when`) pipeline transitions.
 *
 * TC-1: delta-spec-validation approved + code-review 未実行 → spec-review (1st phase)
 * TC-2: delta-spec-validation approved + code-review 実行済み → adr-gen (2nd phase)
 * TC-3: code-review approved → delta-spec-validation (新 transition)
 * TC-4: `when` なしの既存 transition は従来通り動作 (regression)
 * TC-5: delta-spec-validation needs-fix → delta-spec-fixer (phase に関係なく同一)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { Pipeline } from "../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { makeStoreFactory } from "../../helpers/store-factory.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "transition-when-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

function makeMinimalState(jobId: string = "test-job", extraSteps?: Record<string, import("../../../src/state/schema.js").StepRun[]>): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: extraSteps ?? {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    },
    owner: "user",
    repo: "repo",
    spawn: (async () => ({ exitCode: 0, stdout: "", stderr: "" })) as SpawnFn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

function makeStepObject(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../src/state/schema.js").AgentStepName,
      model: "claude-sonnet-4-5",
      system: `system for ${name}`,
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    completionVerdict: "success" as const,
  };
}

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(state));
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: delta-spec-validation approved, code-review 未実行 → spec-review
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-1: delta-spec-validation approved (no code-review yet) → spec-review", () => {
  it("routes to spec-review when code-review has zero attempts", async () => {
    const jobId = "tc-when-01";
    const state = makeMinimalState(jobId, {}); // no code-review entries
    await seedJobState(jobId, state);

    const events = new EventBus();
    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState): Promise<JobState> => {
      if (step.name === "delta-spec-validation") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "delta-spec-validation": [
              ...(s.steps?.["delta-spec-validation"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      // spec-review: end pipeline
      if (step.name === "spec-review") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "spec-review": [
              ...(s.steps?.["spec-review"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    // Minimal transition table that mirrors the context-aware logic
    const pipeline = new Pipeline({
      steps: new Map([
        ["delta-spec-validation", makeStepObject("delta-spec-validation")],
        ["spec-review", makeStepObject("spec-review")],
      ]),
      transitions: [
        // 2nd-phase conditional (code-review ran) → adr-gen
        { step: "delta-spec-validation", on: "approved", to: "adr-gen",
          when: (s) => (s.steps?.["code-review"]?.length ?? 0) > 0 },
        // 1st-phase fallback → spec-review
        { step: "delta-spec-validation", on: "approved", to: "spec-review" },
        // Terminate after spec-review approved
        { step: "spec-review", on: "approved", to: "end" },
        { step: "spec-review", on: "needs-fix", to: "escalate" },
        { step: "spec-review", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "delta-spec-validation"],
    });

    const result = await pipeline.run("delta-spec-validation", state, makeMinimalDeps());
    // pipeline should have transitioned through spec-review
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "spec-review" }), expect.anything(), expect.anything());
    // adr-gen must NOT have been called
    expect(executeSpy).not.toHaveBeenCalledWith(expect.objectContaining({ name: "adr-gen" }), expect.anything(), expect.anything());
    expect(result.status).toBe("awaiting-merge");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: delta-spec-validation approved, code-review 実行済み → adr-gen
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-2: delta-spec-validation approved (code-review done) → adr-gen", () => {
  it("routes to adr-gen when code-review has at least one attempt in state.steps", async () => {
    const jobId = "tc-when-02";
    // Pre-seed code-review with one completed attempt
    const state = makeMinimalState(jobId, {
      "code-review": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved" as const, findingsPath: null, error: null },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      ],
    });
    await seedJobState(jobId, state);

    const events = new EventBus();
    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState): Promise<JobState> => {
      if (step.name === "delta-spec-validation") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "delta-spec-validation": [
              ...(s.steps?.["delta-spec-validation"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "adr-gen") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "adr-gen": [
              ...(s.steps?.["adr-gen"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "success" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      if (step.name === "pr-create") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "pr-create": [
              ...(s.steps?.["pr-create"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "success" as const, findingsPath: null, error: null },
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["delta-spec-validation", makeStepObject("delta-spec-validation")],
        ["adr-gen", makeStepObject("adr-gen")],
        ["pr-create", makeStepObject("pr-create")],
      ]),
      transitions: STANDARD_TRANSITIONS,
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "delta-spec-validation",
      loopNames: ["delta-spec-validation"],
    });

    await pipeline.run("delta-spec-validation", state, makeMinimalDeps());

    // adr-gen must have been called
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "adr-gen" }), expect.anything(), expect.anything());
    // spec-review must NOT have been called
    expect(executeSpy).not.toHaveBeenCalledWith(expect.objectContaining({ name: "spec-review" }), expect.anything(), expect.anything());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3: code-review approved → delta-spec-validation (新 transition)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-3: code-review approved → delta-spec-validation exists in STANDARD_TRANSITIONS", () => {
  it("STANDARD_TRANSITIONS has code-review --approved→ delta-spec-validation", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "delta-spec-validation",
    );
    expect(found).toBeDefined();
    // No `when` predicate — fires unconditionally
    expect(found!.when).toBeUndefined();
  });

  it("code-review --approved→ adr-gen does NOT exist unconditionally in STANDARD_TRANSITIONS", () => {
    // The direct code-review → adr-gen row has been replaced with code-review → delta-spec-validation
    const unconditional = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(unconditional).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-4: `when` なしの既存 transition は従来通り動作 (regression)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-4: existing transitions without `when` still work (regression)", () => {
  it("verification --passed→ code-review has no `when` and is found", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "code-review",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeUndefined();
  });

  it("implementer --success→ verification has no `when` and is found", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "implementer" && t.on === "success" && t.to === "verification",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-5: delta-spec-validation needs-fix → delta-spec-fixer (phase に関係なく同一)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-5: delta-spec-validation needs-fix → delta-spec-fixer (both phases)", () => {
  it("STANDARD_TRANSITIONS has delta-spec-validation --needs-fix→ delta-spec-fixer", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "needs-fix" && t.to === "delta-spec-fixer",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeUndefined(); // no `when` — fires in both phases
  });

  it("delta-spec-fixer --approved→ delta-spec-validation exists (loop back)", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-fixer" && t.on === "approved" && t.to === "delta-spec-validation",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-WHEN-01: delta-spec-validation approved conditional row has `when` predicate
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-WHEN-01: conditional transition row has `when` predicate", () => {
  it("delta-spec-validation --approved→ adr-gen row has a `when` function", () => {
    const conditionalRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(conditionalRow).toBeDefined();
    expect(typeof conditionalRow!.when).toBe("function");
  });

  it("when predicate returns false when code-review has 0 attempts", () => {
    const conditionalRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(conditionalRow!.when).toBeDefined();
    const stateNoCodeReview = makeMinimalState("test", {});
    expect(conditionalRow!.when!(stateNoCodeReview)).toBe(false);
  });

  it("when predicate returns true when code-review has 1 attempt", () => {
    const conditionalRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(conditionalRow!.when).toBeDefined();
    const stateWithCodeReview = makeMinimalState("test", {
      "code-review": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved" as const, findingsPath: null, error: null },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      ],
    });
    expect(conditionalRow!.when!(stateWithCodeReview)).toBe(true);
  });

  it("when predicate returns false when state.steps is undefined", () => {
    const conditionalRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "delta-spec-validation" && t.on === "approved" && t.to === "adr-gen",
    );
    const stateNoSteps: JobState = {
      ...makeMinimalState("test"),
      steps: undefined,
    };
    expect(conditionalRow!.when!(stateNoSteps)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-WHEN-02: STANDARD_TRANSITIONS has 31 rows (30 previous + 1 new conditional)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-WHEN-02: STANDARD_TRANSITIONS row count", () => {
  it("has 33 rows (31 previous + 2 new observation-auto-fix rows)", () => {
    // 31 rows (previous total including adr-gen rows and conditional delta-spec-validation → adr-gen)
    // + 1: code-review --approved→ code-fixer (conditional, when: fixCount > 0)
    // + 1: code-fixer --approved→ delta-spec-validation (conditional, when: last review was approved)
    expect(STANDARD_TRANSITIONS.length).toBe(33);
  });
});

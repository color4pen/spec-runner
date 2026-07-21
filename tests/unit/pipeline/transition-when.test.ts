/**
 * Unit tests for context-aware (`when`) pipeline transitions.
 *
 * TC-1: code-review approved + fixable findings ≥ 1 → code-fixer (findings-derived routing)
 * TC-2: code-fixer approved + prior code-review approved → adr-gen
 * TC-3: code-review approved (no fixable findings) → conformance directly
 * TC-4: `when` なしの既存 transition は従来通り動作 (regression)
 * TC-WHEN-01: code-review approved → code-fixer conditional row has `when` predicate
 * TC-WHEN-02: STANDARD_TRANSITIONS row count
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import type { BaseReportResult } from "../../../src/core/port/report-result.js";
import type { Finding } from "../../../src/kernel/report-result.js";
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
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
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
// TC-3: code-review approved → conformance (direct)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-3: code-review approved → conformance exists in STANDARD_TRANSITIONS", () => {
  it("STANDARD_TRANSITIONS has code-review --approved→ conformance (fallback, no `when`)", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "conformance" && !t.when,
    );
    expect(found).toBeDefined();
    // No `when` predicate — fires unconditionally (after fixable routing check)
    expect(found!.when).toBeUndefined();
  });

  it("code-review --approved→ adr-gen does NOT exist (now via conformance)", () => {
    const directRoute = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(directRoute).toBeUndefined();
  });

  it("code-review --approved→ delta-spec-validation does NOT exist (removed step)", () => {
    const dsvRoute = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "delta-spec-validation",
    );
    expect(dsvRoute).toBeUndefined();
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

  it("implementer --success→ bite-evidence has no `when` and is found", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "implementer" && t.on === "success" && t.to === "bite-evidence",
    );
    expect(found).toBeDefined();
    expect(found!.when).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-WHEN-01: code-review approved → code-fixer conditional row has `when` predicate
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-WHEN-01: conditional transition row has `when` predicate", () => {
  it("code-review --approved→ code-fixer row has a `when` function (fixable routing)", () => {
    const conditionalRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "code-fixer",
    );
    expect(conditionalRow).toBeDefined();
    expect(typeof conditionalRow!.when).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-WHEN-02: STANDARD_TRANSITIONS has expected row count
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-WHEN-02: STANDARD_TRANSITIONS row count", () => {
  it("has correct number of rows (+4 for bite-evidence gate transitions)", () => {
    // 40 previous + 4 (bite-evidence: passed→verification, strategy-deferred→verification, failed→escalate, error→escalate)
    // Note: implementer→verification row replaced by implementer→bite-evidence (same count), plus 4 new bite-evidence rows
    expect(STANDARD_TRANSITIONS.length).toBe(44);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: conformance approved → verification (when codeChangedSinceLastVerification)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: conformance approved → verification when-guard exists", () => {
  it("STANDARD_TRANSITIONS has conformance --approved→ verification row with `when` function", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "verification",
    );
    expect(row).toBeDefined();
    expect(typeof row!.when).toBe("function");
  });

  it("conformance --approved→ verification row appears before conformance --approved→ adr-gen", () => {
    const verificationIdx = STANDARD_TRANSITIONS.findIndex(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "verification",
    );
    const adrGenIdx = STANDARD_TRANSITIONS.findIndex(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "adr-gen",
    );
    expect(verificationIdx).toBeGreaterThanOrEqual(0);
    expect(adrGenIdx).toBeGreaterThanOrEqual(0);
    expect(verificationIdx).toBeLessThan(adrGenIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: verification passed → adr-gen (when conformanceApprovedLatest)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: verification passed → adr-gen when-guard exists", () => {
  it("STANDARD_TRANSITIONS has verification --passed→ adr-gen row with `when` function", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "adr-gen",
    );
    expect(row).toBeDefined();
    expect(typeof row!.when).toBe("function");
  });

  it("verification --passed→ adr-gen row appears before verification --passed→ code-review", () => {
    const adrGenIdx = STANDARD_TRANSITIONS.findIndex(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "adr-gen",
    );
    const codeReviewIdx = STANDARD_TRANSITIONS.findIndex(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "code-review",
    );
    expect(adrGenIdx).toBeGreaterThanOrEqual(0);
    expect(codeReviewIdx).toBeGreaterThanOrEqual(0);
    expect(adrGenIdx).toBeLessThan(codeReviewIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: fallback rows (no `when`) are retained alongside the new when-guards
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: fallback rows (no when) are retained", () => {
  it("conformance --approved→ adr-gen (no when) still exists", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "conformance" && t.on === "approved" && t.to === "adr-gen" && !t.when,
    );
    expect(row).toBeDefined();
    expect(row!.when).toBeUndefined();
  });

  it("verification --passed→ code-review (no when) still exists", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "verification" && t.on === "passed" && t.to === "code-review" && !t.when,
    );
    expect(row).toBeDefined();
    expect(row!.when).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017/TC-018: code-review approved → code-fixer `when` predicate (findings-derived routing)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017/TC-018: code-review approved → code-fixer when predicate (findings-derived routing)", () => {
  function getFixableRoutingWhen() {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.to === "code-fixer",
    );
    expect(row).toBeDefined();
    expect(typeof row!.when).toBe("function");
    return row!.when!;
  }

  type ToolResultShape = BaseReportResult & {
    approved?: boolean;
    fixableCount?: number;
    findings?: Finding[];
  };

  function makeStateWithCodeReviewToolResult(toolResult: ToolResultShape | null): JobState {
    return makeMinimalState("test", {
      "code-review": [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "approved" as const,
            findingsPath: null,
            error: null,
            toolResult,
          },
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      ],
    });
  }

  function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
    return {
      severity: "medium",
      resolution: "fixable",
      file: "src/foo.ts",
      title: "Fixable finding",
      rationale: "Should be fixed",
      ...overrides,
    };
  }

  it("returns true when findings contain a fixable finding (resolution: fixable)", () => {
    const when = getFixableRoutingWhen();
    const toolResult: ToolResultShape = {
      ok: true,
      approved: true,
      findings: [makeFixableFinding()],
    };
    expect(when(makeStateWithCodeReviewToolResult(toolResult))).toBe(true);
  });

  it("returns false when findings is empty", () => {
    const when = getFixableRoutingWhen();
    const toolResult: ToolResultShape = { ok: true, approved: true, findings: [] };
    expect(when(makeStateWithCodeReviewToolResult(toolResult))).toBe(false);
  });

  it("returns false when toolResult is null", () => {
    const when = getFixableRoutingWhen();
    expect(when(makeStateWithCodeReviewToolResult(null))).toBe(false);
  });

  it("contradiction: fixableCount=0 + fixable findings → true (follows findings)", () => {
    const when = getFixableRoutingWhen();
    const toolResult: ToolResultShape = {
      ok: true,
      approved: true,
      fixableCount: 0,
      findings: [makeFixableFinding()],
    };
    expect(when(makeStateWithCodeReviewToolResult(toolResult))).toBe(true);
  });

  it("contradiction: fixableCount=3 + no findings field → false (follows findings)", () => {
    const when = getFixableRoutingWhen();
    const toolResult: ToolResultShape = {
      ok: true,
      approved: true,
      fixableCount: 3,
      // findings absent — resolves to []
    };
    expect(when(makeStateWithCodeReviewToolResult(toolResult))).toBe(false);
  });

  it("returns false when findings only contains decision-needed (no fixable)", () => {
    const when = getFixableRoutingWhen();
    const toolResult: ToolResultShape = {
      ok: true,
      approved: true,
      findings: [makeFixableFinding({ resolution: "decision-needed" })],
    };
    expect(when(makeStateWithCodeReviewToolResult(toolResult))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: code-fixer approved + prior code-review approved → conformance → verification → adr-gen
// (post-fixer-reverification: code-fixer ran after verification, so re-verify is triggered)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-2: code-fixer approved (code-review done) → conformance → verification → adr-gen", () => {
  it("routes through verification re-check before adr-gen when code-fixer ran after verification", async () => {
    const jobId = "tc-when-02";
    // Pre-seed code-review with one approved attempt (before code-fixer runs)
    const T0 = "2026-01-01T00:00:01.000Z"; // code-review timestamp (before code-fixer)
    const state = makeMinimalState(jobId, {
      "code-review": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved" as const, findingsPath: null, error: null },
          startedAt: T0,
          endedAt: T0,
        },
      ],
    });
    await seedJobState(jobId, state);

    let stepCounter = 1;
    function nextTs() {
      stepCounter++;
      return `2026-01-01T00:00:0${stepCounter}.000Z`;
    }

    const events = new EventBus();
    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState): Promise<JobState> => {
      const ts = nextTs();
      if (step.name === "code-fixer") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "code-fixer": [
              ...(s.steps?.["code-fixer"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: ts,
                endedAt: ts, // T2 > T0 (code-review) → no verification run yet → re-verify
              },
            ],
          },
        };
      }
      if (step.name === "conformance") {
        return {
          ...s,
          steps: {
            ...s.steps,
            "conformance": [
              ...(s.steps?.["conformance"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved" as const, findingsPath: null, error: null },
                startedAt: ts,
                endedAt: ts,
                // T-05: commitOid required so conformanceApprovedForVerifiedRevision can
                // match against the verification run's commitOid.
                commitOid: "sha-c",
              },
            ],
          },
        };
      }
      if (step.name === "verification") {
        // Re-verification: conformance is already approved → after pass, goes to adr-gen
        return {
          ...s,
          steps: {
            ...s.steps,
            "verification": [
              ...(s.steps?.["verification"] ?? []),
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "passed" as const, findingsPath: null, error: null },
                startedAt: ts,
                endedAt: ts,
                // T-05: commitOid must match conformance's commitOid so that
                // conformanceApprovedForVerifiedRevision guard returns true → adr-gen.
                commitOid: "sha-c",
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
                startedAt: ts,
                endedAt: ts,
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
                startedAt: ts,
                endedAt: ts,
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
        ["code-fixer", makeStepObject("code-fixer")],
        ["conformance", makeStepObject("conformance")],
        ["verification", {
          kind: "cli" as const,
          name: "verification",
          run: async () => {},
          resultFilePath: () => "/tmp/verification-result.md",
          parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
        }],
        ["build-fixer", makeStepObject("build-fixer")],
        ["adr-gen", makeStepObject("adr-gen")],
        ["pr-create", makeStepObject("pr-create")],
      ]),
      transitions: STANDARD_TRANSITIONS,
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "code-fixer",
      loopNames: ["code-fixer", "conformance", "verification"],
    });

    await pipeline.run("code-fixer", state, makeMinimalDeps());

    // conformance must have been called
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "conformance" }), expect.anything(), expect.anything());
    // verification must have been called (re-verification triggered by code-fixer running after no verification)
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "verification" }), expect.anything(), expect.anything());
    // adr-gen must have been called (after re-verification passed)
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "adr-gen" }), expect.anything(), expect.anything());
    // code-review must NOT have been called again
    expect(executeSpy).not.toHaveBeenCalledWith(expect.objectContaining({ name: "code-review" }), expect.anything(), expect.anything());
  });
});

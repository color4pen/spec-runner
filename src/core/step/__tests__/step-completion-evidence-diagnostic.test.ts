/**
 * Tests for diagnostic output when checked=0 is detected by step-completion.
 *
 * Source: design.md D7 / tasks.md T-05
 *
 * TC-025: checked=0 を検出したとき step-completion が stderr に診断を出力する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deriveStepCompletion } from "../step-completion.js";
import { JUDGE_REPORT_TOOL, CONFORMANCE_REPORT_TOOL } from "../report-tool.js";
import type { Step } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalJudgeStep(name: string = "code-review", reportTool = JUDGE_REPORT_TOOL): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    reportTool,
    buildMessage: () => "perform review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

function makeMinimalState(step: string = "code-review"): JobState {
  return {
    version: 2,
    jobId: "diag-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "specrunner/changes/diag/request.md", title: "Diag Test", type: "bug-fix", slug: "diag" },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step,
    status: "running",
    branch: "change/diag-test-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    slug: "diag",
    cwd: "/tmp",
    config: { version: 1, agents: {} } as unknown as PipelineDeps["config"],
    request: {
      type: "bug-fix",
      title: "Diag Test",
      slug: "diag",
      baseBranch: "main",
      content: "content",
      adr: false,
      path: "specrunner/changes/diag/request.md",
    },
    githubClient: {} as unknown as PipelineDeps["githubClient"],
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: (() => ({})) as unknown as PipelineDeps["storeFactory"],
    runner: {} as unknown as PipelineDeps["runner"],
    // runtimeStrategy absent → finding ref verification and scope check are skipped
  } as unknown as PipelineDeps;
}

// ---------------------------------------------------------------------------
// TC-025: checked=0 → stderr diagnostic output
// Source: design.md D7 / tasks.md T-05
// ---------------------------------------------------------------------------

describe("TC-025: checked=0 detection causes step-completion to write diagnostic to stderr", () => {
  let stderrMessages: string[] = [];
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    stderrMessages = [];
    originalStderrWrite = process.stderr.write.bind(process.stderr);
    vi.spyOn(process.stderr, "write").mockImplementation((msg: unknown) => {
      stderrMessages.push(String(msg));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void originalStderrWrite;
  });

  it("TC-025: judge step with checked=0 in evidence → verdict is 'escalation' AND diagnostic is written to stderr", async () => {
    const step = makeMinimalJudgeStep("code-review", JUDGE_REPORT_TOOL);
    const state = makeMinimalState("code-review");
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence: { checked: 0, skipped: 5, unverified: 0 },
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // TC-025: verdict must be escalation (vacuous check)
    expect(completion.verdict).toBe("escalation");

    // TC-025: diagnostic must be written to stderr before or during verdict derivation
    const allStderr = stderrMessages.join("\n");
    const hasCheckedZeroMention = allStderr.includes("checked=0") || allStderr.includes("checked: 0");
    const hasVacuousMention = allStderr.includes("検証実績ゼロ") || allStderr.includes("vacuous") || allStderr.includes("判定不能");
    expect(hasCheckedZeroMention || hasVacuousMention).toBe(true);
  });

  it("TC-025: conformance step with checked=0 → verdict is 'escalation' AND diagnostic is written to stderr", async () => {
    const step = makeMinimalJudgeStep("conformance", CONFORMANCE_REPORT_TOOL);
    const state = makeMinimalState("conformance");
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence: { checked: 0, skipped: 0, unverified: 3 },
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // TC-025: verdict must be escalation for conformance too
    expect(completion.verdict).toBe("escalation");

    // TC-025: diagnostic must mention the zero-checked condition
    const allStderr = stderrMessages.join("\n");
    const hasDiagnostic =
      allStderr.includes("checked=0") ||
      allStderr.includes("検証実績ゼロ") ||
      allStderr.includes("vacuous") ||
      allStderr.includes("判定不能") ||
      allStderr.includes("checked: 0");
    expect(hasDiagnostic).toBe(true);
  });

  it("TC-025: judge step with checked>0 → verdict is 'approved' AND no zero-checked diagnostic", async () => {
    const step = makeMinimalJudgeStep("spec-review", JUDGE_REPORT_TOOL);
    const state = makeMinimalState("spec-review");
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [],
        evidence: { checked: 5, skipped: 0, unverified: 0 },
      } as unknown as import("../../../state/schema.js").StepOutcome["toolResult"],
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(step, state, deps, agentResult, undefined);

    // TC-025: approved is expected when checked > 0
    expect(completion.verdict).toBe("approved");

    // No zero-checked diagnostic should be emitted
    const allStderr = stderrMessages.join("\n");
    expect(allStderr).not.toContain("検証実績ゼロ");
  });
});

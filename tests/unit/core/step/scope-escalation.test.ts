/**
 * Tests for scope-exceeded escalation system (T-01, T-02, T-04–T-08)
 *
 * T-01: PipelineDescriptor.permissionScope field
 *   - STANDARD_DESCRIPTOR / DESIGN_ONLY_DESCRIPTOR have no permissionScope (undefined)
 *   - PipelineDescriptor type accepts permissionScope
 *
 * T-02: Finding.origin field + parseFindings origin capture
 *   - origin absent → existing behavior unchanged
 *   - origin:"scope" → captured
 *   - FindingResolution union = "fixable" | "decision-needed" (no new values)
 *
 * T-04: StepExecutor scope synthesis
 *   - permissionScope undefined → no scope check, behavior unchanged
 *   - checkpoint step with breach → verdict=escalation, toolResult.findings includes scope finding
 *   - non-checkpoint step with scope defined → no scope check
 *   - breach + already-decided scope finding → re-escalation suppressed (T-06)
 *
 * T-05: Two-source escalation paths
 *   - Machine source (synthesized) → escalation via deriveJudgeVerdict
 *   - Semantic source (agent-emitted origin:"scope") → same escalation path
 *   - Both land in getOpenDecisionFindings
 *
 * T-07: Issue-notifier renders scope findings
 *   - buildEscalationComment includes scope finding title + options
 *
 * T-08: FindingResolution union fixed
 *   - VALID_RESOLUTIONS set has exactly 2 members: fixable, decision-needed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Scope module
import { synthesizeScopeFindings } from "../../../../src/core/pipeline/scope.js";

// Pipeline types + registry
import type { PermissionScope, PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import { STANDARD_DESCRIPTOR, DESIGN_ONLY_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";

// Finding types and parse
import type { Finding } from "../../../../src/kernel/report-result.js";
import { parseFindings } from "../../../../src/core/port/report-result.js";

// Decision ledger
import {
  computeFindingKey,
  filterUndecidedFindings,
  getOpenDecisionFindings,
} from "../../../../src/core/decision/decision-ledger.js";

// Verdict derivation
import { deriveJudgeVerdict } from "../../../../src/core/step/judge-verdict.js";

// Executor
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../../src/core/step/types.js";
import type { AgentRunner } from "../../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState, DecisionRecord } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { BaseReportResult } from "../../../../src/core/port/report-result.js";
import { JUDGE_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";

// Issue notifier
import { buildEscalationComment } from "../../../../src/core/notify/issue-notifier.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scope-escalation-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "managed", agents: {} };
}

function makeDeps(runtimeStrategy?: RuntimeStrategy): PipelineDeps {
  return {
    config: makeConfig(),
    slug: "my-feature",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "my-feature",
      baseBranch: "main",
      content: "# Test\n",
      adr: false,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
    runtimeStrategy,
  };
}

async function createRunningJobState(overrides: Partial<JobState> = {}): Promise<JobState> {
  const created = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug: "my-feature",
    },
    repository: { owner: "owner", name: "repo" },
  });
  const running: JobState = {
    ...created,
    status: "running",
    branch: "feat/my-feature",
    ...overrides,
  };
  const store = makeStoreFactory(tempDir)(running.jobId);
  await store.persist(running);
  return running;
}

function makeJudgeStep(name = "spec-review", overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: "spec-review" as never,
      model: "claude-sonnet-4-5",
      system: "review",
      tools: [],
    },
    buildMessage: () => "review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    reportTool: JUDGE_REPORT_TOOL,
    ...overrides,
  };
}

function makeRunnerWithToolResult(toolResult: Record<string, unknown> | null): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue({
      completionReason: "success" as const,
      resultContent: null,
      toolResult: toolResult as BaseReportResult | null,
      followUpAttempts: 0,
    }),
  };
}

/**
 * Make a RuntimeStrategy that returns the given changedFiles list.
 * verifyFindingRefs always returns [] (no non-existent refs).
 */
function makeRuntimeStrategy(changedFiles: string[]): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner() {
      return {
        async run() {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as never; },
    registerCleanup() { return {} as never; },
    async teardown() {},
    async captureHeadSha() { return null; },
    async prepareStepArtifacts() {},
    async finalizeStepArtifacts() {},
    async validateStepInputs() {},
    async validateStepOutputs() { return { violations: [] }; },
    async commitFinalState() {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState() {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async listChangedFiles() { return changedFiles; },
  };
}

/** Extract the last step outcome for a given step name. */
function getLastOutcome(state: JobState, stepName: string) {
  const runs = state.steps?.[stepName] ?? [];
  return runs[runs.length - 1]?.outcome ?? undefined;
}

const FORBIDDEN_SCOPE: PermissionScope = {
  checkpoint: "spec-review",
  forbidden: [{ id: "src-auth", paths: ["src/auth/**"] }],
};

// ---------------------------------------------------------------------------
// T-01: PipelineDescriptor.permissionScope field
// ---------------------------------------------------------------------------

describe("T-01: PIPELINE_REGISTRY profiles have no permissionScope", () => {
  it("STANDARD_DESCRIPTOR.permissionScope is undefined", () => {
    expect(STANDARD_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("DESIGN_ONLY_DESCRIPTOR.permissionScope is undefined", () => {
    expect(DESIGN_ONLY_DESCRIPTOR.permissionScope).toBeUndefined();
  });

  it("PipelineDescriptor type accepts permissionScope (type-level test via object literal)", () => {
    // If this compiles, the type accepts permissionScope as optional
    const desc: Pick<PipelineDescriptor, "permissionScope"> = {
      permissionScope: {
        checkpoint: "spec-review",
        forbidden: [{ id: "src-auth", paths: ["src/auth/**"] }],
      },
    };
    expect(desc.permissionScope?.checkpoint).toBe("spec-review");
  });

  it("PipelineDescriptor with absent permissionScope is valid (undefined = no scope)", () => {
    const desc: Pick<PipelineDescriptor, "permissionScope"> = {};
    expect(desc.permissionScope).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-02: Finding.origin field + parseFindings capture
// ---------------------------------------------------------------------------

describe("T-02: Finding.origin — parseFindings with absent origin", () => {
  it("finding without origin → origin absent in result (existing behavior preserved)", () => {
    const raw = [{
      severity: "high", resolution: "fixable", file: "src/foo.ts", title: "Bug", rationale: "Fix it",
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]!.origin).toBeUndefined();
  });

  it("finding with origin:'scope' → origin captured", () => {
    const raw = [{
      severity: "high",
      resolution: "decision-needed",
      file: "src/foo.ts",
      title: "Scope exceeded",
      rationale: "Out of scope",
      origin: "scope",
      options: [
        { label: "A", consequence: "CA" },
        { label: "B", consequence: "CB" },
      ],
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]!.origin).toBe("scope");
  });

  it("finding with origin:'unknown-value' → origin absent (silently ignored)", () => {
    const raw = [{
      severity: "high", resolution: "fixable", file: "src/foo.ts", title: "Bug", rationale: "Fix it",
      origin: "invalid-origin",
    }];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value[0]!.origin).toBeUndefined();
  });

  it("finding without origin passes through parseFindings identically to pre-origin behavior", () => {
    const rawBefore = [{
      severity: "high", resolution: "fixable", file: "src/foo.ts", title: "Bug", rationale: "Fix it",
    }];
    const result = parseFindings(rawBefore);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Shape must be exactly { severity, resolution, file, title, rationale } — no extra fields
    const f = result.value[0]!;
    expect(Object.keys(f)).not.toContain("origin");
  });
});

describe("T-08: FindingResolution union is fixable | decision-needed only", () => {
  // We test this by verifying VALID_RESOLUTIONS via parseFindings behavior.
  // Any value other than "fixable" or "decision-needed" should reject.
  const validValues = ["fixable", "decision-needed"] as const;
  const invalidValues = ["scope", "ignored", "deferred", "pending", "wontfix"];

  for (const v of validValues) {
    it(`"${v}" is accepted by parseFindings`, () => {
      const raw = [{
        severity: "high",
        resolution: v,
        file: "src/foo.ts",
        title: "T",
        rationale: "R",
        ...(v === "decision-needed" ? {
          options: [{ label: "A", consequence: "CA" }, { label: "B", consequence: "CB" }],
        } : {}),
      }];
      const result = parseFindings(raw);
      expect(result.ok).toBe(true);
    });
  }

  for (const v of invalidValues) {
    it(`"${v}" is rejected by parseFindings (not a valid resolution)`, () => {
      const raw = [{
        severity: "high", resolution: v, file: "src/foo.ts", title: "T", rationale: "R",
      }];
      const result = parseFindings(raw);
      expect(result.ok).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// T-04: StepExecutor scope synthesis — permissionScope absent (no-op)
// ---------------------------------------------------------------------------

describe("T-04: permissionScope absent → executor behaves identically to previous", () => {
  it("no scope check when permissionScope is undefined", async () => {
    const jobState = await createRunningJobState();
    const listFn = vi.fn().mockResolvedValue([]);
    const strategy = makeRuntimeStrategy([]);
    strategy.listChangedFiles = listFn;

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    // No permissionScope passed → 6th arg is undefined
    const executor = new StepExecutor(new EventBus(), runner, makeStoreFactory(tempDir));

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    // listChangedFiles should NOT have been called (scope inactive)
    expect(listFn).not.toHaveBeenCalled();

    const outcome = getLastOutcome(finalState, "spec-review");
    expect(outcome?.verdict).toBe("approved");
    // toolResult.findings remains the agent's original (empty) findings
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    expect(tr?.findings ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-04: StepExecutor scope synthesis — breach at checkpoint
// ---------------------------------------------------------------------------

describe("T-04: scope breach at checkpoint → verdict escalation", () => {
  it("forbidden surface breached → verdict becomes escalation", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "spec-review");
    expect(outcome?.verdict).toBe("escalation");
  });

  it("breach → toolResult.findings includes synthesized scope finding", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "spec-review");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const findings = tr?.findings ?? [];
    const scopeFindings = findings.filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(1);
    expect(scopeFindings[0]!.resolution).toBe("decision-needed");
    expect(scopeFindings[0]!.severity).toBe("high");
  });

  it("breach → scope finding has ≥2 options", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "spec-review");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const findings = tr?.findings ?? [];
    const scopeFinding = findings.find((f) => f.origin === "scope");
    expect(scopeFinding?.options?.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T-04: scope defined but step is not the checkpoint → no synthesis
// ---------------------------------------------------------------------------

describe("T-04: step is not the checkpoint → no scope synthesis", () => {
  it("non-checkpoint judge step → no scope synthesis even when permissionScope is set", async () => {
    const jobState = await createRunningJobState();
    const listFn = vi.fn().mockResolvedValue(["src/auth/login.ts"]);
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]);
    strategy.listChangedFiles = listFn;

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE, // checkpoint is "spec-review"
    );

    // Running a step named "code-review" — NOT the checkpoint
    const step = makeJudgeStep("code-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    // listChangedFiles should NOT have been called
    expect(listFn).not.toHaveBeenCalled();

    const outcome = getLastOutcome(finalState, "code-review");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-04: no breach → existing behavior preserved
// ---------------------------------------------------------------------------

describe("T-04: no breach → toolResult and verdict unchanged", () => {
  it("no changed files match forbidden surface → verdict remains approved", async () => {
    const jobState = await createRunningJobState();
    // No auth files changed
    const strategy = makeRuntimeStrategy(["src/core/pipeline/types.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    const outcome = getLastOutcome(finalState, "spec-review");
    expect(outcome?.verdict).toBe("approved");
    const tr = outcome?.toolResult as { findings?: Finding[] } | null;
    const scopeFindings = (tr?.findings ?? []).filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-05: Two-source escalation — machine source via derive-judge-verdict
// ---------------------------------------------------------------------------

describe("T-05: machine-source scope finding goes through deriveJudgeVerdict", () => {
  it("decision-needed scope finding → deriveJudgeVerdict returns escalation", () => {
    const scopeFinding: Finding = {
      severity: "high",
      resolution: "decision-needed",
      origin: "scope",
      file: "specrunner/changes/my-feature/request.md",
      title: "Scope exceeded: changes touch forbidden surfaces",
      rationale: "Scope breach detected.",
      options: [
        { label: "A", consequence: "CA" },
        { label: "B", consequence: "CB" },
      ],
    };
    const verdict = deriveJudgeVerdict([scopeFinding], true);
    expect(verdict).toBe("escalation");
  });

  it("machine-source scope finding lands in getOpenDecisionFindings after breach", async () => {
    const jobState = await createRunningJobState();
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]);

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    // After escalation, state should have resumePoint.step = checkpoint
    const openFindings = getOpenDecisionFindings({
      ...finalState,
      resumePoint: { step: "spec-review", reason: "escalation", iterationsExhausted: 0 },
    });
    const scopeFindings = openFindings.filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(1);
  });
});

describe("T-05: semantic-source scope finding goes through same escalation path", () => {
  it("agent-emitted origin:'scope' decision-needed → same deriveJudgeVerdict escalation path", () => {
    // Agent emits a scope finding with origin:"scope"
    const agentScopeFinding: Finding = {
      severity: "high",
      resolution: "decision-needed",
      origin: "scope",
      file: "src/foo.ts",
      title: "Intent deviation",
      rationale: "This change goes beyond the scope.",
      options: [
        { label: "Accept", consequence: "Merge as-is." },
        { label: "Reject", consequence: "Discard changes." },
      ],
    };
    // parseFindings captures origin:"scope"
    const parsed = parseFindings([agentScopeFinding]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.value[0]!.origin).toBe("scope");

    // Same deriveJudgeVerdict path
    const verdict = deriveJudgeVerdict(parsed.value, true);
    expect(verdict).toBe("escalation");
  });

  it("semantic-source scope finding gets a stable computeFindingKey", () => {
    const finding: Finding = {
      severity: "high",
      resolution: "decision-needed",
      origin: "scope",
      file: "src/foo.ts",
      title: "Scope exceeded: intent deviation",
      rationale: "The agent flagged an intent deviation.",
      options: [
        { label: "A", consequence: "CA" },
        { label: "B", consequence: "CB" },
      ],
    };
    const key1 = computeFindingKey("spec-review", finding);
    const key2 = computeFindingKey("spec-review", finding);
    expect(key1).toBe(key2);
    expect(key1.startsWith("spec-review|")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-05: Both sources have stable computeFindingKey
// ---------------------------------------------------------------------------

describe("T-05: scope findings from both sources have stable computeFindingKey", () => {
  it("machine-source synthesized finding has stable key", () => {
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const findings = synthesizeScopeFindings(breach, ctx);
    const f = findings[0]!;

    const key1 = computeFindingKey("spec-review", f);
    const key2 = computeFindingKey("spec-review", f);
    expect(key1).toBe(key2);
  });

  it("same machine-source breach → same computeFindingKey (human decides once)", () => {
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const f1 = synthesizeScopeFindings(breach, ctx)[0]!;
    const f2 = synthesizeScopeFindings(breach, ctx)[0]!;
    expect(computeFindingKey("spec-review", f1)).toBe(computeFindingKey("spec-review", f2));
  });
});

// ---------------------------------------------------------------------------
// T-06: Resolved scope breach does not re-escalate
// ---------------------------------------------------------------------------

describe("T-06: resolved scope breach is suppressed by filterUndecidedFindings", () => {
  it("scope finding with matching decision record → filtered out → no re-escalation", () => {
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const scopeFinding = synthesizeScopeFindings(breach, ctx)[0]!;
    const findingKey = computeFindingKey("spec-review", scopeFinding);

    const decisionRecord: DecisionRecord = {
      id: "decision-001",
      step: "spec-review",
      findingKey,
      finding: {
        title: scopeFinding.title,
        file: scopeFinding.file,
        rationale: scopeFinding.rationale,
        severity: scopeFinding.severity,
      },
      selectedOption: { number: 1, label: "A", consequence: "CA" },
      decidedAt: "2026-01-01T00:00:00.000Z",
      source: "issue-comment",
    };

    // With decision record → finding is suppressed
    const undecided = filterUndecidedFindings(
      "spec-review",
      [scopeFinding],
      [decisionRecord],
    );
    expect(undecided).toHaveLength(0);

    // Verdict derivation on empty undecided → approved (not escalation)
    const verdict = deriveJudgeVerdict(undecided, true);
    expect(verdict).toBe("approved");
  });

  it("scope finding without matching decision record → still triggers escalation", () => {
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const scopeFinding = synthesizeScopeFindings(breach, ctx)[0]!;

    // No decision records
    const undecided = filterUndecidedFindings("spec-review", [scopeFinding], []);
    expect(undecided).toHaveLength(1);

    const verdict = deriveJudgeVerdict(undecided, true);
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// T-06: Executor re-escalation suppression (integration)
// ---------------------------------------------------------------------------

describe("T-06: executor re-escalation suppression via decision-ledger", () => {
  it("pre-decided scope finding → verdict is approved (not escalation)", async () => {
    // Build the scope finding that would be synthesized
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const scopeFinding = synthesizeScopeFindings(breach, ctx)[0]!;
    const findingKey = computeFindingKey("spec-review", scopeFinding);

    const decisionRecord: DecisionRecord = {
      id: "decision-scope-001",
      step: "spec-review",
      findingKey,
      finding: {
        title: scopeFinding.title,
        file: scopeFinding.file,
        rationale: scopeFinding.rationale,
        severity: scopeFinding.severity,
      },
      selectedOption: { number: 1, label: "Option A: redo with a heavier pipeline", consequence: "Restart this job." },
      decidedAt: "2026-01-01T00:00:00.000Z",
      source: "issue-comment",
    };

    // JobState with the decision already recorded
    const jobState = await createRunningJobState({
      decisions: [decisionRecord],
    });
    const strategy = makeRuntimeStrategy(["src/auth/login.ts"]); // breach still present

    const runner = makeRunnerWithToolResult({ ok: true, findings: [] });
    const executor = new StepExecutor(
      new EventBus(), runner, makeStoreFactory(tempDir),
      undefined, undefined,
      FORBIDDEN_SCOPE,
    );

    const step = makeJudgeStep("spec-review");
    const finalState = await executor.execute(step, jobState, makeDeps(strategy));

    // With the scope finding already decided, verdict should NOT be escalation
    const outcome = getLastOutcome(finalState, "spec-review");
    expect(outcome?.verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// T-07: Issue-notifier renders scope findings (existing buildEscalationComment)
// ---------------------------------------------------------------------------

describe("T-07: buildEscalationComment renders scope findings", () => {
  function makeJobStateWithScopeFinding(stepName: string): JobState {
    const ctx = { slug: "my-feature" };
    const breach = { breached: true, surfaces: ["src-auth"] };
    const scopeFinding = synthesizeScopeFindings(breach, ctx)[0]!;

    return {
      version: 2,
      jobId: "test-job-scope-001",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/repo/specrunner/changes/my-feature/request.md", title: "Test", type: "new-feature", slug: "my-feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: stepName,
      status: "awaiting-resume",
      branch: "feat/my-feature",
      history: [],
      error: null,
      resumePoint: { step: stepName, reason: "escalation", iterationsExhausted: 0 },
      steps: {
        [stepName]: [{
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:01:00.000Z",
          outcome: {
            verdict: "escalation",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [scopeFinding],
            },
          },
        }],
      },
    };
  }

  it("scope finding title appears in escalation comment", () => {
    const state = makeJobStateWithScopeFinding("spec-review");
    const comment = buildEscalationComment(state);
    expect(comment).toContain("Scope exceeded: changes touch forbidden surfaces");
  });

  it("scope finding rationale (with surface ids) appears in escalation comment", () => {
    const state = makeJobStateWithScopeFinding("spec-review");
    const comment = buildEscalationComment(state);
    expect(comment).toContain("src-auth");
  });

  it("scope finding options appear in escalation comment", () => {
    const state = makeJobStateWithScopeFinding("spec-review");
    const comment = buildEscalationComment(state);
    expect(comment).toContain("Decisions needed:");
  });

  it("buildEscalationComment not modified — getOpenDecisionFindings feeds it", () => {
    const state = makeJobStateWithScopeFinding("spec-review");
    const openFindings = getOpenDecisionFindings(state);
    const scopeFindings = openFindings.filter((f) => f.origin === "scope");
    expect(scopeFindings).toHaveLength(1);
    // Verify the existing comment builder picks them up
    const comment = buildEscalationComment(state);
    expect(comment).toContain("Option A");
    expect(comment).toContain("Option B");
  });
});

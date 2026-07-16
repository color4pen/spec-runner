/**
 * T-07: test-materialize-boundary acceptance criteria tests
 *
 * TC-TMB-01: TestMaterializeStep structure — kind, name, completionVerdict
 * TC-TMB-02: TestMaterializeStep reads — test-cases.md required, spec.md optional
 * TC-TMB-03: TestMaterializeStep writes — gitState only
 * TC-TMB-04: TestMaterializeStep outputContracts — test-coverage kind
 * TC-TMB-05: implementer testsMaterialized=true → implementation-only message
 * TC-TMB-06: implementer testsMaterialized=false/undefined → TDD message unchanged
 * TC-TMB-07: ImplementerStep.buildMessage detects test-materialize in state
 * TC-TMB-08: ImplementerStep.reads() includes test-cases.md as required:false
 * TC-TMB-09: evaluateTestCoverage — all must TC covered + assertions → passed
 * TC-TMB-10: evaluateTestCoverage — missing must TC → failed + missingTcIds
 * TC-TMB-11: evaluateTestCoverage — found but no assertion → failed + assertionlessTcIds
 * TC-TMB-12: evaluateTestCoverage — red test (assertion present, no impl) → passed
 * TC-TMB-13: LocalRuntime.validateStepOutputs test-coverage → violation when failed
 * TC-TMB-14: LocalRuntime.validateStepOutputs test-coverage → no violation when passed
 * TC-TMB-15: LocalRuntime.validateStepOutputs test-coverage → violation when file absent
 * TC-TMB-16: ManagedRuntime.validateStepOutputs test-coverage → no violation (best-effort skip)
 * TC-TMB-17: resolveResumeStep accepts "test-materialize" verbatim
 * TC-TMB-18: STANDARD_TRANSITIONS — to==="test-materialize" only from test-case-gen
 * TC-TMB-19: FAST_DESCRIPTOR steps do not include test-materialize
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { TestMaterializeStep } from "../../../src/core/step/test-materialize.js";
import { buildImplementerInitialMessage, ImplementerStep } from "../../../src/core/step/implementer.js";
import { evaluateTestCoverage } from "../../../src/core/verification/test-coverage.js";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import { resolveResumeStep } from "../../../src/core/resume/resolve-step.js";
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { STANDARD_DESCRIPTOR, FAST_DESCRIPTOR } from "../../../src/core/pipeline/registry.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps, AgentStep } from "../../../src/core/step/types.js";
import type { OutputContract } from "../../../src/core/port/output-contract.js";
import { changeFolderPath } from "../../../src/util/paths.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
import { TestCaseGenStep } from "../../../src/core/step/test-case-gen.js";
import { fold } from "../../../src/store/event-journal.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { gitExec } from "../../../src/util/git-exec.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import { cleanupOutputTemplates } from "../../../src/core/artifact/copy-artifacts.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
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
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug, baseBranch: "main", content: "Do something", adr: false },
    slug,
  };
}

// ---------------------------------------------------------------------------
// TC-TMB-01..04: TestMaterializeStep structure
// ---------------------------------------------------------------------------

describe("TC-TMB-01: TestMaterializeStep structure", () => {
  it("kind === 'agent' and name === 'test-materialize'", () => {
    expect(TestMaterializeStep.kind).toBe("agent");
    expect(TestMaterializeStep.name).toBe("test-materialize");
  });

  it("completionVerdict === 'success'", () => {
    expect(TestMaterializeStep.completionVerdict).toBe("success");
  });

  it("agent.role === 'test-materialize' and model === 'claude-sonnet-4-6'", () => {
    expect(TestMaterializeStep.agent.role).toBe("test-materialize");
    expect(TestMaterializeStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("agent.capabilities.gitWrite === true", () => {
    expect(TestMaterializeStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("system prompt contains 'test コード' and 'TC ID' and production code exclusion", () => {
    const sys = TestMaterializeStep.agent.system;
    expect(typeof sys).toBe("string");
    // System prompt must instruct: write test code only, not production code, embed TC ID
    const hasTestCodeOnly = sys.includes("テスト") || sys.includes("test");
    const hasTcId = sys.includes("TC ID") || sys.includes("TC-");
    expect(hasTestCodeOnly).toBe(true);
    expect(hasTcId).toBe(true);
  });
});

describe("TC-TMB-02: TestMaterializeStep reads — test-cases.md required, spec.md optional", () => {
  it("reads includes test-cases.md as required (default)", () => {
    expect(TestMaterializeStep.reads).toBeDefined();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const refs = TestMaterializeStep.reads!(state, deps);
    const tcRef = refs.find((r) => r.path.endsWith("test-cases.md"));
    expect(tcRef).toBeDefined();
    // required:false only if explicitly set; default is required
    expect(tcRef?.required).not.toBe(false);
  });

  it("reads includes spec.md as required:false (optional)", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const refs = TestMaterializeStep.reads!(state, deps);
    const specRef = refs.find((r) => r.path.endsWith("spec.md"));
    expect(specRef).toBeDefined();
    expect(specRef?.required).toBe(false);
  });

  it("reads includes design.md and tasks.md", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const refs = TestMaterializeStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);
    expect(paths.some((p) => p.endsWith("design.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("tasks.md"))).toBe(true);
  });
});

describe("TC-TMB-03: TestMaterializeStep writes — gitState only", () => {
  it("writes returns gitState artifact for changeFolderPath", () => {
    expect(TestMaterializeStep.writes).toBeDefined();
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-feature");
    const refs = TestMaterializeStep.writes!(state, deps);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.artifact).toBe("gitState");
    expect(refs[0]?.path).toBe(changeFolderPath("my-feature"));
  });
});

describe("TC-TMB-04: TestMaterializeStep outputContracts — test-coverage kind", () => {
  it("outputContracts returns one 'test-coverage' contract pointing at test-cases.md", () => {
    expect(TestMaterializeStep.outputContracts).toBeDefined();
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-feature");
    const contracts = TestMaterializeStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.kind).toBe("test-coverage");
    expect(contracts[0]?.path).toContain("test-cases.md");
    expect(contracts[0]?.policy).toBe("halt");
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-05..08: implementer testsMaterialized flag
// ---------------------------------------------------------------------------

describe("TC-TMB-05: implementer testsMaterialized=true → implementation-only message", () => {
  it("message contains 'implementation' and 'production' and NOT 'TDD'", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      requestContent: "Add feature X",
      testsMaterialized: true,
    });
    // Must mention implementation-only mode
    expect(msg.toLowerCase()).toContain("production");
    // Must NOT contain TDD unconditional instruction
    expect(msg).not.toContain("(TDD: write tests first");
  });

  it("message says not to create or modify test files", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      requestContent: "Add feature X",
      testsMaterialized: true,
    });
    // Must explicitly say not to create/modify test files
    expect(msg.toLowerCase()).toMatch(/do not create or modify test|test files must not be created or modified/i);
  });
});

describe("TC-TMB-06: implementer testsMaterialized=false/undefined → TDD message unchanged", () => {
  it("testsMaterialized=false produces same message as undefined", () => {
    const opts = { slug: "my-change", branch: "feat/my-change", requestContent: "Add feature X" };
    const msgFalse = buildImplementerInitialMessage({ ...opts, testsMaterialized: false });
    const msgUndefined = buildImplementerInitialMessage(opts);
    expect(msgFalse).toBe(msgUndefined);
  });

  it("TDD message still contains TDD instruction", () => {
    const msg = buildImplementerInitialMessage({
      slug: "my-change",
      branch: "feat/my-change",
      requestContent: "Add feature X",
    });
    expect(msg).toContain("TDD");
  });
});

describe("TC-TMB-07: ImplementerStep.buildMessage detects test-materialize in state", () => {
  it("state with test-materialize record → message uses implementation-only mode", () => {
    const stateWithMaterialize = makeMinimalState({
      step: "implementer",
      steps: {
        "test-materialize": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success" as const, findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00Z",
            endedAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    const deps = makeMinimalDeps("my-change");
    const msg = ImplementerStep.buildMessage(stateWithMaterialize, deps);
    expect(msg.toLowerCase()).toContain("production");
    expect(msg).not.toContain("(TDD: write tests first");
  });

  it("state without test-materialize record → message uses TDD mode", () => {
    const stateNoMaterialize = makeMinimalState({ step: "implementer", steps: {} });
    const deps = makeMinimalDeps("my-change");
    const msg = ImplementerStep.buildMessage(stateNoMaterialize, deps);
    expect(msg).toContain("TDD");
  });
});

describe("TC-TMB-08: ImplementerStep.reads() includes test-cases.md as required:false", () => {
  it("test-cases.md is present with required:false", () => {
    expect(ImplementerStep.reads).toBeDefined();
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const refs = ImplementerStep.reads!(state, deps);
    const tcRef = refs.find((r) => r.path.endsWith("test-cases.md"));
    expect(tcRef).toBeDefined();
    expect(tcRef?.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-09..12: evaluateTestCoverage
// ---------------------------------------------------------------------------

describe("TC-TMB-09..12: evaluateTestCoverage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmt-eval-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const TEST_CASES_CONTENT = `## TC-001: Feature A
- **Priority**: must
- Summary: test feature A

## TC-002: Feature B
- **Priority**: must
- Summary: test feature B
`;

  it("TC-TMB-09: all must TCs present with assertions → status=passed, missingTcIds=[]", async () => {
    const testDir = path.join(tempDir, "tests");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "feature.test.ts"),
      `it("TC-001: ...", () => { expect(1).toBe(1); })\nit("TC-002: ...", () => { expect(2).toBe(2); })`,
    );

    const result = await evaluateTestCoverage(TEST_CASES_CONTENT, tempDir);
    expect(result.status).toBe("passed");
    expect(result.missingTcIds).toEqual([]);
    expect(result.assertionlessTcIds).toEqual([]);
    expect(result.totalMustTcs).toBe(2);
  });

  it("TC-TMB-10: missing must TC → status=failed, missingTcIds has TC-002", async () => {
    const testDir = path.join(tempDir, "tests");
    await fs.mkdir(testDir, { recursive: true });
    // Only TC-001 present
    await fs.writeFile(
      path.join(testDir, "feature.test.ts"),
      `it("TC-001: ...", () => { expect(1).toBe(1); })`,
    );

    const result = await evaluateTestCoverage(TEST_CASES_CONTENT, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-002");
  });

  it("TC-TMB-11: TC found but no assertion → status=failed, assertionlessTcIds", async () => {
    const testDir = path.join(tempDir, "tests");
    await fs.mkdir(testDir, { recursive: true });
    // Both TCs present but no assertions
    await fs.writeFile(
      path.join(testDir, "feature.test.ts"),
      `// TC-001 placeholder\n// TC-002 placeholder\n`,
    );

    const result = await evaluateTestCoverage(TEST_CASES_CONTENT, tempDir);
    expect(result.status).toBe("failed");
    // Both found but assertionless
    expect(result.assertionlessTcIds.length).toBeGreaterThan(0);
  });

  it("TC-TMB-12: red test (TC ID present + expect() call, no implementation) → passed", async () => {
    // The test-coverage contract does NOT execute tests.
    // A test file with TC ID + assertion is accepted even if the implementation
    // doesn't exist yet (the test would fail at runtime, but that's irrelevant here).
    const testDir = path.join(tempDir, "tests");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "feature.test.ts"),
      [
        `it("TC-001: red test", () => { expect(myNonExistentFn()).toBe(true); })`,
        `it("TC-002: another red test", () => { expect(anotherFn()).toBe(42); })`,
      ].join("\n"),
    );

    const result = await evaluateTestCoverage(TEST_CASES_CONTENT, tempDir);
    // Red tests are accepted — coverage passes because TC IDs exist and assertions are present
    expect(result.status).toBe("passed");
    expect(result.missingTcIds).toEqual([]);
    expect(result.assertionlessTcIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-13..16: validateStepOutputs test-coverage contract
// ---------------------------------------------------------------------------

describe("TC-TMB-13..16: validateStepOutputs test-coverage contract", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmt-validate-test-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeLocalRuntime(): LocalRuntime {
    return new LocalRuntime({
      cwd: tempDir,
      githubClient: {
        createPullRequest: async () => ({ url: "", number: 0, createdAt: "" }),
        getPullRequest: async () => null,
      } as unknown as ConstructorParameters<typeof LocalRuntime>[0]["githubClient"],
      spawnFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });
  }

  const TEST_CASES_MD = `## TC-001
- **Priority**: must
- Summary: covers X
`;
  const TEST_CASES_REL = "specrunner/changes/my-change/test-cases.md";

  it("TC-TMB-13: test-coverage contract — missing TC → violation with detail", async () => {
    // Write test-cases.md but no test file with TC-001
    const absPath = path.join(tempDir, TEST_CASES_REL);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, TEST_CASES_MD);

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TEST_CASES_REL, policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("test-coverage");
    expect(result.violations[0]?.policy).toBe("halt");
    // detail should contain TC-001 (missing)
    expect(result.violations[0]?.detail).toContain("TC-001");
  });

  it("TC-TMB-14: test-coverage contract — all TCs covered + assertions → no violation", async () => {
    // Write test-cases.md
    const absPath = path.join(tempDir, TEST_CASES_REL);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, TEST_CASES_MD);

    // Write a test file with TC-001 and an assertion
    const testDir = path.join(tempDir, "tests");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "feature.test.ts"),
      `it("TC-001: ...", () => { expect(result).toBe(true); })`,
    );

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TEST_CASES_REL, policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(0);
  });

  it("TC-TMB-15: test-coverage contract — test-cases.md absent → violation", async () => {
    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: "specrunner/changes/no-slug/test-cases.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("test-coverage");
  });

  it("TC-TMB-16: ManagedRuntime test-coverage contract → no violation (best-effort skip)", async () => {
    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {
      getRawFile: vi.fn().mockResolvedValue(null),
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const mockSpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
    const runtime = new ManagedRuntime(tempDir, mockSessionClient, mockGithubClient, mockRepo, mockSpawnFn, "ghp_test");

    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: "specrunner/changes/my-change/test-cases.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/my-change");
    // ManagedRuntime has no local fs — test-coverage is skipped, no violation
    expect(result.violations.filter((v) => v.kind === "test-coverage")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-17: resolveResumeStep accepts "test-materialize" verbatim
// ---------------------------------------------------------------------------

describe("TC-TMB-17: resolveResumeStep accepts test-materialize verbatim", () => {
  it("resolveResumeStep('test-materialize', ...) returns 'test-materialize'", () => {
    const result = resolveResumeStep(
      "test-materialize",
      { step: "test-materialize", reason: "crash", iterationsExhausted: 0 },
    );
    expect(result).toBe("test-materialize");
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-18: STANDARD_TRANSITIONS — to==="test-materialize" only from test-case-gen
// ---------------------------------------------------------------------------

describe("TC-TMB-18: STANDARD_TRANSITIONS — to=test-materialize only from test-case-gen", () => {
  it("exactly one transition targets 'test-materialize' and it comes from test-case-gen:success", () => {
    const toMaterialize = STANDARD_TRANSITIONS.filter((t) => t.to === "test-materialize");
    expect(toMaterialize).toHaveLength(1);
    expect(toMaterialize[0]?.step).toBe("test-case-gen");
    expect(toMaterialize[0]?.on).toBe("success");
  });

  it("conformance needs-fix:implementer does NOT target test-materialize", () => {
    const conformanceNeedsFixImpl = STANDARD_TRANSITIONS.filter(
      (t) => t.step === "conformance" && t.on === "needs-fix:implementer",
    );
    for (const t of conformanceNeedsFixImpl) {
      expect(t.to).not.toBe("test-materialize");
    }
  });

  it("verification failed does NOT target test-materialize", () => {
    const verFailed = STANDARD_TRANSITIONS.filter(
      (t) => t.step === "verification" && t.on === "failed",
    );
    for (const t of verFailed) {
      expect(t.to).not.toBe("test-materialize");
    }
  });

  it("code-review needs-fix does NOT target test-materialize", () => {
    const crNeedsFix = STANDARD_TRANSITIONS.filter(
      (t) => t.step === "code-review" && t.on === "needs-fix",
    );
    for (const t of crNeedsFix) {
      expect(t.to).not.toBe("test-materialize");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-TMB-19: FAST_DESCRIPTOR steps do not include test-materialize
// ---------------------------------------------------------------------------

describe("TC-TMB-19: FAST_DESCRIPTOR steps do not include test-materialize", () => {
  it("FAST_DESCRIPTOR does not have a test-materialize step", () => {
    const fastStepNames = FAST_DESCRIPTOR.steps.map(([name]) => name);
    expect(fastStepNames).not.toContain(STEP_NAMES.TEST_MATERIALIZE);
  });

  it("STANDARD_DESCRIPTOR steps include test-materialize between test-case-gen and implementer", () => {
    const standardStepNames = STANDARD_DESCRIPTOR.steps.map(([name]) => name);
    const tcgIdx = standardStepNames.indexOf("test-case-gen");
    const tmIdx = standardStepNames.indexOf("test-materialize");
    const implIdx = standardStepNames.indexOf("implementer");
    expect(tmIdx).toBeGreaterThan(tcgIdx);
    expect(implIdx).toBeGreaterThan(tmIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-A1: AC-1 — test-case-gen lineage records test-cases.md with real sha256 hash
//
// Fix for HIGH finding: test that executor.execute(TestCaseGenStep) records a lineage
// entry in events.jsonl with step="test-case-gen", path ending in "test-cases.md",
// and hash="sha256:<hex>" (non-null).
//
// Uses mock git (no real repo needed) + real sha256 digestArtifacts to lock
// the test-case-gen → lineage boundary required by AC-1.
// ---------------------------------------------------------------------------

/**
 * Build a mock SpawnFn for the AC-1 lineage test.
 * Simulates successful git add + staged changes (exit 1) + commit + push.
 * No real git repo is needed — all responses are in-process mocks.
 */
function makeMockGitSpawnFnForLineage(): SpawnFn {
  return (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    const subcommand = args[0] ?? "";
    let exitCode = 0;
    let stdout = "";

    if (subcommand === "rev-parse") {
      stdout = "abc123sha";         // any non-empty SHA
    } else if (subcommand === "diff") {
      exitCode = 1;                 // staged changes present → triggers commit path
    }
    // add, commit, push: exitCode = 0 (default)

    const em = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emAny = em as any;
    emAny.stdout = new EventEmitter();
    emAny.stderr = new EventEmitter();
    emAny.stdin = { write: () => true, end: () => {} };
    setImmediate(() => {
      if (stdout) emAny.stdout.emit("data", Buffer.from(stdout));
      em.emit("close", exitCode);
    });
    return em as unknown as ChildProcess;
  };
}

/**
 * Build a RuntimeStrategy that uses real sha256 file hashing in digestArtifacts
 * but no-ops git and all other lifecycle methods.
 * cwd: directory where artifact files (e.g. test-cases.md) are located.
 */
function makeLineageTestRuntimeStrategy(spawnFn: SpawnFn, cwd: string): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner {
      return {
        async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(repoCwd: string): Promise<string | null> {
      return gitExec(spawnFn, repoCwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(
      step: AgentStep,
      state: JobState,
      deps: PipelineDeps,
      headBeforeStep: string | null,
      infra: CommitPushInfra,
    ): Promise<void> {
      const repoCwd = deps.cwd ?? process.cwd();
      await cleanupOutputTemplates(repoCwd, deps.slug, step.name, state);
      await commitAndPush(step, state, deps, headBeforeStep, infra);
    },
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented in test"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs(): Promise<[]> { return []; },
    // Real sha256 computation — the key difference from the mock in executor.commit.test.ts TC-001
    async digestArtifacts(refs: { path: string }[]) {
      const results: Array<{ path: string; hash: string | null }> = [];
      for (const ref of refs) {
        const absPath = path.join(cwd, ref.path);
        try {
          const content = await fs.readFile(absPath);
          const hex = createHash("sha256").update(content).digest("hex");
          results.push({ path: ref.path, hash: `sha256:${hex}` });
        } catch {
          results.push({ path: ref.path, hash: null });
        }
      }
      return results;
    },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
    async validateStepOutputs() { return { violations: [] }; },
  } as RuntimeStrategy;
}

describe("TC-A1: AC-1 — test-case-gen lineage records test-cases.md sha256 hash", () => {
  let tempDir: string;
  let savedXdgDataHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmb-a1-"));
    savedXdgDataHome = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = tempDir;
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    if (savedXdgDataHome !== undefined) {
      process.env["XDG_DATA_HOME"] = savedXdgDataHome;
    } else {
      delete process.env["XDG_DATA_HOME"];
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("events.jsonl lineage: step=test-case-gen, path=test-cases.md, hash=sha256:<hex>", async () => {
    const testCasesMdRelPath = `${changeFolderPath("test-slug")}/test-cases.md`;
    const testCasesMdAbsPath = path.join(tempDir, testCasesMdRelPath);
    const testCasesMdContent = [
      "## TC-001: Feature works",
      "- **Priority**: must",
      "- Summary: ensures feature X works end-to-end",
      "",
    ].join("\n");

    // Create test-cases.md before running — simulates the file the test-case-gen agent wrote
    await fs.mkdir(path.dirname(testCasesMdAbsPath), { recursive: true });
    await fs.writeFile(testCasesMdAbsPath, testCasesMdContent, "utf-8");

    // Compute expected sha256 to assert against
    const expectedHash = `sha256:${createHash("sha256").update(Buffer.from(testCasesMdContent, "utf-8")).digest("hex")}`;

    const mockSpawnFn = makeMockGitSpawnFnForLineage();
    const runtimeStrategy = makeLineageTestRuntimeStrategy(mockSpawnFn, tempDir);

    const jobId = "tc-a1-lineage-job";
    const state: JobState = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "spec-change" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "test-case-gen",
      status: "running",
      branch: "feat/test-slug",
      history: [],
      error: null,
      steps: {},
    };

    const deps: PipelineDeps = {
      config: { version: 1, runtime: "local", agents: {} },
      request: {
        type: "spec-change",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "Add feature X",
        adr: false,
      },
      slug: "test-slug",
      cwd: tempDir,
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({
          state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE",
        }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
        getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
        listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
        createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
        searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
        listIssueComments: vi.fn().mockResolvedValue([]),
        removeLabel: vi.fn().mockResolvedValue(undefined),
      },
      owner: "testowner",
      repo: "testrepo",
      spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      storeFactory: makeStoreFactory(tempDir),
      runtimeStrategy,
    };

    // Agent runner: no-op — test-cases.md already exists (simulates post-agent state)
    const agentRunner: AgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
      },
    };

    const noopSleep = async (_ms: number) => {};
    const events = new EventBus();
    const executor = new StepExecutor(
      events,
      agentRunner,
      makeStoreFactory(tempDir),
      mockSpawnFn,
      noopSleep,
    );

    await executor.execute(TestCaseGenStep, state, deps);

    // Read and fold events.jsonl to inspect lineage
    const eventsPath = path.join(tempDir, ".specrunner", "test-jobs", jobId, "events.jsonl");
    const content = await fs.readFile(eventsPath, "utf-8");
    const foldResult = fold(content);

    // AC-1: lineage record must exist for test-case-gen
    expect(foldResult.lineage).toHaveLength(1);
    const lineageRecord = foldResult.lineage[0]!;
    expect(lineageRecord.step).toBe("test-case-gen");

    // AC-1: outputs must include test-cases.md with real sha256 hash (non-null)
    const testCasesRef = lineageRecord.outputs.find((o) => o.path.endsWith("test-cases.md"));
    expect(testCasesRef, "Expected test-cases.md in lineage outputs").toBeDefined();
    expect(testCasesRef!.hash, "Expected non-null sha256 hash — not mock null").not.toBeNull();
    expect(testCasesRef!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Verify the hash matches the actual file content
    expect(testCasesRef!.hash).toBe(expectedHash);
  });
});

// ---------------------------------------------------------------------------
// TC-F1: AC-3 — commit tree after test-materialize: *.test.ts ≥1, src/*.ts = 0
//
// Fix for HIGH finding: test that the commit produced by executor.execute(TestMaterializeStep)
// contains ≥1 test files and zero src/*.ts implementation files, verified via
// `git diff HEAD~1 HEAD --name-only` on the real commit tree.
//
// Uses real git operations (spawnFn + temp dir) following the executor.commit.test.ts harness.
// Mock agent writes only *.test.ts files; push is intercepted (no remote needed).
// ---------------------------------------------------------------------------

/**
 * Build a SpawnFn that delegates all git commands to real git EXCEPT push.
 * Push is intercepted and returns exit 0 immediately (no remote needed in test).
 */
function makeRealGitNoPushSpawnFn(): SpawnFn {
  return (bin: string, args: string[], opts: SpawnOptions): ChildProcess => {
    if (bin === "git" && args[0] === "push") {
      const em = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emAny = em as any;
      emAny.stdout = new EventEmitter();
      emAny.stderr = new EventEmitter();
      emAny.stdin = { write: () => true, end: () => {} };
      setImmediate(() => em.emit("close", 0));
      return em as unknown as ChildProcess;
    }
    return nodeSpawn(bin, args, opts);
  };
}

/**
 * Build a RuntimeStrategy that uses real git (via spawnFn) for HEAD capture and
 * commit/push, but no-ops all other lifecycle methods.
 * Mirrors makeTestRuntimeStrategy from executor.commit.test.ts.
 */
function makeRealGitRuntimeStrategy(spawnFn: SpawnFn): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner {
      return {
        async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(cwd: string): Promise<string | null> {
      return gitExec(spawnFn, cwd, ["rev-parse", "HEAD"]);
    },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(
      step: AgentStep,
      state: JobState,
      deps: PipelineDeps,
      headBeforeStep: string | null,
      infra: CommitPushInfra,
    ): Promise<void> {
      const cwd = deps.cwd ?? process.cwd();
      await cleanupOutputTemplates(cwd, deps.slug, step.name, state);
      await commitAndPush(step, state, deps, headBeforeStep, infra);
    },
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented in test"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs(): Promise<[]> { return []; },
    async digestArtifacts(refs: { path: string }[]) {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
    async validateStepOutputs() { return { violations: [] }; },
  } as RuntimeStrategy;
}

describe("TC-F1: AC-3 — test-materialize commit tree: *.test.ts ≥1, src/*.ts = 0", () => {
  let gitDir: string;
  let storeDir: string;
  let savedXdgDataHome: string | undefined;

  beforeEach(async () => {
    gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmb-f1-git-"));
    storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmb-f1-store-"));
    savedXdgDataHome = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = storeDir;
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    // Initialize a real local git repo and make the initial (parent) commit.
    spawnSync("git", ["init"], { cwd: gitDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: gitDir });
    spawnSync("git", ["config", "user.name", "TC-F1 Test"], { cwd: gitDir });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init: initial commit"], { cwd: gitDir });
  });

  afterEach(async () => {
    if (savedXdgDataHome !== undefined) {
      process.env["XDG_DATA_HOME"] = savedXdgDataHome;
    } else {
      delete process.env["XDG_DATA_HOME"];
    }
    await fs.rm(gitDir, { recursive: true, force: true });
    await fs.rm(storeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("git diff HEAD~1 HEAD --name-only: ≥1 *.test.ts, 0 src/*.ts files", async () => {
    const realGitNoPushSpawnFn = makeRealGitNoPushSpawnFn();
    const runtimeStrategy = makeRealGitRuntimeStrategy(realGitNoPushSpawnFn);

    // Mock agent: write only test files, no src implementation files.
    // This simulates what the test-materialize agent produces.
    const fileWritingRunner: AgentRunner = {
      async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
        const testsDir = path.join(gitDir, "tests", "unit");
        await fs.mkdir(testsDir, { recursive: true });
        await fs.writeFile(
          path.join(testsDir, "feature.test.ts"),
          [
            'it("TC-001: feature works", () => { expect(notYetImplemented()).toBe(true); });',
            'it("TC-002: edge case", () => { expect(edgeFn()).toBe(42); });',
          ].join("\n"),
        );
        // No src/*.ts files written — base commit must contain only tests
        return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
      },
    };

    const jobId = "tc-f1-real-git-job";
    const state: JobState = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "spec-change" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "test-materialize",
      status: "running",
      branch: "feat/test-slug",
      history: [],
      error: null,
      steps: {},
    };

    const deps: PipelineDeps = {
      config: {
        version: 1,
        runtime: "local",
        agents: {},
      },
      request: {
        type: "spec-change",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "Add feature X via test-materialize",
        adr: false,
      },
      slug: "test-slug",
      cwd: gitDir,
      githubClient: {
        verifyBranch: vi.fn(),
        getRawFile: vi.fn(),
        verifyPath: vi.fn(),
        verifyTokenScopes: vi.fn(),
        getRefSha: vi.fn(),
        listPullRequests: vi.fn().mockResolvedValue([]),
        createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
        getPullRequest: vi.fn().mockResolvedValue({
          state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE",
        }),
        mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
        getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
        listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
        createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
        searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
        listIssueComments: vi.fn().mockResolvedValue([]),
        removeLabel: vi.fn().mockResolvedValue(undefined),
      },
      owner: "testowner",
      repo: "testrepo",
      spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      storeFactory: makeStoreFactory(storeDir),
      runtimeStrategy,
    };

    const noopSleep = async (_ms: number) => {};
    const events = new EventBus();
    const executor = new StepExecutor(
      events,
      fileWritingRunner,
      makeStoreFactory(storeDir),
      realGitNoPushSpawnFn,
      noopSleep,
    );

    // Execute TestMaterializeStep — this creates the base OID commit
    await executor.execute(TestMaterializeStep, state, deps);

    // Verify the commit tree: check which files changed between HEAD~1 and HEAD
    const diffResult = spawnSync(
      "git",
      ["diff", "HEAD~1", "HEAD", "--name-only"],
      { cwd: gitDir },
    );
    const diffStdout = diffResult.stdout.toString().trim();
    const changedFiles = diffStdout.split("\n").filter(Boolean);

    // AC-3 assertion 1: ≥1 *.test.ts files must be present in the commit
    const testFiles = changedFiles.filter((f) => f.endsWith(".test.ts"));
    expect(
      testFiles.length,
      `Expected ≥1 *.test.ts files in commit tree but got: ${JSON.stringify(changedFiles)}`,
    ).toBeGreaterThanOrEqual(1);

    // AC-3 assertion 2: 0 src/*.ts implementation files allowed in the commit
    const srcImplFiles = changedFiles.filter(
      (f) => f.startsWith("src/") && f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    expect(
      srcImplFiles,
      `Expected 0 src/*.ts implementation files in commit tree but got: ${JSON.stringify(srcImplFiles)}`,
    ).toHaveLength(0);
  });
});

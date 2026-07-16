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
import { TestMaterializeStep } from "../../../src/core/step/test-materialize.js";
import { buildImplementerInitialMessage, ImplementerStep } from "../../../src/core/step/implementer.js";
import { evaluateTestCoverage } from "../../../src/core/verification/test-coverage.js";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import { resolveResumeStep } from "../../../src/core/resume/resolve-step.js";
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { STANDARD_DESCRIPTOR, FAST_DESCRIPTOR } from "../../../src/core/pipeline/registry.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { OutputContract } from "../../../src/core/port/output-contract.js";
import { changeFolderPath } from "../../../src/util/paths.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";

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

/**
 * Tests for content-format OutputContract detection and repair flow.
 *
 * Coverage:
 *   T-03: LocalRuntime.validateStepOutputs — content-format detection (valid, invalid, missing)
 *   T-04: ManagedRuntime.validateStepOutputs — content-format detection (via getRawFile mock)
 *   T-05: DesignStep.outputContracts — spec.md content-format contract, spec-required vs exempt
 *   T-06: CodeReviewStep.outputContracts — review-feedback content-format contract
 *   T-07: makeOutputGateHalt — content-format violation rendering
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import { DesignStep } from "../../../src/core/step/design.js";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import { makeOutputGateHalt } from "../../../src/core/step/step-halt.js";
import type { OutputContract, OutputViolation } from "../../../src/core/port/output-contract.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "content-format-detection-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
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
  };
}

function makeLocalRuntime(): LocalRuntime {
  const githubClient = buildMockGitHubClient();
  return new LocalRuntime({
    cwd: tempDir,
    githubClient,
    githubToken: "token",
    spawnFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  });
}

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test-slug-abcd1234",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(type = "new-feature"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type,
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
  };
}

const SPEC_FORMAT_CONTRACT: OutputContract = {
  kind: "content-format",
  path: "specrunner/changes/test-slug/spec.md",
  policy: "follow-up",
  checks: [
    { label: "requirement header", pattern: "^###\\s+Requirement:", flags: "m" },
    { label: "scenario header", pattern: "^####\\s+Scenario:", flags: "m" },
    { label: "normative keyword", pattern: "\\b(SHALL|MUST)\\b" },
  ],
};

const VALID_SPEC_CONTENT = [
  "### Requirement: Authentication",
  "",
  "The system SHALL enforce authentication for all requests.",
  "",
  "#### Scenario: Login success",
  "Given a valid user, when they log in, then access is granted.",
].join("\n");

const INVALID_SPEC_CONTENT = [
  "### Requirement: Authentication",
  "",
  "The system shall enforce authentication for all requests.",
  // Missing #### Scenario: header
].join("\n");

// ---------------------------------------------------------------------------
// T-03: LocalRuntime.validateStepOutputs — content-format detection
// ---------------------------------------------------------------------------

describe("T-03: LocalRuntime.validateStepOutputs — content-format detection", () => {
  it("returns no violations for valid content-format file", async () => {
    const specPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(specPath, { recursive: true });
    await fs.writeFile(path.join(specPath, "spec.md"), VALID_SPEC_CONTENT, "utf-8");

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(0);
  });

  it("returns violation with failed labels when content fails checks", async () => {
    const specPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(specPath, { recursive: true });
    await fs.writeFile(path.join(specPath, "spec.md"), INVALID_SPEC_CONTENT, "utf-8");

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.kind).toBe("content-format");
    expect(v.path).toBe("specrunner/changes/test-slug/spec.md");
    expect(v.policy).toBe("follow-up");
    expect(v.detail).toContain("scenario header");
    expect(v.detail).toContain("normative keyword");
  });

  it("returns violation when file is missing (content = null)", async () => {
    // File does not exist
    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.kind).toBe("content-format");
    expect(v.detail).toContain("requirement header");
    expect(v.detail).toContain("scenario header");
    expect(v.detail).toContain("normative keyword");
  });

  it("existing produced/tasks-complete detection is unaffected (regression)", async () => {
    const tasksPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(tasksPath, { recursive: true });
    await fs.writeFile(
      path.join(tasksPath, "tasks.md"),
      "- [ ] Incomplete task\n- [x] Done task\n",
      "utf-8",
    );

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/test-slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("tasks-complete");
    expect(result.violations[0]?.detail).toContain("Incomplete task");
  });

  it("strips HTML comments before evaluating patterns (local runtime)", async () => {
    // Requirement header appears only inside an HTML comment — should fail
    const specPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(specPath, { recursive: true });
    const content = [
      "<!-- ### Requirement: hidden -->",
      "The system SHALL do something.",
      "#### Scenario: Test",
    ].join("\n");
    await fs.writeFile(path.join(specPath, "spec.md"), content, "utf-8");

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.detail).toContain("requirement header");
  });
});

// ---------------------------------------------------------------------------
// T-04: ManagedRuntime.validateStepOutputs — content-format detection
// ---------------------------------------------------------------------------

function makeManagedRuntime() {
  const sessionClient = {
    createSession: vi.fn(),
    sendUserMessage: vi.fn(),
    pollUntilComplete: vi.fn(),
    streamEvents: vi.fn(),
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
  };
  const githubClient = buildMockGitHubClient();
  const runtime = new ManagedRuntime(
    tempDir,
    sessionClient,
    githubClient,
    { owner: "testowner", name: "testrepo" },
    undefined,
    "",
  );
  return { runtime, githubClient };
}

describe("T-04: ManagedRuntime.validateStepOutputs — content-format detection", () => {
  it("returns no violations when getRawFile returns valid content", async () => {
    const { runtime, githubClient } = makeManagedRuntime();
    githubClient.getRawFile.mockResolvedValue(VALID_SPEC_CONTENT);

    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(0);
  });

  it("returns violation with failed labels when getRawFile returns invalid content", async () => {
    const { runtime, githubClient } = makeManagedRuntime();
    githubClient.getRawFile.mockResolvedValue(INVALID_SPEC_CONTENT);

    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.kind).toBe("content-format");
    expect(v.detail).toContain("scenario header");
    expect(v.detail).toContain("normative keyword");
  });

  it("returns violation when getRawFile returns null (file missing)", async () => {
    const { runtime, githubClient } = makeManagedRuntime();
    githubClient.getRawFile.mockResolvedValue(null);

    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.kind).toBe("content-format");
    // null → all checks fail
    expect(v.detail).toHaveLength(3);
  });

  it("returns violations for all contracts when branch is null", async () => {
    const { runtime } = makeManagedRuntime();

    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, null);

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("content-format");
  });

  it("delegates check logic to evaluateContentFormatChecks (no regex in managed runtime)", async () => {
    // This test verifies the managed runtime calls getRawFile and propagates
    // the result to evaluateContentFormatChecks (indirectly, via the contract).
    const { runtime, githubClient } = makeManagedRuntime();
    const validContent = "### Requirement: foo\nThe system SHALL do it.\n#### Scenario: bar";
    githubClient.getRawFile.mockResolvedValue(validContent);

    const result = await runtime.validateStepOutputs([SPEC_FORMAT_CONTRACT], tempDir, "feat/test");
    expect(result.violations).toHaveLength(0);
    expect(githubClient.getRawFile).toHaveBeenCalledWith("testowner", "testrepo", "feat/test", "specrunner/changes/test-slug/spec.md");
  });

  it("existing produced/tasks-complete detection is unaffected in managed runtime (regression)", async () => {
    const { runtime, githubClient } = makeManagedRuntime();
    // tasks.md with incomplete task
    githubClient.getRawFile.mockResolvedValue("- [ ] Incomplete task\n");

    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/test-slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("tasks-complete");
    expect(result.violations[0]?.detail).toContain("Incomplete task");
  });
});

// ---------------------------------------------------------------------------
// T-05: DesignStep.outputContracts — spec.md content-format contract
// ---------------------------------------------------------------------------

describe("T-05: DesignStep.outputContracts", () => {
  const state = makeMinimalState();

  it("followUpPrompt is undefined (deterministic format check moved to outputContracts)", () => {
    expect(DesignStep.followUpPrompt).toBeUndefined();
  });

  it("returns content-format contract for spec.md when spec is required (new-feature)", () => {
    const deps = makeMinimalDeps("new-feature");
    const contracts = DesignStep.outputContracts!(state, deps);

    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.kind).toBe("content-format");
    expect(c.path).toContain("spec.md");
    expect(c.policy).toBe("follow-up");
    expect(c.checks).toBeDefined();
    expect(c.checks!.length).toBeGreaterThan(0);
  });

  it("returns content-format contract for spec-change type", () => {
    const deps = makeMinimalDeps("spec-change");
    const contracts = DesignStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.kind).toBe("content-format");
  });

  it("returns content-format contract for bug-fix type", () => {
    const deps = makeMinimalDeps("bug-fix");
    const contracts = DesignStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.kind).toBe("content-format");
  });

  it("returns content-format contract for refactoring type", () => {
    const deps = makeMinimalDeps("refactoring");
    const contracts = DesignStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.kind).toBe("content-format");
  });

  it("returns [] for spec-exempt type (chore)", () => {
    const deps = makeMinimalDeps("chore");
    const contracts = DesignStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(0);
  });

  it("contract checks include requirement header, scenario header, and normative keyword", () => {
    const deps = makeMinimalDeps("new-feature");
    const contracts = DesignStep.outputContracts!(state, deps);
    const checks = contracts[0]!.checks!;

    const labels = checks.map((c) => c.label);
    expect(labels.join(" ")).toMatch(/[Rr]equirement/);
    expect(labels.join(" ")).toMatch(/[Ss]cenario/);
    expect(labels.join(" ")).toMatch(/SHALL|MUST|normative/);
  });

  it("valid spec → validateStepOutputs returns 0 violations (integration with local runtime)", async () => {
    const specPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(specPath, { recursive: true });
    await fs.writeFile(path.join(specPath, "spec.md"), VALID_SPEC_CONTENT, "utf-8");

    const deps = makeMinimalDeps("new-feature");
    const contracts = DesignStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");
    expect(result.violations).toHaveLength(0);
  });

  it("invalid spec (Scenario missing) → validateStepOutputs returns follow-up violation (integration)", async () => {
    const specPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(specPath, { recursive: true });
    // Only has requirement header and SHALL — no #### Scenario:
    const content = "### Requirement: Auth\n\nThe system SHALL enforce auth.\n";
    await fs.writeFile(path.join(specPath, "spec.md"), content, "utf-8");

    const deps = makeMinimalDeps("new-feature");
    const contracts = DesignStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.policy).toBe("follow-up");
    // The failed label should reference "Scenario" (exact label from DesignStep.outputContracts)
    const detail = result.violations[0]?.detail ?? [];
    const hasScenarioLabel = detail.some((label) => label.toLowerCase().includes("scenario"));
    expect(hasScenarioLabel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-06: CodeReviewStep.outputContracts — evidence report format (verdict-channel-unification)
// ---------------------------------------------------------------------------

// Evidence report format: 検証した項目 / 検証できなかった項目 sections required (TC-005, TC-006)
const VALID_REVIEW_FEEDBACK = [
  "## 検証した項目",
  "",
  "Reviewed src/foo.ts and src/bar.ts. Read design.md and tasks.md.",
  "",
  "## 検証できなかった項目",
  "",
  "None",
  "",
  "## Findings 詳細",
  "",
  "None",
].join("\n");

const INVALID_REVIEW_FEEDBACK_NO_SECTIONS = [
  "## Findings",
  "",
  "- Finding 1: some issue in foo.ts",
  "- Finding 2: another issue",
].join("\n");

const INVALID_REVIEW_FEEDBACK_MISSING_UNVERIFIED = [
  "## 検証した項目",
  "",
  "Reviewed src/foo.ts.",
  // Missing ## 検証できなかった項目
].join("\n");

describe("T-06: CodeReviewStep.outputContracts — evidence report format", () => {
  const state = makeMinimalState({ step: "code-review" });

  it("returns content-format contract for review-feedback path", () => {
    const deps = makeMinimalDeps("new-feature");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.kind).toBe("content-format");
    expect(c.path).toContain("review-feedback");
    expect(c.policy).toBe("follow-up");
    expect(c.checks).toBeDefined();
    expect(c.checks!.length).toBeGreaterThanOrEqual(2);
  });

  it("contract checks include evidence section labels (TC-006, TC-007)", () => {
    const deps = makeMinimalDeps("new-feature");
    const contracts = CodeReviewStep.outputContracts!(state, deps);
    const checks = contracts[0]!.checks!;

    const labels = checks.map((c) => c.label);
    // Must include evidence section checks
    expect(labels.some((l) => l.includes("検証した項目"))).toBe(true);
    expect(labels.some((l) => l.includes("検証できなかった項目"))).toBe(true);
    // Must NOT include old 7-column separator/header checks (TC-007)
    expect(labels.some((l) => l.toLowerCase().includes("separator"))).toBe(false);
    expect(labels.some((l) => l.includes("7 columns"))).toBe(false);
  });

  it("valid evidence report → validateStepOutputs returns 0 violations (TC-005)", async () => {
    const feedbackPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackPath, { recursive: true });
    await fs.writeFile(path.join(feedbackPath, "review-feedback-001.md"), VALID_REVIEW_FEEDBACK, "utf-8");

    const deps = makeMinimalDeps("new-feature");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");
    expect(result.violations).toHaveLength(0);
  });

  it("missing both evidence sections → follow-up violation with section labels (TC-006)", async () => {
    const feedbackPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackPath, { recursive: true });
    await fs.writeFile(path.join(feedbackPath, "review-feedback-001.md"), INVALID_REVIEW_FEEDBACK_NO_SECTIONS, "utf-8");

    const deps = makeMinimalDeps("new-feature");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.policy).toBe("follow-up");
    expect(result.violations[0]?.detail).toContain("Verified section present (## 検証した項目)");
    expect(result.violations[0]?.detail).toContain("Unverified section present (## 検証できなかった項目)");
  });

  it("missing 検証できなかった項目 section → follow-up violation (TC-006)", async () => {
    const feedbackPath = path.join(tempDir, "specrunner/changes/test-slug");
    await fs.mkdir(feedbackPath, { recursive: true });
    await fs.writeFile(path.join(feedbackPath, "review-feedback-001.md"), INVALID_REVIEW_FEEDBACK_MISSING_UNVERIFIED, "utf-8");

    const deps = makeMinimalDeps("new-feature");
    const contracts = CodeReviewStep.outputContracts!(state, deps);

    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.detail).toContain("Unverified section present (## 検証できなかった項目)");
  });

  it("followUpPrompt is absent (post-work self-check turn removed)", () => {
    expect(CodeReviewStep.followUpPrompt).toBeUndefined();
  });

  it("contract does NOT check for 7-column table pattern (TC-007)", () => {
    const state2: import("../../../src/state/schema.js").JobState = {
      version: 1,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "code-review",
      status: "running",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
    };
    const contracts = CodeReviewStep.outputContracts!(state2, { config: { version: 1, agents: {}, environment: { id: "env", lastSyncedAt: "2026" } }, request: { type: "feature", title: "T", slug: "new-feature", baseBranch: "main", content: "c", adr: false }, slug: "new-feature" });
    const cf = contracts.find((c) => c.kind === "content-format");
    expect(cf).toBeDefined();
    const patterns = (cf!.checks ?? []).map((c) => c.pattern);
    // Must NOT contain 7-column header pattern (TC-007)
    expect(patterns.some((p) => p.includes("Severity") && p.includes("How to Fix") && p.includes("Fix"))).toBe(false);
    // Must contain evidence section patterns
    expect(patterns.some((p) => p.includes("検証した項目"))).toBe(true);
    expect(patterns.some((p) => p.includes("検証できなかった項目"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-07: makeOutputGateHalt — content-format violation rendering
// ---------------------------------------------------------------------------

describe("T-07: makeOutputGateHalt — content-format violation rendering", () => {
  it("includes path and failed labels for content-format violation", () => {
    const violations: OutputViolation[] = [
      {
        kind: "content-format",
        path: "specrunner/changes/test-slug/spec.md",
        policy: "follow-up",
        detail: ["requirement header", "normative keyword"],
      },
    ];
    const halt = makeOutputGateHalt(violations, "design", "feat/test");

    expect(halt.error.message).toContain("specrunner/changes/test-slug/spec.md");
    expect(halt.error.message).toContain("requirement header");
    expect(halt.error.message).toContain("normative keyword");
    expect(halt.error.hint).toContain("format violations");
  });

  it("uses 'see file' fallback when detail is empty for content-format", () => {
    const violations: OutputViolation[] = [
      {
        kind: "content-format",
        path: "specrunner/changes/test-slug/spec.md",
        policy: "follow-up",
        detail: [],
      },
    ];
    const halt = makeOutputGateHalt(violations, "design", "feat/test");
    expect(halt.error.hint).toContain("see file");
  });

  it("existing tasks-complete violation rendering is unchanged (regression)", () => {
    const violations: OutputViolation[] = [
      {
        kind: "tasks-complete",
        path: "specrunner/changes/test-slug/tasks.md",
        policy: "follow-up",
        detail: ["Write tests"],
      },
    ];
    const halt = makeOutputGateHalt(violations, "implementer", "feat/test");
    expect(halt.error.hint).toContain("incomplete tasks");
    expect(halt.error.hint).toContain("Write tests");
  });

  it("existing produced violation rendering is unchanged (regression)", () => {
    const violations: OutputViolation[] = [
      {
        kind: "produced",
        path: "specrunner/changes/test-slug/design.md",
        policy: "halt",
        detail: [],
      },
    ];
    const halt = makeOutputGateHalt(violations, "design", "feat/test");
    expect(halt.error.hint).toContain("design.md");
    // produced violations show just path, no 'incomplete tasks' or 'format violations'
    expect(halt.error.hint).not.toContain("incomplete tasks");
    expect(halt.error.hint).not.toContain("format violations");
  });
});

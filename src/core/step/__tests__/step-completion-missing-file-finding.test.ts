/**
 * Tests for 欠落指摘 finding の構造化宣言と反転検証
 * Source: specrunner/changes/missing-file-finding-declaration/test-cases.md
 *
 * Must TCs:
 *   TC-001: parseFindings captures fileMissing: true
 *   TC-002: parseFindings treats absent/false fileMissing as non-declaration
 *   TC-003: legitimate missing-file declaration preserves routing (#916 reproduction)
 *   TC-004: false declaration (fileMissing:true but file present) → escalation
 *   TC-005: non-declared finding with absent file → escalation + no escalationReason (regression protection)
 *   TC-006: local / managed runtime symmetry
 *   TC-007: fileMissing:true finding's line is not passed to verifyFindingRefs seam
 *   TC-012: Finding type has fileMissing?: boolean field
 *
 * Should TCs (included for completeness):
 *   TC-008: Finding type has fileMissing and existing fields unchanged
 *   TC-009: 4 tool schemas include fileMissing in generated JSON schema
 *   TC-010: 4 tool descriptions mention fileMissing
 *   TC-011: fileMissing absent/false/non-boolean → non-declaration in parseFindings
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { parseFindings } from "../../port/report-result.js";
import { deriveStepCompletion } from "../step-completion.js";
import { JUDGE_REPORT_TOOL } from "../report-tool.js";
import { deriveRegressionGateVerdict } from "../judge-verdict.js";
import { LocalRuntime } from "../../runtime/local.js";
import { ManagedRuntime } from "../../runtime/managed.js";

import type { Finding } from "../../../kernel/report-result.js";
import type { JudgeReportResult } from "../../port/report-result.js";
import type { Step } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { FindingRef } from "../../port/runtime-strategy.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeStep(name = "regression-gate", useRegressionFn = true): Step {
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
    reportTool: JUDGE_REPORT_TOOL,
    ...(useRegressionFn ? { judgeVerdictFn: deriveRegressionGateVerdict } : {}),
    buildMessage: () => "run review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

function makeState(step = "regression-gate"): JobState {
  return {
    version: 2,
    jobId: "missing-file-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "spec-change",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step,
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {},
  };
}

function makeBaseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    slug: "example",
    cwd: "/tmp",
    config: { version: 1, agents: {} } as unknown as PipelineDeps["config"],
    request: {
      type: "spec-change",
      title: "Example",
      slug: "example",
      baseBranch: "main",
      content: "content",
      adr: false,
      path: "specrunner/changes/example/request.md",
    },
    githubClient: {} as unknown as PipelineDeps["githubClient"],
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: (() => ({})) as unknown as PipelineDeps["storeFactory"],
    runner: {} as unknown as PipelineDeps["runner"],
    ...overrides,
  } as unknown as PipelineDeps;
}

/**
 * Build a minimal JudgeReportResult for test injection.
 * Uses unknown cast so that fileMissing (not yet on Finding type) is preserved at runtime.
 */
function makeToolResult(findings: (Partial<Finding> & { fileMissing?: boolean })[]): JudgeReportResult {
  return {
    ok: true,
    findings: findings as unknown as Finding[],
    evidence: { checked: 1, skipped: 0, unverified: 0 },
  } as JudgeReportResult;
}

// ---------------------------------------------------------------------------
// TC-001: parseFindings captures fileMissing: true
// Source: spec.md > finding は対象ファイルの欠落を構造化宣言できる >
//         Scenario: 欠落宣言 finding が parse で保持される
// ---------------------------------------------------------------------------

describe("TC-001: parseFindings captures fileMissing: true", () => {
  it("TC-001: finding with fileMissing:true → parsed finding has fileMissing===true", () => {
    const raw = [
      {
        severity: "high",
        resolution: "fixable",
        file: "docs/implementation-notes.md",
        fileMissing: true,
        title: "implementation-notes.md not created",
        rationale: "The file was required but is absent",
      },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // After T-01: parsed finding must carry fileMissing===true
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: parseFindings treats absent/false fileMissing as non-declaration
// Source: spec.md > finding は対象ファイルの欠落を構造化宣言できる >
//         Scenario: 非宣言 finding は従来通り
// ---------------------------------------------------------------------------

describe("TC-002: parseFindings — absent or false fileMissing → non-declaration", () => {
  it("TC-002a: absent fileMissing → finding.fileMissing is undefined", () => {
    const raw = [
      { severity: "high", resolution: "fixable", file: "src/foo.ts", title: "t", rationale: "r" },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBeUndefined();
  });

  it("TC-002b: fileMissing:false → finding.fileMissing is undefined (silent-capture like origin)", () => {
    const raw = [
      {
        severity: "high",
        resolution: "fixable",
        file: "src/foo.ts",
        fileMissing: false,
        title: "t",
        rationale: "r",
      },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-003: legitimate missing-file declaration preserves routing (#916 reproduction)
// Source: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する >
//         Scenario: 正当な欠落指摘の routing が保たれる（#916）
// ---------------------------------------------------------------------------

describe("TC-003: valid missing-file declaration preserves needs-fix routing (#916)", () => {
  it(
    "TC-003: fileMissing:true + file absent → escalation override does NOT occur, verdict stays needs-fix",
    async () => {
      // Simulate #916: regression-gate detects that implementation-notes.md is missing.
      // With fileMissing:true and the file genuinely absent (seam returns it as nonExistent),
      // the implementation should NOT trigger escalation override — routing is preserved.
      const nonExistentFiles = new Set(["docs/implementation-notes.md"]);
      const capturedRefs: FindingRef[][] = [];
      const mockVerifyFindingRefs = vi.fn(async (refs: FindingRef[]) => {
        capturedRefs.push(refs);
        return refs.filter((r) => nonExistentFiles.has(r.file));
      });

      const deps = makeBaseDeps({
        cwd: "/fake-cwd",
        runtimeStrategy: { verifyFindingRefs: mockVerifyFindingRefs } as unknown as PipelineDeps["runtimeStrategy"],
      });
      const step = makeStep("regression-gate", true);
      const state = makeState("regression-gate");
      const toolResult = makeToolResult([
        {
          severity: "high",
          resolution: "fixable",
          file: "docs/implementation-notes.md",
          fileMissing: true,
          title: "implementation-notes.md not created",
          rationale: "The file was required by the spec but is missing",
        },
      ]);

      const completion = await deriveStepCompletion(step, state, deps, { toolResult }, undefined);

      // After implementation: fileMissing:true + file absent → no override → needs-fix
      // Before implementation: seam returns file as nonExistent → override → escalation  (RED)
      expect(completion.verdict).toBe("needs-fix");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: false declaration (fileMissing:true but file present) → escalation
// Source: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する >
//         Scenario: 虚偽の欠落宣言は escalation に上書きされる
// ---------------------------------------------------------------------------

describe("TC-004: false declaration — fileMissing:true but file exists → escalation", () => {
  it(
    "TC-004: fileMissing:true but file exists (seam returns empty) → verdict is escalation",
    async () => {
      // File "exists": seam returns empty nonExistent list.
      // A false declaration (claiming file is missing when it's not) must trigger escalation.
      const mockVerifyFindingRefs = vi.fn(async (_refs: FindingRef[]) => {
        return []; // file "exists" — not in nonExistent list
      });

      const deps = makeBaseDeps({
        cwd: "/fake-cwd",
        runtimeStrategy: { verifyFindingRefs: mockVerifyFindingRefs } as unknown as PipelineDeps["runtimeStrategy"],
      });
      const step = makeStep("code-review", false);
      const state = makeState("code-review");
      const toolResult = makeToolResult([
        {
          severity: "high",
          resolution: "fixable",
          file: "src/existing.ts",
          fileMissing: true, // false declaration: file actually exists
          title: "file not created",
          rationale: "claiming file is absent, but it exists",
        },
      ]);

      const completion = await deriveStepCompletion(step, state, deps, { toolResult }, undefined);

      // After implementation: fileMissing:true + file present → false declaration → escalation
      // Before implementation: no nonExistent refs → no override → needs-fix  (RED)
      expect(completion.verdict).toBe("escalation");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: non-declared finding with absent file → escalation + no escalationReason
// Source: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する >
//         Scenario: 非宣言 finding の不在は従来通り escalation に上書きされ routing が消える
// ---------------------------------------------------------------------------

describe("TC-005: non-declared finding + absent file → escalation, no escalationReason (regression)", () => {
  it(
    "TC-005: non-declared (no fileMissing), file absent → verdict===escalation AND escalationReason===undefined",
    async () => {
      // Regression protection: existing behavior must be preserved.
      // Non-declared finding with absent file → escalation override + verdictOverriddenByFindingRef=true
      // → escalationReason calculation is suppressed.
      const nonExistentFiles = new Set(["src/hallucinated.ts"]);
      const mockVerifyFindingRefs = vi.fn(async (refs: FindingRef[]) => {
        return refs.filter((r) => nonExistentFiles.has(r.file));
      });

      const deps = makeBaseDeps({
        cwd: "/fake-cwd",
        runtimeStrategy: { verifyFindingRefs: mockVerifyFindingRefs } as unknown as PipelineDeps["runtimeStrategy"],
      });
      const step = makeStep("code-review", false);
      const state = makeState("code-review");
      const toolResult = makeToolResult([
        {
          severity: "high",
          resolution: "fixable",
          file: "src/hallucinated.ts",
          // No fileMissing — standard (non-declared) finding
          title: "issue in hallucinated file",
          rationale: "file was hallucinated by agent",
        },
      ]);

      const completion = await deriveStepCompletion(step, state, deps, { toolResult }, undefined);

      // Traditional behavior: non-declared finding + absent file → escalation (hallucination guard)
      expect(completion.verdict).toBe("escalation");
      // escalationReason must be absent (verdictOverriddenByFindingRef suppresses it)
      expect(completion.escalationReason).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: local / managed runtime symmetry
// Source: spec.md > Requirement: finding-ref 検証は欠落宣言別に期待を反転する >
//         Scenario: local / managed 両 runtime で同一挙動
// ---------------------------------------------------------------------------

describe("TC-006: local / managed runtime symmetry for missing-file declaration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "missing-file-finding-tc006-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function buildMockGithubClient(
    getRawFileFn: (...args: unknown[]) => Promise<string | null>,
  ): GitHubClient {
    return {
      getRawFile: vi.fn().mockImplementation(getRawFileFn),
    } as unknown as GitHubClient;
  }

  function buildMockSessionClient(): SessionClient {
    return {
      createSession: vi.fn(),
      sendUserMessage: vi.fn(),
      pollUntilComplete: vi.fn(),
      streamEvents: vi.fn(),
      getSessionUsage: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
      sendEvents: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionClient;
  }

  function makeManagedRuntime(
    getRawFileFn: (...args: unknown[]) => Promise<string | null>,
  ): ManagedRuntime {
    const repo: OriginInfo = { owner: "testowner", name: "testrepo" };
    return new ManagedRuntime(
      tempDir,
      buildMockSessionClient(),
      buildMockGithubClient(getRawFileFn),
      repo,
      undefined,
      "fake-token",
    );
  }

  function makeLocalRuntime(): LocalRuntime {
    return new LocalRuntime({
      cwd: tempDir,
      githubClient: {
        getRawFile: vi.fn().mockResolvedValue(null),
      } as unknown as GitHubClient,
    });
  }

  async function runCompletionWith(
    runtimeStrategy: PipelineDeps["runtimeStrategy"],
    cwd: string,
    fileMissingOnFinding: boolean,
    fileExists: boolean, // for documentation only; seam controls reality
  ): Promise<import("../step-completion.js").StepCompletion> {
    void fileExists; // runtime controls this via its own seam

    const step = makeStep("regression-gate", true);
    const state = {
      ...makeState("regression-gate"),
      branch: "change/example-abc12345",
    };
    const toolResult = makeToolResult([
      {
        severity: "high",
        resolution: "fixable",
        file: "docs/missing-or-present.md",
        ...(fileMissingOnFinding ? { fileMissing: true } : {}),
        title: "file status finding",
        rationale: "testing runtime symmetry",
      },
    ]);
    return deriveStepCompletion(
      step,
      state,
      makeBaseDeps({ cwd, runtimeStrategy }),
      { toolResult },
      undefined,
    );
  }

  it("TC-006-L-valid: LocalRuntime — fileMissing:true + file NOT in fs → routing preserved (needs-fix)", async () => {
    // File does NOT exist in tempDir → LocalRuntime.verifyFindingRefs returns it as nonExistent
    // After implementation: fileMissing:true + absent → no override → needs-fix
    // Before implementation: absent → nonExistent → override → escalation  (RED)
    const runtime = makeLocalRuntime();
    const completion = await runCompletionWith(runtime, tempDir, true, false);
    expect(completion.verdict).toBe("needs-fix");
  });

  it("TC-006-L-false: LocalRuntime — fileMissing:true + file EXISTS in fs → escalation (false declaration)", async () => {
    // Create the file in tempDir so it actually exists
    await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "docs/missing-or-present.md"), "content\n");
    // After implementation: fileMissing:true + present → false declaration → escalation
    // Before implementation: present → nonExistent empty → no override → needs-fix  (RED)
    const runtime = makeLocalRuntime();
    const completion = await runCompletionWith(runtime, tempDir, true, true);
    expect(completion.verdict).toBe("escalation");
  });

  it("TC-006-M-valid: ManagedRuntime — fileMissing:true + getRawFile returns null → routing preserved (needs-fix)", async () => {
    // null from getRawFile means file doesn't exist on GitHub
    // After implementation: fileMissing:true + absent → no override → needs-fix
    // Before implementation: absent → nonExistent → override → escalation  (RED)
    const runtime = makeManagedRuntime(async () => null);
    const completion = await runCompletionWith(runtime, tempDir, true, false);
    expect(completion.verdict).toBe("needs-fix");
  });

  it("TC-006-M-false: ManagedRuntime — fileMissing:true + getRawFile returns content → escalation (false declaration)", async () => {
    // non-null from getRawFile means file exists on GitHub
    // After implementation: fileMissing:true + present → false declaration → escalation
    // Before implementation: present → nonExistent empty → no override → needs-fix  (RED)
    const runtime = makeManagedRuntime(async () => "file content\n");
    const completion = await runCompletionWith(runtime, tempDir, true, true);
    expect(completion.verdict).toBe("escalation");
  });

  it("TC-006-symmetry: local and managed agree — fileMissing:true + absent → both need-fix", async () => {
    // Symmetry: both runtimes produce the same verdict for the same input condition.
    const localRuntime = makeLocalRuntime(); // file not in tempDir
    const managedRuntime = makeManagedRuntime(async () => null); // null = absent

    const [localResult, managedResult] = await Promise.all([
      runCompletionWith(localRuntime, tempDir, true, false),
      runCompletionWith(managedRuntime, tempDir, true, false),
    ]);

    // Both must agree: no override for valid missing-file declarations
    expect(localResult.verdict).toBe(managedResult.verdict);
    expect(localResult.verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-007: fileMissing:true finding's line is NOT passed to verifyFindingRefs seam
// Source: spec.md > Requirement: 欠落宣言 finding では line を検証に使わない >
//         Scenario: 欠落宣言 finding の line は無視される
// ---------------------------------------------------------------------------

describe("TC-007: fileMissing:true + line → line is NOT passed to verifyFindingRefs", () => {
  it("TC-007: seam receives ref without line for fileMissing:true findings with line set", async () => {
    const capturedRefs: FindingRef[][] = [];
    const mockVerifyFindingRefs = vi.fn(async (refs: FindingRef[]) => {
      capturedRefs.push([...refs]);
      // Return refs as nonExistent (file is absent = valid declaration)
      return [...refs];
    });

    const deps = makeBaseDeps({
      cwd: "/fake-cwd",
      runtimeStrategy: { verifyFindingRefs: mockVerifyFindingRefs } as unknown as PipelineDeps["runtimeStrategy"],
    });
    const step = makeStep("regression-gate", true);
    const state = makeState("regression-gate");
    const toolResult = makeToolResult([
      {
        severity: "high",
        resolution: "fixable",
        file: "docs/implementation-notes.md",
        fileMissing: true,
        line: 42, // This line MUST NOT be passed to the seam
        title: "missing file",
        rationale: "file not created",
      },
    ]);

    await deriveStepCompletion(step, state, deps, { toolResult }, undefined);

    // After implementation: fileMissing:true findings call verifyFindingRefs WITHOUT line
    // Before implementation: line is included in refs → capturedRefs contain line: 42  (RED)
    expect(mockVerifyFindingRefs).toHaveBeenCalled();
    const allCapturedRefs = capturedRefs.flat();
    // Find any ref for our missing file
    const refForMissingFile = allCapturedRefs.find((r) => r.file === "docs/implementation-notes.md");
    expect(refForMissingFile).toBeDefined();
    // The ref must NOT have line
    expect(refForMissingFile?.line).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: Finding type has fileMissing and existing fields unchanged (should)
// Source: tasks.md > T-01
// ---------------------------------------------------------------------------

describe("TC-008: Finding type — fileMissing field presence and existing fields intact (type-level)", () => {
  it("TC-008: Finding type has fileMissing?: boolean field", () => {
    // This test verifies at the type level that Finding has fileMissing.
    // TypeScript will error on the assignment below until T-01 adds fileMissing to Finding.
    // The implementation makes this test pass both at typecheck and at runtime.
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/test.ts",
      title: "test",
      rationale: "test",
      fileMissing: true, // TypeScript error before implementation (makes TC-012 red too)
    };
    expect(f.fileMissing).toBe(true);
  });

  it("TC-008b: existing Finding fields are unchanged after adding fileMissing", () => {
    const f: Finding = {
      severity: "critical",
      resolution: "fixable",
      file: "src/example.ts",
      line: 10,
      title: "example",
      rationale: "example",
      fixTarget: "code-fixer",
      origin: "scope",
    };
    // Existing fields must remain intact
    expect(f.severity).toBe("critical");
    expect(f.resolution).toBe("fixable");
    expect(f.file).toBe("src/example.ts");
    expect(f.line).toBe(10);
    expect(f.fixTarget).toBe("code-fixer");
    expect(f.origin).toBe("scope");
    // fileMissing should be optional (absent = undefined)
    expect(f.fileMissing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-009: 4 tool schemas include fileMissing in generated JSON schema (should)
// Source: tasks.md > T-02
// ---------------------------------------------------------------------------

describe("TC-009: 4 tool zodSchemas include fileMissing in JSON schema output", () => {
  it("TC-009: JUDGE_REPORT_TOOL findings schema has fileMissing in toJSONSchema output", async () => {
    const { object, toJSONSchema } = await import("zod/v4-mini");
    const { JUDGE_REPORT_TOOL: judgeToolSchema } = await import("../report-tool.js");
    const jsonSchema = toJSONSchema(object(judgeToolSchema.zodSchema)) as Record<string, unknown>;
    // Navigate to the findings array items properties
    const props = jsonSchema["properties"] as Record<string, unknown> | undefined;
    const findingsSchema = props?.["findings"] as Record<string, unknown> | undefined;
    const itemsSchema = findingsSchema?.["items"] as Record<string, unknown> | undefined;
    const itemProps = itemsSchema?.["properties"] as Record<string, unknown> | undefined;
    // After T-02: fileMissing must appear as an optional boolean property
    expect(itemProps).toBeDefined();
    expect(itemProps?.["fileMissing"]).toBeDefined();
  });

  it("TC-009b: CONFORMANCE_REPORT_TOOL conformanceFindingSchema has fileMissing", async () => {
    const { object, toJSONSchema } = await import("zod/v4-mini");
    const { CONFORMANCE_REPORT_TOOL: conformanceToolSchema } = await import("../report-tool.js");
    const jsonSchema = toJSONSchema(object(conformanceToolSchema.zodSchema)) as Record<string, unknown>;
    const props = jsonSchema["properties"] as Record<string, unknown> | undefined;
    const findingsSchema = props?.["findings"] as Record<string, unknown> | undefined;
    const itemsSchema = findingsSchema?.["items"] as Record<string, unknown> | undefined;
    const itemProps = itemsSchema?.["properties"] as Record<string, unknown> | undefined;
    expect(itemProps).toBeDefined();
    expect(itemProps?.["fileMissing"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-010: 4 tool descriptions mention fileMissing (should)
// Source: tasks.md > T-02
// ---------------------------------------------------------------------------

describe("TC-010: 4 tool descriptions include fileMissing usage explanation", () => {
  it("TC-010: JUDGE_REPORT_TOOL description contains fileMissing", async () => {
    const { JUDGE_REPORT_TOOL: tool } = await import("../report-tool.js");
    expect(tool.description).toContain("fileMissing");
  });

  it("TC-010b: CODE_REVIEW_REPORT_TOOL description contains fileMissing", async () => {
    const { CODE_REVIEW_REPORT_TOOL: tool } = await import("../report-tool.js");
    expect(tool.description).toContain("fileMissing");
  });

  it("TC-010c: CONFORMANCE_REPORT_TOOL description contains fileMissing", async () => {
    const { CONFORMANCE_REPORT_TOOL: tool } = await import("../report-tool.js");
    expect(tool.description).toContain("fileMissing");
  });

  it("TC-010d: REQUEST_REVIEW_REPORT_TOOL description contains fileMissing", async () => {
    const { REQUEST_REVIEW_REPORT_TOOL: tool } = await import("../report-tool.js");
    expect(tool.description).toContain("fileMissing");
  });
});

// ---------------------------------------------------------------------------
// TC-011: fileMissing absent/false/non-boolean → non-declaration (should)
// Source: tasks.md > T-01
// ---------------------------------------------------------------------------

describe("TC-011: parseFindings — non-true fileMissing values → non-declaration", () => {
  it("TC-011a: fileMissing: 1 (number) → finding.fileMissing is undefined", () => {
    const raw = [
      {
        severity: "high",
        resolution: "fixable",
        file: "src/foo.ts",
        fileMissing: 1, // number, not boolean true
        title: "t",
        rationale: "r",
      },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBeUndefined();
  });

  it("TC-011b: fileMissing: 'true' (string) → finding.fileMissing is undefined", () => {
    const raw = [
      {
        severity: "high",
        resolution: "fixable",
        file: "src/foo.ts",
        fileMissing: "true", // string, not boolean true
        title: "t",
        rationale: "r",
      },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBeUndefined();
  });

  it("TC-011c: absent fileMissing → no parse error, finding.fileMissing is undefined", () => {
    const raw = [
      { severity: "high", resolution: "fixable", file: "src/foo.ts", title: "t", rationale: "r" },
    ];
    const result = parseFindings(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value[0] as unknown as Record<string, unknown>)["fileMissing"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: Finding type has fileMissing?: boolean (must — type-level check)
// Source: tasks.md > T-06 (typecheck passes)
//
// This test uses a direct type-level assignment that will produce a TypeScript
// compile error before T-01 adds fileMissing to the Finding interface.
// After implementation the typecheck passes (GREEN).
// ---------------------------------------------------------------------------

describe("TC-012: Finding type includes fileMissing optional boolean (type-level)", () => {
  it("TC-012: direct assignment to Finding.fileMissing compiles without cast", () => {
    // This assignment will produce a TypeScript type error until T-01:
    //   Property 'fileMissing' does not exist on type 'Finding'
    // After implementation (fileMissing?: boolean added to Finding), it compiles.
    const f: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "docs/missing.md",
      title: "file is missing",
      rationale: "file was required but absent",
      fileMissing: true, // TypeScript error before implementation → typecheck RED
    };
    expect(f.fileMissing).toBe(true);

    const g: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: "src/existing.ts",
      title: "no missing flag",
      rationale: "standard finding",
      // fileMissing absent → optional field is undefined
    };
    expect(g.fileMissing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013 and TC-014 notes:
//
// TC-013: bun run test が全 pass する — verified by running `bun run test` in CI.
//         This is satisfied when all tests in this file and existing tests pass.
//         No separate unit test representation needed.
//
// TC-014: 既存テストファイルへの変更がない — verified by `git diff` showing only
//         this new test file was added. No modifications to managed-verify-finding-refs.test.ts,
//         verify-finding-refs.test.ts, or any other existing test files.
// ---------------------------------------------------------------------------

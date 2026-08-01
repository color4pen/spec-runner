/**
 * Integration tests for spec-review 周回間 context 注入.
 *
 * Source: specrunner/changes/spec-review-prior-round-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * Covers:
 *   - TC-001: iteration ≥ 2 で前周 findings と fixer 変更 file が message に含まれる (must)
 *   - TC-002: fixer 変更 file の導出は listCommitChangedFiles mock 経由のみで構成される (must)
 *   - TC-003: 初回 spec-review（iteration 1）に注入ブロックが含まれない (must)
 *   - TC-004: 前周 fixer の commitOid が未記録の場合、注入を省略して step を正常続行する (must)
 *   - TC-005: listCommitChangedFiles が unavailable を返す場合、注入を省略して step を正常続行する (must)
 *   - TC-006: 注入ブロックに再指摘プロトコル文言と全量列挙維持が含まれ、免除文言は含まれない (must)
 *   - TC-007: 注入は state（stepRuns / journal）に永続化されず後続 step に伝播しない (must)
 *   - TC-008: DynamicContext に priorRoundContext optional field が追加され typecheck が green (must)
 *   - TC-009: collectDynamicContext は priorRoundContext を設定しない (should)
 *   - TC-020: SpecReviewStep.prepareRoundContext — iteration ≥ 2 + mock あり → priorRoundContext を含む Partial を返す (must)
 *   - TC-021: SpecReviewStep.prepareRoundContext — iteration 1 → null を返す (must)
 *   - TC-022: buildStepContext — prepareRoundContext が返す partial が input.dynamicContext にマージされる (must)
 *   - TC-023: buildStepContext — prepareRoundContext を持たない step では dynamicContext が無改変 (must)
 *   - TC-024: buildStepContext — prepareRoundContext が reject しても例外を投げず dynamicContext は enrich 前のまま (must)
 *   - TC-025: SpecReviewStep.buildMessage — priorRoundContext あり → message に findings・changedFiles・プロトコル文言が含まれる (must)
 *   - TC-026: SpecReviewStep.buildMessage — priorRoundContext absent → message に注入ブロックが含まれない (must)
 *   - TC-027: {{PRIOR_ROUND_CONTEXT}} placeholder が message に literal で残らない (must)
 *   - TC-028: 既存テスト（spec-review prompt / routing / finding-recency / step-context-builder）が無改変で green (must)
 *
 * NOTE (TC-028): TC-028 is verified by the CI green gate on unmodified existing test files.
 * The existing test files must not be changed: spec-review-full-enumeration-prompt.test.ts,
 * spec-review-fixer-routing.test.ts, step-context-builder.test.ts, and finding-recency tests.
 * This test file asserts that the public API of those modules is unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import type { JobState } from "../../../state/schema.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { Finding } from "../../../kernel/report-result.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Existing module imports (these files exist — we check for new features)
// ---------------------------------------------------------------------------

import type { DynamicContext } from "../../../git/dynamic-context.js";
import { collectDynamicContext } from "../../../git/dynamic-context.js";
import { SpecReviewStep } from "../spec-review.js";
import { buildStepContext, type BuildStepContextFs } from "../step-context-builder.js";

// SpecReviewStep type assertion — prepareRoundContext is a new optional method
const SpecReviewStepRecord = SpecReviewStep as unknown as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug";
const NOW = "2026-01-01T00:00:00.000Z";
const SPEC_MD = `specrunner/changes/${TEST_SLUG}/spec.md`;

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "prior-round-ctx-integration-test",
    createdAt: NOW,
    updatedAt: NOW,
    request: {
      path: `specrunner/changes/${TEST_SLUG}/request.md`,
      title: "Test Request",
      type: "spec-change",
      slug: TEST_SLUG,
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: STEP_NAMES.SPEC_REVIEW,
    status: "running",
    branch: `change/${TEST_SLUG}-abc12345`,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/** State where spec-review already ran once (next iteration = 2) */
function makeIteration2State(opts: {
  priorFindings?: Finding[];
  specFixerCommitOid?: string;
} = {}): JobState {
  const priorFindings: Finding[] = opts.priorFindings ?? [
    { severity: "high", resolution: "fixable", file: SPEC_MD, title: "Missing req", rationale: "test" },
  ];
  return makeBaseState({
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: priorFindings },
          },
          startedAt: NOW,
          endedAt: NOW,
        },
      ],
      ...(opts.specFixerCommitOid !== undefined
        ? {
            [STEP_NAMES.SPEC_FIXER]: [
              {
                attempt: 1,
                sessionId: null,
                outcome: { verdict: "approved", findingsPath: null, error: null },
                startedAt: NOW,
                endedAt: NOW,
                commitOid: opts.specFixerCommitOid,
              },
            ],
          }
        : {}),
    },
  });
}

/** Make a minimal DynamicContext for test fixtures */
function makeDynamicContext(extra: Partial<DynamicContext> = {}): DynamicContext {
  return {
    gitLog: "abc123 test commit",
    diffStat: "1 file changed",
    changesList: [TEST_SLUG],
    ...extra,
  };
}

/** Fake PipelineDeps with optional runtimeStrategy */
function makeDeps(opts: {
  runtimeStrategy?: PipelineDeps["runtimeStrategy"];
  dynamicContext?: DynamicContext;
} = {}): PipelineDeps {
  const store = {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
  return {
    cwd: "/tmp/test-worktree",
    slug: TEST_SLUG,
    config: { version: 1, runtime: "local", agents: {} } as never,
    request: {
      type: "spec-change",
      title: "Test Request",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "## Test request content\n\nThis is a test.",
      adr: false,
      path: `specrunner/changes/${TEST_SLUG}/request.md`,
    },
    dynamicContext: opts.dynamicContext,
    githubClient: {} as never,
    owner: "testowner",
    repo: "testrepo",
    spawn: vi.fn() as never,
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    repoRoot: undefined,
    runtimeStrategy: opts.runtimeStrategy,
  } as PipelineDeps;
}

function makeFakeRuntimeStrategy(opts: {
  files?: string[];
  kind?: "success" | "unavailable";
} = {}) {
  const kind = opts.kind ?? "success";
  const files = opts.files ?? [SPEC_MD];
  return {
    listCommitChangedFiles: async (_oid: string, _cwd: string) => {
      if (kind === "unavailable") {
        return { kind: "unavailable" as const, reason: "test-unavailable" };
      }
      return { kind: "success" as const, files };
    },
    validateStepOutputs: async () => [],
  } as unknown as PipelineDeps["runtimeStrategy"];
}

const stubFsAdapter: BuildStepContextFs = {
  readFile: async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
  readdir: async () => [],
};

const stubEmitFn = vi.fn();

// ===========================================================================
// TC-008: DynamicContext に priorRoundContext optional field が追加され typecheck が green
// ===========================================================================

describe("TC-008: DynamicContext に priorRoundContext optional field が追加され typecheck が green", () => {
  it("TC-008: DynamicContext type accepts priorRoundContext as an optional field", () => {
    // This test verifies the type shape at runtime by constructing a DynamicContext
    // with priorRoundContext. If the field is missing from the interface, TypeScript
    // would error at compile time (making this test fail to compile = RED).
    const ctx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      // This assignment will fail TypeScript compilation until T-01 adds the field:
      priorRoundContext: {
        findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "Test" }],
        changedFiles: ["spec.md"],
      },
    };
    // priorRoundContext must be present in the constructed context
    expect(ctx.priorRoundContext).toBeDefined();
    expect(ctx.priorRoundContext!.findings).toHaveLength(1);
    expect(ctx.priorRoundContext!.changedFiles).toEqual(["spec.md"]);
  });

  it("TC-008: DynamicContext without priorRoundContext is still valid (field is optional)", () => {
    const ctx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      // priorRoundContext omitted — must be optional
    };
    expect(ctx.priorRoundContext).toBeUndefined();
  });

  it("TC-008: priorRoundContext field has correct shape (findings array + changedFiles string array)", () => {
    const ctx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      priorRoundContext: {
        findings: [
          { severity: "medium", resolution: "fixable", file: "spec.md", title: "A finding" },
          { severity: "low", resolution: "fixable", file: "design.md", title: "Another finding" },
        ],
        changedFiles: ["spec.md", "design.md"],
      },
    };
    expect(ctx.priorRoundContext!.findings).toHaveLength(2);
    expect(ctx.priorRoundContext!.findings[0]).toMatchObject({
      severity: "medium",
      resolution: "fixable",
      file: "spec.md",
      title: "A finding",
    });
    expect(ctx.priorRoundContext!.changedFiles).toEqual(["spec.md", "design.md"]);
  });
});

// ===========================================================================
// TC-009 (should): collectDynamicContext は priorRoundContext を設定しない
// ===========================================================================

describe("TC-009 (should): collectDynamicContext は priorRoundContext を設定しない", () => {
  it("TC-009: collectDynamicContext result does not include priorRoundContext", async () => {
    // collectDynamicContext is the existing function that builds base DynamicContext.
    // It must NOT set priorRoundContext (that's done by prepareRoundContext / buildStepContext).
    // We use a non-existent cwd to get empty fallback values.
    const ctx = await collectDynamicContext("/tmp/__nonexistent_cwd__", "main");
    expect(ctx.priorRoundContext).toBeUndefined();

    // Also verify the existing fields are present (regression guard)
    expect(ctx).toHaveProperty("gitLog");
    expect(ctx).toHaveProperty("diffStat");
    expect(ctx).toHaveProperty("changesList");
  });
});

// ===========================================================================
// TC-020: SpecReviewStep.prepareRoundContext — iteration ≥ 2 + mock あり → priorRoundContext を含む Partial を返す
// ===========================================================================

describe("TC-020: SpecReviewStep.prepareRoundContext — iteration ≥ 2 + mock あり → priorRoundContext を含む Partial を返す", () => {
  it("TC-020: prepareRoundContext is a method on SpecReviewStep", () => {
    // This will be undefined until T-03 adds the method (RED phase)
    expect(typeof SpecReviewStepRecord["prepareRoundContext"]).toBe("function");
  });

  it("TC-020: prepareRoundContext returns { priorRoundContext: { findings, changedFiles } } for iteration ≥ 2", async () => {
    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    // Will fail until T-03 implements prepareRoundContext on SpecReviewStep
    expect(prepareRoundContext).toBeDefined();

    const changedFiles = ["specrunner/changes/test-slug/spec.md", "specrunner/changes/test-slug/design.md"];
    const state = makeIteration2State({
      specFixerCommitOid: "oid1",
    });
    const fakeStrategy = makeFakeRuntimeStrategy({ files: changedFiles });

    const result = await prepareRoundContext!(state, "/tmp/worktree", fakeStrategy);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("priorRoundContext");
    expect(result!["priorRoundContext"]).toHaveProperty("findings");
    expect(result!["priorRoundContext"]).toHaveProperty("changedFiles");
    expect((result!["priorRoundContext"] as { changedFiles: string[] }).changedFiles).toEqual(changedFiles);
  });
});

// ===========================================================================
// TC-021: SpecReviewStep.prepareRoundContext — iteration 1 → null を返す
// ===========================================================================

describe("TC-021: SpecReviewStep.prepareRoundContext — iteration 1 → null を返す", () => {
  it("TC-021: prepareRoundContext returns null for iteration 1 (no prior round)", async () => {
    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    // State with no spec-review runs → iteration = 1
    const state = makeBaseState();
    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["spec.md"] });

    const result = await prepareRoundContext!(state, "/tmp/worktree", fakeStrategy);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// TC-022: buildStepContext — prepareRoundContext が返す partial が input.dynamicContext にマージされる
// ===========================================================================

describe("TC-022: buildStepContext — prepareRoundContext が返す partial が input.dynamicContext にマージされる", () => {
  it("TC-022: prepareRoundContext partial is merged into ctx.input.dynamicContext", async () => {
    // Fake step that implements prepareRoundContext returning priorRoundContext
    const fakeStep: AgentStep = {
      kind: "agent",
      name: STEP_NAMES.SPEC_REVIEW,
      agent: {
        name: "specrunner-spec-review",
        role: STEP_NAMES.SPEC_REVIEW,
        model: "claude-sonnet-4-6",
        system: "review",
        tools: [],
      },
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      // prepareRoundContext returns a partial with priorRoundContext
      prepareRoundContext: async (_state: JobState, _cwd: string, _rs: unknown) => ({
        priorRoundContext: {
          findings: [],
          changedFiles: ["x.ts"],
        },
      }),
    } as unknown as AgentStep;

    const baseDynamicContext = makeDynamicContext();
    const state = makeBaseState();
    const deps = makeDeps({ dynamicContext: baseDynamicContext });

    const ctx = await buildStepContext(fakeStep, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    // TC-022: priorRoundContext must be in dynamicContext (RED until T-04 implements the hook call)
    expect(ctx.input.dynamicContext).toBeDefined();
    expect((ctx.input.dynamicContext as DynamicContext & { priorRoundContext?: unknown }).priorRoundContext).toBeDefined();
    expect(
      (ctx.input.dynamicContext as DynamicContext & { priorRoundContext?: { changedFiles: string[] } }).priorRoundContext?.changedFiles,
    ).toEqual(["x.ts"]);

    // Existing dynamicContext fields must still be present (no overwrite)
    expect(ctx.input.dynamicContext!.gitLog).toBe(baseDynamicContext.gitLog);
    expect(ctx.input.dynamicContext!.changesList).toEqual(baseDynamicContext.changesList);
  });
});

// ===========================================================================
// TC-023: buildStepContext — prepareRoundContext を持たない step では dynamicContext が無改変
// ===========================================================================

describe("TC-023: buildStepContext — prepareRoundContext を持たない step では dynamicContext が無改変", () => {
  it("TC-023: dynamicContext is unchanged when step has no prepareRoundContext method", async () => {
    const fakeStep: AgentStep = {
      kind: "agent",
      name: STEP_NAMES.SPEC_FIXER,  // spec-fixer has no prepareRoundContext
      agent: {
        name: "specrunner-spec-fixer",
        role: STEP_NAMES.SPEC_FIXER,
        model: "claude-sonnet-4-6",
        system: "fix",
        tools: [],
      },
      buildMessage: () => "fix",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      // No prepareRoundContext method
    } as unknown as AgentStep;

    const baseDynamicContext = makeDynamicContext();
    const state = makeBaseState();
    const deps = makeDeps({ dynamicContext: baseDynamicContext });

    const ctx = await buildStepContext(fakeStep, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);

    // dynamicContext must NOT have priorRoundContext (step doesn't set it)
    expect(ctx.input.dynamicContext).toEqual(baseDynamicContext);
    expect((ctx.input.dynamicContext as DynamicContext & { priorRoundContext?: unknown }).priorRoundContext).toBeUndefined();
  });
});

// ===========================================================================
// TC-024: buildStepContext — prepareRoundContext が reject しても例外を投げず dynamicContext は enrich 前のまま
// ===========================================================================

describe("TC-024: buildStepContext — prepareRoundContext が reject しても例外を投げず dynamicContext は enrich 前のまま", () => {
  it("TC-024: buildStepContext does not throw when prepareRoundContext rejects, dynamicContext unchanged", async () => {
    const fakeStep: AgentStep = {
      kind: "agent",
      name: STEP_NAMES.SPEC_REVIEW,
      agent: {
        name: "specrunner-spec-review",
        role: STEP_NAMES.SPEC_REVIEW,
        model: "claude-sonnet-4-6",
        system: "review",
        tools: [],
      },
      buildMessage: () => "review",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      // prepareRoundContext always rejects
      prepareRoundContext: async () => {
        throw new Error("prepareRoundContext failed");
      },
    } as unknown as AgentStep;

    const baseDynamicContext = makeDynamicContext();
    const state = makeBaseState();
    const deps = makeDeps({ dynamicContext: baseDynamicContext });

    // TC-024: Must not throw (best-effort degrade)
    let threw = false;
    let ctx: Awaited<ReturnType<typeof buildStepContext>> | undefined;
    try {
      ctx = await buildStepContext(fakeStep, state, deps, "/tmp/test-worktree", stubEmitFn, stubFsAdapter);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(ctx).toBeDefined();
    // dynamicContext must be unchanged (enrich was skipped due to rejection)
    expect(ctx!.input.dynamicContext).toEqual(baseDynamicContext);
    expect((ctx!.input.dynamicContext as DynamicContext & { priorRoundContext?: unknown }).priorRoundContext).toBeUndefined();
  });
});

// ===========================================================================
// TC-025: SpecReviewStep.buildMessage — priorRoundContext あり → message に findings・changedFiles・プロトコル文言が含まれる
// ===========================================================================

describe("TC-025: SpecReviewStep.buildMessage — priorRoundContext あり → message に findings・changedFiles・プロトコル文言が含まれる", () => {
  it("TC-025: message contains prior finding severity/resolution/file/title, changedFiles paths, and re-check protocol text", () => {
    const state = makeIteration2State({
      specFixerCommitOid: "oid1",
    });
    const deps = makeDeps({
      dynamicContext: makeDynamicContext({
        // priorRoundContext is injected by prepareRoundContext → buildStepContext;
        // here we simulate the result being in dynamicContext for buildMessage testing
        priorRoundContext: {
          findings: [
            { severity: "high", resolution: "fixable", file: "specrunner/changes/test-slug/spec.md", title: "X" },
          ],
          changedFiles: ["specrunner/changes/test-slug/spec.md"],
        },
      }),
    });

    // buildMessage is a pure function — RED until T-05 wires buildPriorRoundContextBlock
    const message = SpecReviewStep.buildMessage(state, deps);

    // TC-025: message must contain finding details
    expect(message).toContain("high");
    expect(message).toContain("specrunner/changes/test-slug/spec.md");
    expect(message).toContain("X");

    // TC-025: message must contain changedFiles paths
    expect(message).toContain("specrunner/changes/test-slug/spec.md");

    // TC-025: message must contain re-check protocol text
    // (1) current file content read-before-re-report instruction
    // (2) insufficient reason must be stated in rationale
    // (3) full enumeration maintained
    const hasReadInstruction =
      message.includes("読み直") ||
      message.includes("re-read") ||
      message.includes("Read tool") ||
      message.includes("現在のファイル内容");
    expect(hasReadInstruction).toBe(true);

    const hasRationaleInstruction =
      message.includes("不十分") ||
      message.includes("rationale") ||
      message.includes("なぜ") ||
      message.includes("insufficient");
    expect(hasRationaleInstruction).toBe(true);

    const hasFullEnumerationText =
      message.includes("全量列挙") ||
      message.includes("全量") ||
      message.includes("全量の列挙") ||
      message.includes("full enumeration") ||
      message.includes("enumerate all");
    expect(hasFullEnumerationText).toBe(true);
  });
});

// ===========================================================================
// TC-026: SpecReviewStep.buildMessage — priorRoundContext absent → message に注入ブロックが含まれない
// ===========================================================================

describe("TC-026: SpecReviewStep.buildMessage — priorRoundContext absent → message に注入ブロックが含まれない", () => {
  it("TC-026: message does not contain <prior-round-context> when dynamicContext has no priorRoundContext", () => {
    const state = makeBaseState(); // iteration 1 — no prior spec-review runs
    const deps = makeDeps({
      dynamicContext: makeDynamicContext(), // no priorRoundContext field
    });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("<prior-round-context>");
    expect(message).not.toContain("</prior-round-context>");
  });

  it("TC-026: message does not contain injection block when dynamicContext is undefined", () => {
    const state = makeBaseState();
    const deps = makeDeps({ dynamicContext: undefined });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("<prior-round-context>");
    expect(message).not.toContain("</prior-round-context>");
  });
});

// ===========================================================================
// TC-027: {{PRIOR_ROUND_CONTEXT}} placeholder が message に literal で残らない
// ===========================================================================

describe("TC-027: {{PRIOR_ROUND_CONTEXT}} placeholder が message に literal で残らない", () => {
  it("TC-027: {{PRIOR_ROUND_CONTEXT}} literal is not present in message with priorRoundContext set", () => {
    const state = makeIteration2State({ specFixerCommitOid: "oid1" });
    const deps = makeDeps({
      dynamicContext: makeDynamicContext({
        priorRoundContext: {
          findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "T" }],
          changedFiles: ["spec.md"],
        },
      }),
    });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("{{PRIOR_ROUND_CONTEXT}}");
  });

  it("TC-027: {{PRIOR_ROUND_CONTEXT}} literal is not present in message without priorRoundContext", () => {
    const state = makeBaseState();
    const deps = makeDeps({ dynamicContext: makeDynamicContext() });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("{{PRIOR_ROUND_CONTEXT}}");
  });
});

// ===========================================================================
// TC-006: 注入ブロックに再指摘プロトコル文言と全量列挙維持が含まれ、免除文言は含まれない
// ===========================================================================

describe("TC-006: 注入ブロックに再指摘プロトコル文言と全量列挙維持が含まれ、免除文言は含まれない", () => {
  it("TC-006: injection block contains read-before-re-report, rationale, full-enumeration texts; does NOT contain exemption texts", () => {
    const state = makeIteration2State({ specFixerCommitOid: "oid1" });
    const deps = makeDeps({
      dynamicContext: makeDynamicContext({
        priorRoundContext: {
          findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "Test" }],
          changedFiles: ["spec.md"],
        },
      }),
    });

    const message = SpecReviewStep.buildMessage(state, deps);

    // Must contain prior-round-context block
    expect(message).toContain("<prior-round-context>");

    // TC-006: re-check protocol: current file must be read before re-reporting
    const hasReadInstruction =
      message.includes("読み直") ||
      message.includes("Read tool") ||
      message.includes("現在のファイル内容") ||
      message.includes("re-read") ||
      message.includes("read the current");
    expect(hasReadInstruction).toBe(true);

    // TC-006: re-check protocol: must state why fix is insufficient in rationale
    const hasRationaleInstruction =
      message.includes("不十分") ||
      message.includes("rationale") ||
      message.includes("なぜ") ||
      message.includes("insufficient") ||
      message.includes("why");
    expect(hasRationaleInstruction).toBe(true);

    // TC-006: full enumeration maintenance
    const hasFullEnumeration =
      message.includes("全量列挙") ||
      message.includes("全量") ||
      message.includes("full enumeration") ||
      message.includes("enumerate all") ||
      message.includes("すべての");
    expect(hasFullEnumeration).toBe(true);

    // TC-006: MUST NOT contain exemption language that weakens full enumeration
    // e.g., "前回 approve 済みの観点は省略してよい" or "skip approved" or "omit approved"
    const hasExemptionText =
      message.includes("省略してよい") ||
      message.includes("skip approved") ||
      message.includes("omit approved") ||
      message.includes("approved を省略") ||
      message.includes("省略可");
    expect(hasExemptionText).toBe(false);
  });
});

// ===========================================================================
// TC-001: iteration ≥ 2 で前周 findings と fixer 変更 file が message に含まれる
// ===========================================================================

describe("TC-001: iteration ≥ 2 で前周 findings と fixer 変更 file が message に含まれる", () => {
  it("TC-001: message at iteration ≥ 2 contains prior findings (severity/resolution/file/title) and changed files", () => {
    // This test verifies the full injection path: priorRoundContext in dynamicContext
    // → buildMessage includes the content via prior-round-context block.
    // The priorRoundContext is set as if prepareRoundContext + buildStepContext already ran.
    const state = makeIteration2State({
      specFixerCommitOid: "oid1",
      priorFindings: [
        { severity: "high", resolution: "fixable", file: SPEC_MD, title: "Missing req", rationale: "test" },
        { severity: "medium", resolution: "fixable", file: `specrunner/changes/${TEST_SLUG}/design.md`, title: "Design gap", rationale: "test" },
      ],
    });
    const changedFiles = [SPEC_MD, `specrunner/changes/${TEST_SLUG}/design.md`];
    const deps = makeDeps({
      dynamicContext: makeDynamicContext({
        priorRoundContext: {
          findings: [
            { severity: "high", resolution: "fixable", file: SPEC_MD, title: "Missing req" },
            { severity: "medium", resolution: "fixable", file: `specrunner/changes/${TEST_SLUG}/design.md`, title: "Design gap" },
          ],
          changedFiles,
        },
      }),
    });

    const message = SpecReviewStep.buildMessage(state, deps);

    // Must include prior findings
    expect(message).toContain("Missing req");
    expect(message).toContain("Design gap");
    expect(message).toContain("high");
    expect(message).toContain("medium");

    // Must include changed files
    expect(message).toContain(SPEC_MD);
    expect(message).toContain(`specrunner/changes/${TEST_SLUG}/design.md`);
  });
});

// ===========================================================================
// TC-002: fixer 変更 file の導出は listCommitChangedFiles mock 経由のみで構成される
// ===========================================================================

describe("TC-002: fixer 変更 file の導出は listCommitChangedFiles mock 経由のみで構成される", () => {
  it("TC-002: changedFiles in priorRoundContext match exactly what listCommitChangedFiles mock returns", async () => {
    // The test verifies that derivePriorRoundContext uses listCommitChangedFiles as the
    // SOLE source for changedFiles — no self-reported data from the fixer agent.
    //
    // We test this by making the mock return specific sentinel values and verifying
    // those exact values appear in the result.
    const sentinelFiles = ["__SENTINEL_A__.ts", "__SENTINEL_B__.ts"];

    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    // Will fail until T-03 implements prepareRoundContext
    expect(prepareRoundContext).toBeDefined();

    const state = makeIteration2State({ specFixerCommitOid: "oid-sentinel" });
    const fakeStrategy = makeFakeRuntimeStrategy({ files: sentinelFiles });

    const result = await prepareRoundContext!(state, "/tmp/worktree", fakeStrategy);
    expect(result).not.toBeNull();

    const priorCtx = (result as Partial<DynamicContext>).priorRoundContext;
    expect(priorCtx).toBeDefined();
    // changedFiles must exactly match the mock return — not any other source
    expect(priorCtx!.changedFiles).toEqual(sentinelFiles);
  });
});

// ===========================================================================
// TC-003: 初回 spec-review（iteration 1）に注入ブロックが含まれない
// ===========================================================================

describe("TC-003: 初回 spec-review（iteration 1）に注入ブロックが含まれない", () => {
  it("TC-003: message at iteration 1 does not contain prior-round-context block", () => {
    // At iteration 1, dynamicContext has no priorRoundContext (prepareRoundContext returns null)
    const state = makeBaseState(); // no spec-review runs → iteration = 1
    const deps = makeDeps({
      dynamicContext: makeDynamicContext(), // no priorRoundContext
    });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("<prior-round-context>");
    expect(message).not.toContain("</prior-round-context>");
  });

  it("TC-003: prepareRoundContext returns null for iteration 1 state (no prior spec-review run)", async () => {
    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    const state = makeBaseState();
    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["spec.md"] });

    const result = await prepareRoundContext!(state, "/tmp/worktree", fakeStrategy);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// TC-004: 前周 fixer の commitOid が未記録の場合、注入を省略して step を正常続行する
// ===========================================================================

describe("TC-004: 前周 fixer の commitOid が未記録の場合、注入を省略して step を正常続行する", () => {
  it("TC-004: prepareRoundContext returns null when prior spec-fixer has no commitOid", async () => {
    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    // State where spec-fixer ran but has no commitOid recorded
    const state = makeIteration2State({
      // No specFixerCommitOid → spec-fixer runs with no commitOid
    });
    // Add a spec-fixer run without commitOid
    const stateWithFixerNoOid: JobState = {
      ...state,
      steps: {
        ...state.steps,
        [STEP_NAMES.SPEC_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: NOW,
            endedAt: NOW,
            // No commitOid
          },
        ],
      },
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["spec.md"] });

    let threw = false;
    let result: Partial<DynamicContext> | null | undefined;
    try {
      result = await prepareRoundContext!(stateWithFixerNoOid, "/tmp/worktree", fakeStrategy);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-004: buildMessage does not include injection block when commitOid is missing → priorRoundContext absent", () => {
    // When prepareRoundContext returns null (no commitOid), dynamicContext gets no priorRoundContext.
    // Therefore buildMessage produces no injection block.
    const state = makeBaseState();
    const deps = makeDeps({
      dynamicContext: makeDynamicContext(), // no priorRoundContext (injection was skipped)
    });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("<prior-round-context>");
    expect(message).not.toContain("</prior-round-context>");
  });
});

// ===========================================================================
// TC-005: listCommitChangedFiles が unavailable を返す場合、注入を省略して step を正常続行する
// ===========================================================================

describe("TC-005: listCommitChangedFiles が unavailable を返す場合、注入を省略して step を正常続行する", () => {
  it("TC-005: prepareRoundContext returns null when listCommitChangedFiles returns unavailable", async () => {
    const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
      state: JobState,
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    const state = makeIteration2State({ specFixerCommitOid: "oid1" });
    const unavailableStrategy = makeFakeRuntimeStrategy({ kind: "unavailable" });

    let threw = false;
    let result: Partial<DynamicContext> | null | undefined;
    try {
      result = await prepareRoundContext!(state, "/tmp/worktree", unavailableStrategy);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-005: no injection block in message when listCommitChangedFiles was unavailable (priorRoundContext absent)", () => {
    const state = makeBaseState();
    const deps = makeDeps({
      dynamicContext: makeDynamicContext(), // no priorRoundContext (skipped due to unavailable)
    });

    const message = SpecReviewStep.buildMessage(state, deps);
    expect(message).not.toContain("<prior-round-context>");
    expect(message).not.toContain("</prior-round-context>");
  });
});

// ===========================================================================
// TC-007: 注入は state（stepRuns / journal）に永続化されず後続 step に伝播しない
// ===========================================================================

describe("TC-007: 注入は state（stepRuns / journal）に永続化されず後続 step に伝播しない", () => {
  it("TC-007: priorRoundContext is not serialized to state (DynamicContext is in-memory only)", () => {
    // DynamicContext is NOT part of JobState — it's an ephemeral in-memory object
    // computed at runtime. This test verifies the schema separation:
    // - JobState (state/schema) does NOT have a priorRoundContext field
    // - DynamicContext (git/dynamic-context) has it as an optional field
    // - The field is one-shot: it lives only in the current buildStepContext call context

    // Verify JobState schema does NOT have a priorRoundContext field
    const state = makeBaseState();
    expect((state as unknown as Record<string, unknown>)["priorRoundContext"]).toBeUndefined();

    // The priorRoundContext only exists in DynamicContext (in-memory, per-round)
    // (This object literal will cause a TypeScript type error until T-01 adds priorRoundContext to DynamicContext)
    const ctx = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      priorRoundContext: {
        findings: [] as Array<{ severity: string; resolution: string; file: string; title: string }>,
        changedFiles: [] as string[],
      },
    } as unknown as DynamicContext;
    // It's in DynamicContext but NOT in state
    expect((ctx as unknown as Record<string, unknown>)["priorRoundContext"]).toBeDefined();
    expect((state as unknown as Record<string, unknown>)["priorRoundContext"]).toBeUndefined();
  });

  it("TC-007: DynamicContext is not part of StepRun or StepOutcome (not persisted to events/journal)", () => {
    // Verify by checking the state fixture has no DynamicContext-like field after step runs
    const state = makeIteration2State({ specFixerCommitOid: "oid1" });

    // After spec-review runs, state.steps has StepRun records — but no priorRoundContext
    const specReviewRuns = state.steps?.[STEP_NAMES.SPEC_REVIEW];
    expect(specReviewRuns).toBeDefined();
    expect(specReviewRuns!.length).toBeGreaterThan(0);

    const lastRun = specReviewRuns![specReviewRuns!.length - 1];
    // StepRun.outcome has toolResult but NOT priorRoundContext
    expect((lastRun as unknown as Record<string, unknown>)["priorRoundContext"]).toBeUndefined();
    expect((lastRun!.outcome as unknown as Record<string, unknown>)["priorRoundContext"]).toBeUndefined();
  });

  it("TC-007: buildMessage output (message string) has no side effects on state", () => {
    // buildMessage is pure — calling it must not modify state
    const state = makeIteration2State({ specFixerCommitOid: "oid1" });
    const deps = makeDeps({
      dynamicContext: makeDynamicContext({
        priorRoundContext: {
          findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "T" }],
          changedFiles: ["spec.md"],
        },
      }),
    });

    const stepsBeforeCall = JSON.stringify(state.steps);
    SpecReviewStep.buildMessage(state, deps);
    const stepsAfterCall = JSON.stringify(state.steps);

    // State must be unchanged after buildMessage
    expect(stepsAfterCall).toBe(stepsBeforeCall);
  });
});

// ===========================================================================
// TC-028: 既存テスト（spec-review prompt / routing / finding-recency / step-context-builder）が無改変で green
// ===========================================================================

describe("TC-028: 既存の public API が無改変で存在する（回帰チェック）", () => {
  it("TC-028: SpecReviewStep has existing methods unchanged", () => {
    // Regression guard: existing SpecReviewStep properties must still exist
    expect(SpecReviewStep.kind).toBe("agent");
    expect(SpecReviewStep.name).toBe(STEP_NAMES.SPEC_REVIEW);
    expect(typeof SpecReviewStep.buildMessage).toBe("function");
    expect(typeof SpecReviewStep.resultFilePath).toBe("function");
    expect(typeof SpecReviewStep.parseResult).toBe("function");
    expect(typeof SpecReviewStep.reads).toBe("function");
    expect(typeof SpecReviewStep.writes).toBe("function");
  });

  it("TC-028: buildSpecReviewInitialMessage from spec-review-system.ts still exists and works without priorRoundContextBlock", async () => {
    const { buildSpecReviewInitialMessage } = await import("../../../prompts/spec-review-system.js");
    const msg = buildSpecReviewInitialMessage({
      slug: "test-slug",
      requestType: "spec-change",
      requestContent: "test content",
      iteration: 1,
    });
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    // Placeholder must not appear in the output
    expect(msg).not.toContain("{{SLUG}}");
    expect(msg).not.toContain("{{REQUEST_TYPE}}");
    expect(msg).not.toContain("{{REQUEST_CONTENT}}");
    expect(msg).not.toContain("{{FINDINGS_PATH}}");
  });

  it("TC-028: DynamicContext interface is backward-compatible (existing fields still exist)", () => {
    // Existing DynamicContext fields must still be assignable — no breaking changes
    const ctx: DynamicContext = {
      gitLog: "abc",
      diffStat: "stat",
      changesList: ["slug-a"],
      verificationContent: "build passed",
      requestContentHash: "sha256:abc",
      sourceRevision: "deadbeef",
      factCheckAttestation: { status: "valid", verifiedAssertions: ["assertion1"] },
    };
    expect(ctx.gitLog).toBe("abc");
    expect(ctx.verificationContent).toBe("build passed");
    expect(ctx.factCheckAttestation?.status).toBe("valid");
  });
});

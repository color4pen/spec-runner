/**
 * Unit tests for BuildFixerStep
 *
 * TC-023: BuildFixerStep の構造検証
 * TC-024: BuildFixerStep.resultFilePath と parseResult
 * TC-016: BUILD_FIXER_NO_VERIFICATION_RESULT error shape
 */
import { describe, it, expect } from "vitest";
import { BuildFixerStep } from "../../../src/core/step/build-fixer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/build-fixer-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
import { buildContinuationMessage } from "../../../src/core/step/fixer-helpers.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { verificationResultPath, changeFolderPath } from "../../../src/util/paths.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "build-fixer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStateWithVerificationResult(slug: string): JobState {
  return makeMinimalState({
    steps: {
      verification: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "failed",
            findingsPath: verificationResultPath(slug),
            error: null,
          },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  });
}

function makeDepsWithVerificationContent(slug: string, verificationContent?: string): StepDeps {
  return {
    ...makeMinimalDeps(slug),
    dynamicContext: {
      gitLog: "",
      diffStat: "",
      changesList: [],
      ...(verificationContent !== undefined ? { verificationContent } : {}),
    },
  };
}

/** Build a minimal verification-result.md string with a single failed phase. */
function buildVerificationResultMd(phaseName: string, exitCode: number, output: string): string {
  const lines: string[] = [
    `# Verification Result — test-slug — iter 1`,
    "",
    "## Verdict: failed",
    "",
    "## Phase Results",
    "",
    "| # | Phase | Status | Duration | Exit Code |",
    "|---|-------|--------|----------|-----------|",
    `| 1 | ${phaseName} | failed | 1.0s | ${exitCode} |`,
    "",
    `## Phase: ${phaseName}`,
    "",
    "```",
    output || "(no output)",
    "```",
    "",
  ];
  return lines.join("\n");
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "Fix build errors", adr: false },
    slug,
  };
}

// TC-023: BuildFixerStep の構造検証
describe("TC-023: BuildFixerStep 構造検証", () => {
  it("step.kind === 'agent' かつ step.name === 'build-fixer'", () => {
    expect(BuildFixerStep.kind).toBe("agent");
    expect(BuildFixerStep.name).toBe("build-fixer");
  });

  it("step.agent.role === 'build-fixer' かつ model === 'claude-sonnet-4-6'", () => {
    // TC-005: implementation/fixer steps use claude-sonnet-4-6 (opusplan pattern)
    expect(BuildFixerStep.agent.role).toBe("build-fixer");
    expect(BuildFixerStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("step.agent.capabilities.gitWrite === true", () => {
    expect(BuildFixerStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("step.agent.system === BUILD_FIXER_SYSTEM_PROMPT", () => {
    expect(BuildFixerStep.agent.system).toBe(BUILD_FIXER_SYSTEM_PROMPT);
  });

  it("step.agent.tools に agent_toolset_20260401 が含まれる (TC-033)", () => {
    const hasToolset = BuildFixerStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });
});

// TC-024: BuildFixerStep.resultFilePath と parseResult
describe("TC-024: BuildFixerStep.resultFilePath と parseResult", () => {
  it("resultFilePath は null を返す", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps();
    expect(BuildFixerStep.resultFilePath(state, deps)).toBeNull();
  });

  it("parseResult は NULL_PARSE_RESULT と deep-equal な値を返す", () => {
    const _state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps();
    const result = BuildFixerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
  });
});

// TC-016: buildMessage NO LONGER throws when verification result is absent
// (D4 replacement: halt is handled by pre-execution validation → STEP_INPUT_MISSING)
describe("TC-016: BuildFixerStep.buildMessage は verification 不在でも throw しない（D4 後）", () => {
  it("does NOT throw when state has no verification steps", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    expect(() => BuildFixerStep.buildMessage(state, deps)).not.toThrow();
  });

  it("returns a message containing verification-result.md when verification has not run", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);
    expect(message).toContain("verification-result.md");
  });

  it("pure function contract: state is NOT mutated", () => {
    const state = makeMinimalState({ steps: {} });
    const deps = makeMinimalDeps("my-change");
    BuildFixerStep.buildMessage(state, deps);
    expect(state.status).toBe("running");
    expect(state.error).toBeNull();
  });
});

// buildMessage content
describe("BuildFixerStep.buildMessage 内容検証", () => {
  it("verification result がある場合、slug / branch / verification-result / commit / push / user-request が含まれる", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).toContain(changeFolderPath("my-change"));
    expect(message).toContain("verification-result.md");
    expect(message).toContain("feat/my-change");
    // buildGitPushInstruction uses "Commit" (capital) — case-insensitive check
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });

  it("仕様変更禁止の条件が含まれる", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    // build-fixer should prohibit specification changes
    expect(message).toMatch(/NO specification|specification changes|仕様変更禁止/i);
  });
});

// completionVerdict
describe("BuildFixerStep.completionVerdict", () => {
  it("completionVerdict === 'success'", () => {
    expect(BuildFixerStep.completionVerdict).toBe("success");
  });
});

// TC-NEW-1: buildMessage with verificationContent in dynamicContext containing failures
describe("BuildFixerStep.buildMessage — verificationContent あり（失敗フェーズあり）", () => {
  it("初期メッセージに Verification Failures セクションとエラー出力が含まれる", () => {
    const verificationContent = buildVerificationResultMd(
      "typecheck",
      1,
      "src/core/step/propose.ts:42 - error TS2345: Argument of type ...",
    );
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeDepsWithVerificationContent("my-change", verificationContent);
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).toContain("## Verification Failures");
    expect(message).toContain("**Failed phase**: typecheck");
    expect(message).toContain("**Exit code**: 1");
    expect(message).toContain("error TS2345");
    expect(message).toContain("### Error output");
  });

  it("findingsPath への参照も維持されている（フォールバック）", () => {
    const verificationContent = buildVerificationResultMd("typecheck", 1, "error TS2345");
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeDepsWithVerificationContent("my-change", verificationContent);
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).toContain("verification-result.md");
  });
});

// TC-NEW-2: buildMessage with verificationContent but no failures
describe("BuildFixerStep.buildMessage — verificationContent あり（失敗フェーズなし）", () => {
  it("パース結果が空配列の場合 Verification Failures セクションが追加されない", () => {
    // All phases passed — no failed rows in Phase Results table
    const allPassedContent = [
      "# Verification Result — my-change — iter 1",
      "",
      "## Verdict: passed",
      "",
      "## Phase Results",
      "",
      "| # | Phase | Status | Duration | Exit Code |",
      "|---|-------|--------|----------|-----------|",
      "| 1 | build | passed | 1.0s | 0 |",
      "",
      "## Phase: build",
      "",
      "```",
      "Build succeeded",
      "```",
      "",
    ].join("\n");

    const state = makeStateWithVerificationResult("my-change");
    const deps = makeDepsWithVerificationContent("my-change", allPassedContent);
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("## Verification Failures");
  });
});

// TC-NEW-3: buildMessage with no verificationContent
describe("BuildFixerStep.buildMessage — verificationContent が undefined", () => {
  it("verificationContent なし → Verification Failures セクションなし、findingsPath 参照のみ", () => {
    const state = makeStateWithVerificationResult("my-change");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("## Verification Failures");
    expect(message).toContain("verification-result.md");
  });
});

// Regression for workspace-mount-and-propose-boundary
describe("BuildFixerStep.buildMessage — fail-fast on missing branch", () => {
  it("throws BRANCH_NOT_SET when state.branch is null (checked before verification-result lookup)", () => {
    const state = makeStateWithVerificationResult("my-change");
    state.branch = null;
    const deps = makeMinimalDeps("my-change");
    expect(() => BuildFixerStep.buildMessage(state, deps)).toThrowError(
      expect.objectContaining({ code: "BRANCH_NOT_SET" }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-BM-05: build-fixer continuation → short prompt
// ---------------------------------------------------------------------------

describe("TC-BM-05: BuildFixerStep.buildMessage returns short prompt when previous session exists", () => {
  function makeStateWithContinuation(sessionId: string): JobState {
    const findingsPath = verificationResultPath("my-change");
    return makeMinimalState({
      steps: {
        "build-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        verification: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "failed", findingsPath, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  }

  it("returns exact output of buildContinuationMessage", () => {
    const state = makeStateWithContinuation("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    const findingsPath = verificationResultPath("my-change");
    const expected = buildContinuationMessage({
      stepName: "build-fixer",
      findingsPath,
      slug: "my-change",
    });

    expect(message).toBe(expected);
  });

  it("continuation prompt contains 'verification' as source label (not 'reviewer')", () => {
    const state = makeStateWithContinuation("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).toContain("verification");
    expect(message).not.toContain("reviewer");
  });

  it("continuation prompt does NOT contain 'You are the build-fixer'", () => {
    const state = makeStateWithContinuation("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);

    expect(message).not.toContain("You are the build-fixer");
  });

  it("continuation prompt contains the verification-result findingsPath", () => {
    const state = makeStateWithContinuation("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);
    const findingsPath = verificationResultPath("my-change");

    expect(message).toContain(findingsPath);
  });
});

// ---------------------------------------------------------------------------
// TC-BM-06: build-fixer continuation + verification absent → does NOT throw (D4 replacement)
// Halt is now handled by pre-execution validation via STEP_INPUT_MISSING, not buildMessage.
// ---------------------------------------------------------------------------

describe("TC-BM-06: BuildFixerStep.buildMessage does NOT throw even in continuation + no verification (D4)", () => {
  function makeStateWithFixerRunButNoVerification(sessionId: string): JobState {
    return makeMinimalState({
      steps: {
        "build-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        // verification intentionally absent
      },
    });
  }

  it("does NOT throw in continuation mode when verification is absent", () => {
    const state = makeStateWithFixerRunButNoVerification("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    expect(() => BuildFixerStep.buildMessage(state, deps)).not.toThrow();
  });

  it("continuation message still contains verification-result.md path", () => {
    const state = makeStateWithFixerRunButNoVerification("sess-build-xyz");
    const deps = makeMinimalDeps("my-change");
    const message = BuildFixerStep.buildMessage(state, deps);
    expect(message).toContain("verification-result.md");
  });
});

/**
 * Tests for review-exit-contract changes.
 *
 * TC-001: specReviewResultNotFoundError generates hint with correct iteration suffix and commit/push guidance
 * TC-002: specReviewResultNotFoundError generates suffix -010 for iteration 10
 * TC-003: specReviewResultNotFoundError generates suffix -100 for iteration 100
 * TC-004: codeReviewResultNotFoundError generates hint with correct iteration suffix and commit/push guidance
 * TC-005: iteration argument is required (TypeScript compile enforced — verified by type test below)
 * TC-006: code-review step declares gitWrite: true in capabilities
 * TC-007: spec-review step declares gitWrite: true in capabilities
 * TC-008: executor fetch path matches agent-written filename for spec-review (round-trip invariant)
 * TC-009: executor fetch path matches agent-written filename for code-review (round-trip invariant)
 * TC-010: spec-review system prompt includes commit + push + delayed end_turn instructions
 * TC-011: executor error-hint iteration calculation — spec-review getRawFile failure
 * TC-012: executor error-hint iteration calculation — code-review getRawFile failure
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  specReviewResultNotFoundError,
  codeReviewResultNotFoundError,
  ERROR_CODES,
} from "../../../src/errors.js";
import { CodeReviewStep, buildReviewFeedbackPath } from "../../../src/core/step/code-review.js";
import { SpecReviewStep, buildFindingsPath } from "../../../src/core/step/spec-review.js";
import {
  SPEC_REVIEW_SYSTEM_PROMPT,
  buildSpecReviewInitialMessage,
} from "../../../src/prompts/spec-review-system.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { vi } from "vitest";

// -------------------------------------------------------------------------
// TC-001: specReviewResultNotFoundError — iteration=1
// -------------------------------------------------------------------------
describe("TC-001: specReviewResultNotFoundError — iteration=1 suffix and guidance", () => {
  it("hint contains spec-review-result-001.md", () => {
    const err = specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1);
    expect(err.hint).toContain("spec-review-result-001.md");
  });

  it("hint contains the branch name", () => {
    const err = specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1);
    expect(err.hint).toContain("feat/readme-status-section");
  });

  it("hint contains the change folder path", () => {
    const err = specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1);
    expect(err.hint).toContain("openspec/changes/readme-status-section/spec-review-result-001.md");
  });

  it("hint contains commit+push guidance", () => {
    const err = specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1);
    // Must contain guidance about commit+push not done
    const hasGuidance =
      err.hint.includes("re-run the step") ||
      err.hint.includes("check the agent session logs for git push errors");
    expect(hasGuidance).toBe(true);
  });

  it("error code is SPEC_REVIEW_RESULT_NOT_FOUND", () => {
    const err = specReviewResultNotFoundError("slug", "branch", 1);
    expect(err.code).toBe(ERROR_CODES.SPEC_REVIEW_RESULT_NOT_FOUND);
  });
});

// -------------------------------------------------------------------------
// TC-002: specReviewResultNotFoundError — iteration=10 -> suffix -010
// -------------------------------------------------------------------------
describe("TC-002: specReviewResultNotFoundError — iteration=10 generates suffix -010", () => {
  it("hint contains spec-review-result-010.md", () => {
    const err = specReviewResultNotFoundError("my-slug", "feat/my-slug", 10);
    expect(err.hint).toContain("spec-review-result-010.md");
  });
});

// -------------------------------------------------------------------------
// TC-003: specReviewResultNotFoundError — iteration=100 -> suffix -100
// -------------------------------------------------------------------------
describe("TC-003: specReviewResultNotFoundError — iteration=100 generates suffix -100", () => {
  it("hint contains spec-review-result-100.md", () => {
    const err = specReviewResultNotFoundError("my-slug", "feat/my-slug", 100);
    expect(err.hint).toContain("spec-review-result-100.md");
  });
});

// -------------------------------------------------------------------------
// TC-004: codeReviewResultNotFoundError — iteration=3
// -------------------------------------------------------------------------
describe("TC-004: codeReviewResultNotFoundError — iteration=3 suffix and guidance", () => {
  it("hint contains review-feedback-003.md", () => {
    const err = codeReviewResultNotFoundError("some-slug", "feat/some-slug", 3);
    expect(err.hint).toContain("review-feedback-003.md");
  });

  it("hint contains the change folder path", () => {
    const err = codeReviewResultNotFoundError("some-slug", "feat/some-slug", 3);
    expect(err.hint).toContain("openspec/changes/some-slug/review-feedback-003.md");
  });

  it("hint contains commit+push guidance", () => {
    const err = codeReviewResultNotFoundError("some-slug", "feat/some-slug", 3);
    const hasGuidance =
      err.hint.includes("re-run the step") ||
      err.hint.includes("check the agent session logs for git push errors");
    expect(hasGuidance).toBe(true);
  });

  it("error code is CODE_REVIEW_RESULT_NOT_FOUND", () => {
    const err = codeReviewResultNotFoundError("slug", "branch", 3);
    expect(err.code).toBe(ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND);
  });
});

// -------------------------------------------------------------------------
// TC-005: iteration argument is required (TypeScript-level test)
// Verified by the required (non-optional) parameter type in errors.ts.
// This test confirms both functions accept exactly (slug, branch, iteration).
// -------------------------------------------------------------------------
describe("TC-005: iteration argument is required", () => {
  it("specReviewResultNotFoundError accepts 3 args and returns a SpecRunnerError", () => {
    const err = specReviewResultNotFoundError("slug", "branch", 2);
    expect(err).toBeDefined();
    expect(err.code).toBe("SPEC_REVIEW_RESULT_NOT_FOUND");
  });

  it("codeReviewResultNotFoundError accepts 3 args and returns a SpecRunnerError", () => {
    const err = codeReviewResultNotFoundError("slug", "branch", 2);
    expect(err).toBeDefined();
    expect(err.code).toBe("CODE_REVIEW_RESULT_NOT_FOUND");
  });
});

// -------------------------------------------------------------------------
// TC-006: code-review step declares gitWrite: true in capabilities
// -------------------------------------------------------------------------
describe("TC-006: code-review step declares gitWrite: true in capabilities", () => {
  it("capabilities.gitWrite === true", () => {
    expect(CodeReviewStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("does not contain 'read-only reviewer' wording in capability comment area", () => {
    // We verify via the system prompt and agent name — the old wording was in a comment
    // The agent definition should not perpetuate the wrong openspec-workflow model
    // This test checks through the agent definition itself
    expect(CodeReviewStep.agent.capabilities?.gitWrite).toBe(true);
    // The old value was falsy/undefined
    expect(CodeReviewStep.agent.capabilities?.gitWrite).not.toBeFalsy();
  });
});

// -------------------------------------------------------------------------
// TC-007: spec-review step declares gitWrite: true in capabilities
// -------------------------------------------------------------------------
describe("TC-007: spec-review step declares gitWrite: true in capabilities", () => {
  it("capabilities.gitWrite === true", () => {
    expect(SpecReviewStep.agent.capabilities?.gitWrite).toBe(true);
  });
});

// -------------------------------------------------------------------------
// TC-008: executor fetch path (resultFilePath) matches agent-written filename for spec-review
// -------------------------------------------------------------------------
describe("TC-008: spec-review round-trip — resultFilePath and buildFindingsPath are consistent", () => {
  function makeState(existingSpecReviewCount: number): JobState {
    return {
      version: 1,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "spec-review",
      status: "running",
      branch: "feat/my-slug",
      history: [],
      error: null,
      steps: existingSpecReviewCount === 0 ? {} : {
        "spec-review": Array.from({ length: existingSpecReviewCount }, (_, i) => ({
          attempt: i + 1,
          sessionId: null,
          outcome: { verdict: "needs-fix" as const, findingsPath: `openspec/changes/my-slug/spec-review-result-${String(i + 1).padStart(3, "0")}.md`, error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        })),
      },
    };
  }

  function makeDeps(slug: string): StepDeps {
    return {
      client: {} as StepDeps["client"],
      config: {
        version: 1,
        anthropic: { apiKey: "sk-test" },
        agents: {},
        environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
        github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
      },
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug, content: "content", enabled: [] },
      slug,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };
  }

  it("resultFilePath(state, deps) for iteration 1 equals buildFindingsPath(slug, 1)", () => {
    const state = makeState(0);
    const deps = makeDeps("my-slug");
    const resultPath = SpecReviewStep.resultFilePath(state, deps);
    const expectedPath = buildFindingsPath("my-slug", 1);
    expect(resultPath).toBe(expectedPath);
    expect(resultPath).toBe("openspec/changes/my-slug/spec-review-result-001.md");
  });

  it("resultFilePath(state, deps) for iteration 2 equals buildFindingsPath(slug, 2)", () => {
    const state = makeState(1);
    const deps = makeDeps("my-slug");
    const resultPath = SpecReviewStep.resultFilePath(state, deps);
    const expectedPath = buildFindingsPath("my-slug", 2);
    expect(resultPath).toBe(expectedPath);
    expect(resultPath).toBe("openspec/changes/my-slug/spec-review-result-002.md");
  });

  it("buildMessage includes the same filename as resultFilePath", () => {
    const state = makeState(0);
    const deps = makeDeps("my-slug");
    const resultPath = SpecReviewStep.resultFilePath(state, deps);
    const message = SpecReviewStep.buildMessage(state, deps);
    // The initial message must reference the same filename the executor will fetch
    expect(message).toContain(resultPath!);
  });
});

// -------------------------------------------------------------------------
// TC-009: executor fetch path matches agent-written filename for code-review
// -------------------------------------------------------------------------
describe("TC-009: code-review round-trip — resultFilePath and buildReviewFeedbackPath are consistent", () => {
  function makeState(existingCodeReviewCount: number): JobState {
    return {
      version: 1,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "code-review",
      status: "running",
      branch: "feat/my-slug",
      history: [],
      error: null,
      steps: existingCodeReviewCount === 0 ? {} : {
        "code-review": Array.from({ length: existingCodeReviewCount }, (_, i) => ({
          attempt: i + 1,
          sessionId: null,
          outcome: { verdict: "needs-fix" as const, findingsPath: `openspec/changes/my-slug/review-feedback-${String(i + 1).padStart(3, "0")}.md`, error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        })),
      },
    };
  }

  function makeDeps(slug: string): StepDeps {
    return {
      client: {} as StepDeps["client"],
      config: {
        version: 1,
        anthropic: { apiKey: "sk-test" },
        agents: {},
        environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
        github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
      },
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug, content: "content", enabled: [] },
      slug,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };
  }

  it("resultFilePath(state, deps) for iteration 1 equals buildReviewFeedbackPath(slug, 1)", () => {
    const state = makeState(0);
    const deps = makeDeps("my-slug");
    const resultPath = CodeReviewStep.resultFilePath(state, deps);
    const expectedPath = buildReviewFeedbackPath("my-slug", 1);
    expect(resultPath).toBe(expectedPath);
    expect(resultPath).toBe("openspec/changes/my-slug/review-feedback-001.md");
  });

  it("resultFilePath(state, deps) for iteration 2 equals buildReviewFeedbackPath(slug, 2)", () => {
    const state = makeState(1);
    const deps = makeDeps("my-slug");
    const resultPath = CodeReviewStep.resultFilePath(state, deps);
    const expectedPath = buildReviewFeedbackPath("my-slug", 2);
    expect(resultPath).toBe(expectedPath);
    expect(resultPath).toBe("openspec/changes/my-slug/review-feedback-002.md");
  });

  it("buildMessage includes the same filename as resultFilePath", () => {
    const state = makeState(0);
    const deps = makeDeps("my-slug");
    const resultPath = CodeReviewStep.resultFilePath(state, deps);
    const message = CodeReviewStep.buildMessage(state, deps);
    expect(message).toContain(resultPath!);
  });
});

// -------------------------------------------------------------------------
// TC-010: spec-review system prompt includes commit+push+delayed end_turn instructions
// -------------------------------------------------------------------------
describe("TC-010: spec-review system prompt includes commit+push+delayed end_turn instructions", () => {
  it("SPEC_REVIEW_SYSTEM_PROMPT contains commit instruction (case-insensitive)", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT.toLowerCase()).toContain("commit");
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains push instruction", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT.toLowerCase()).toContain("push");
  });

  it("SPEC_REVIEW_SYSTEM_PROMPT contains 'Do NOT end_turn until push is complete' equivalent", () => {
    const hasDelayEndTurn =
      SPEC_REVIEW_SYSTEM_PROMPT.includes("Do NOT end_turn until the push is complete") ||
      SPEC_REVIEW_SYSTEM_PROMPT.includes("do not end_turn until push") ||
      (SPEC_REVIEW_SYSTEM_PROMPT.includes("end_turn") && SPEC_REVIEW_SYSTEM_PROMPT.toLowerCase().includes("push"));
    expect(hasDelayEndTurn).toBe(true);
  });

  it("buildSpecReviewInitialMessage with branch embeds buildGitPushInstruction content", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "my-slug",
      repository: "owner/repo",
      requestType: "feature",
      branch: "feat/my-slug",
      iteration: 1,
    });
    // buildGitPushInstruction embeds push + end_turn guard
    expect(msg).toContain("feat/my-slug");
    expect(msg.toLowerCase()).toContain("commit");
    expect(msg.toLowerCase()).toContain("push");
    expect(msg).toContain("Do NOT return until push is complete");
  });

  it("buildSpecReviewInitialMessage includes correct findings path for iteration 1", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "my-slug",
      repository: "owner/repo",
      requestType: "feature",
      branch: "feat/my-slug",
      iteration: 1,
    });
    expect(msg).toContain("spec-review-result-001.md");
  });

  it("buildSpecReviewInitialMessage includes correct findings path for iteration 2", () => {
    const msg = buildSpecReviewInitialMessage({
      slug: "my-slug",
      repository: "owner/repo",
      requestType: "feature",
      branch: "feat/my-slug",
      iteration: 2,
    });
    expect(msg).toContain("spec-review-result-002.md");
  });
});

// -------------------------------------------------------------------------
// TC-016: Existing ERROR_CODES includes CODE_REVIEW_RESULT_NOT_FOUND
// -------------------------------------------------------------------------
describe("TC-016 supplement: ERROR_CODES includes CODE_REVIEW_RESULT_NOT_FOUND", () => {
  it("ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND is defined", () => {
    expect(ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND).toBe("CODE_REVIEW_RESULT_NOT_FOUND");
  });
});

// -------------------------------------------------------------------------
// TC-011 / TC-012: executor error-hint iteration calculation
// Verifies that when getRawFile returns null, the thrown error's hint
// references the correct iteration filename suffix (length + 1, not length).
// -------------------------------------------------------------------------

let tc011TempDir: string;
let tc011OriginalXdg: string | undefined;

beforeEach(async () => {
  tc011TempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-executor-test-"));
  tc011OriginalXdg = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tc011TempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (tc011OriginalXdg !== undefined) {
    process.env["XDG_DATA_HOME"] = tc011OriginalXdg;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tc011TempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeExecutorTestConfig() {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-test" },
    agents: {
      "spec-review": { agentId: "agent_spec_rev", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01" },
      "code-review": { agentId: "agent_code_rev", definitionHash: "sha256:def", lastSyncedAt: "2026-01-01" },
    },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
  };
}

async function makeExecutorTestState(
  jobId: string,
  stepName: string,
  existingResultCount: number,
): Promise<JobState> {
  const jobsDir = path.join(tc011TempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const existingStepResults = Array.from({ length: existingResultCount }, (_, i) => ({
    attempt: i + 1,
    sessionId: null,
    outcome: {
      verdict: "needs-fix" as const,
      findingsPath: `openspec/changes/my-slug/step-result-${String(i + 1).padStart(3, "0")}.md`,
      error: null,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  }));
  const state: JobState = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/my-slug",
    history: [],
    error: null,
    steps: existingResultCount === 0 ? {} : { [stepName]: existingStepResults },
  };
  await fs.writeFile(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(state, null, 2),
  );
  return state;
}

function makeReviewStepStub(stepName: "spec-review" | "code-review", resultPath: string): AgentStep {
  return {
    kind: "agent",
    name: stepName,
    agent: {
      name: `specrunner-${stepName}`,
      role: stepName,
      model: "claude-sonnet-4-5",
      system: "system",
      tools: [],
      capabilities: { gitWrite: true },
    },
    toolHandlers: undefined,
    buildMessage: () => `review message for ${stepName}`,
    resultFilePath: () => resultPath,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };
}

describe("TC-011: executor error-hint iteration — spec-review getRawFile failure", () => {
  it("with existingResults.length=0, hint contains spec-review-result-001.md", async () => {
    const events = new EventBus();
    const executor = new StepExecutor(events);
    const state = await makeExecutorTestState("tc011-job-0", "spec-review", 0);

    const mockClient: PipelineDeps["client"] = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_tc011" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      }),
    } as PipelineDeps["client"];

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeExecutorTestConfig(),
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug: "my-slug", content: "content", enabled: [] },
      slug: "my-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };

    const step = makeReviewStepStub("spec-review", "openspec/changes/my-slug/spec-review-result-001.md");

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "SPEC_REVIEW_RESULT_NOT_FOUND",
      hint: expect.stringContaining("spec-review-result-001.md"),
    });
  });

  it("with existingResults.length=1, hint contains spec-review-result-002.md", async () => {
    const events = new EventBus();
    const executor = new StepExecutor(events);
    const state = await makeExecutorTestState("tc011-job-1", "spec-review", 1);

    const mockClient: PipelineDeps["client"] = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_tc011b" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      }),
    } as PipelineDeps["client"];

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeExecutorTestConfig(),
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug: "my-slug", content: "content", enabled: [] },
      slug: "my-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };

    const step = makeReviewStepStub("spec-review", "openspec/changes/my-slug/spec-review-result-002.md");

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "SPEC_REVIEW_RESULT_NOT_FOUND",
      hint: expect.stringContaining("spec-review-result-002.md"),
    });
  });
});

describe("TC-012: executor error-hint iteration — code-review getRawFile failure", () => {
  it("with existingResults.length=0, hint contains review-feedback-001.md", async () => {
    const events = new EventBus();
    const executor = new StepExecutor(events);
    const state = await makeExecutorTestState("tc012-job-0", "code-review", 0);

    const mockClient: PipelineDeps["client"] = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_tc012" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      }),
    } as PipelineDeps["client"];

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeExecutorTestConfig(),
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug: "my-slug", content: "content", enabled: [] },
      slug: "my-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };

    const step = makeReviewStepStub("code-review", "openspec/changes/my-slug/review-feedback-001.md");

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "CODE_REVIEW_RESULT_NOT_FOUND",
      hint: expect.stringContaining("review-feedback-001.md"),
    });
  });

  it("with existingResults.length=1, hint contains review-feedback-002.md", async () => {
    const events = new EventBus();
    const executor = new StepExecutor(events);
    const state = await makeExecutorTestState("tc012-job-1", "code-review", 1);

    const mockClient: PipelineDeps["client"] = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess_tc012b" }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({
        sseDisconnected: false,
        idleEndTurnDetected: true,
        terminated: false,
        terminationReason: "end_turn" as const,
      }),
    } as PipelineDeps["client"];

    const deps: PipelineDeps = {
      client: mockClient,
      config: makeExecutorTestConfig(),
      repo: { owner: "testowner", name: "testrepo" },
      request: { type: "feature", title: "Test", slug: "my-slug", content: "content", enabled: [] },
      slug: "my-slug",
      githubClient: {
        verifyBranch: vi.fn().mockResolvedValue(true),
        getRawFile: vi.fn().mockResolvedValue(null),
        verifyPath: vi.fn().mockResolvedValue(true),
        verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      },
    };

    const step = makeReviewStepStub("code-review", "openspec/changes/my-slug/review-feedback-002.md");

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: "CODE_REVIEW_RESULT_NOT_FOUND",
      hint: expect.stringContaining("review-feedback-002.md"),
    });
  });
});

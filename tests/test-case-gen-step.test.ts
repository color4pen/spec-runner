/**
 * Unit tests for TestCaseGenStep
 *
 * TC-001: TestCaseGenStep.buildMessage constructs correct message
 * TC-002: TestCaseGenStep.buildMessage throws branchNotSetError when branch is null
 * TC-003: TestCaseGenStep.parseResult returns NULL_PARSE_RESULT
 * TC-004: STANDARD_TRANSITIONS has spec-review:approved → test-case-gen
 * TC-005: STANDARD_TRANSITIONS has test-case-gen:success → implementer
 * TC-006: STANDARD_TRANSITIONS has test-case-gen:error → escalate
 * TC-007: TEST_CASE_GEN_SYSTEM_PROMPT contains required section keywords
 * TC-008: buildMessage includes <must-areas> when enabled is non-empty
 * TC-009: buildMessage omits <must-areas> when enabled is empty
 * TC-010: buildMessage includes proposal.md read instruction
 */
import { describe, it, expect } from "vitest";
import { TestCaseGenStep } from "../src/core/step/test-case-gen.js";
import { NULL_PARSE_RESULT } from "../src/core/step/types.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../src/prompts/test-case-gen-system.js";
import { AGENT_TOOLSET_TYPE } from "../src/core/agent/definition.js";
import { STANDARD_TRANSITIONS } from "../src/core/pipeline/types.js";
import { changeFolderPath } from "../src/util/paths.js";
import type { JobState } from "../src/state/schema.js";
import type { StepDeps } from "../src/core/step/types.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "test-case-gen",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Add test-case-gen step to pipeline",
      enabled: [],
    },
    slug,
  };
}

// TC-001: TestCaseGenStep の構造検証
describe("TC-001: TestCaseGenStep 構造検証", () => {
  it("step.kind === 'agent' かつ step.name === 'test-case-gen'", () => {
    expect(TestCaseGenStep.kind).toBe("agent");
    expect(TestCaseGenStep.name).toBe("test-case-gen");
  });

  it("step.agent.role === 'test-case-gen' かつ model === 'claude-sonnet-4-6'", () => {
    expect(TestCaseGenStep.agent.role).toBe("test-case-gen");
    expect(TestCaseGenStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("step.agent.capabilities.gitWrite === true", () => {
    expect(TestCaseGenStep.agent.capabilities?.gitWrite).toBe(true);
  });

  it("step.agent.system === TEST_CASE_GEN_SYSTEM_PROMPT", () => {
    expect(TestCaseGenStep.agent.system).toBe(TEST_CASE_GEN_SYSTEM_PROMPT);
  });

  it("step.agent.tools に AGENT_TOOLSET_TYPE が含まれる", () => {
    const hasToolset = TestCaseGenStep.agent.tools.some(
      (t) => t.type === AGENT_TOOLSET_TYPE,
    );
    expect(hasToolset).toBe(true);
  });

  it("completionVerdict === 'success'", () => {
    expect(TestCaseGenStep.completionVerdict).toBe("success");
  });

  it("maxTurns === 15", () => {
    expect(TestCaseGenStep.maxTurns).toBe(15);
  });
});

// TC-001: buildMessage 内容検証
describe("TC-001: TestCaseGenStep.buildMessage 内容検証", () => {
  it("slug / branch / design.md / tasks.md / test-cases.md / push instruction が含まれる", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    const message = TestCaseGenStep.buildMessage(state, deps);

    expect(message).toContain(changeFolderPath("my-change"));
    expect(message).toContain("design.md");
    expect(message).toContain("tasks.md");
    expect(message).toContain("test-cases.md");
    expect(message).toContain("feat/my-change");
    expect(message.toLowerCase()).toContain("commit");
    expect(message.toLowerCase()).toContain("push");
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
    expect(message).toContain("Add test-case-gen step to pipeline");
  });

  it("requestContent が <user-request> タグ内に含まれる", () => {
    const state = makeMinimalState({ branch: "feat/test-branch" });
    const deps = makeMinimalDeps("test-slug");
    const message = TestCaseGenStep.buildMessage(state, deps);

    const start = message.indexOf("<user-request>");
    const end = message.indexOf("</user-request>");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const userRequestSection = message.slice(start, end);
    expect(userRequestSection).toContain(deps.request.content);
  });
});

// TC-002: buildMessage — branch 未設定時に branchNotSetError を投げる
describe("TC-002: TestCaseGenStep.buildMessage — fail-fast on missing branch", () => {
  it("throws BRANCH_NOT_SET when state.branch is null", () => {
    const state = makeMinimalState({ branch: null });
    const deps = makeMinimalDeps("my-change");
    expect(() => TestCaseGenStep.buildMessage(state, deps)).toThrowError(
      expect.objectContaining({ code: "BRANCH_NOT_SET" }),
    );
  });
});

// TC-003: resultFilePath と parseResult
describe("TC-003: TestCaseGenStep.resultFilePath と parseResult", () => {
  it("resultFilePath は null を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    expect(TestCaseGenStep.resultFilePath(state, deps)).toBeNull();
  });

  it("parseResult は NULL_PARSE_RESULT と deep-equal な値を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const result = TestCaseGenStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toBeNull();
    expect(result.fileContent).toBeNull();
  });

  it("parseResult は空文字列で呼ばれても NULL_PARSE_RESULT を返す", () => {
    const deps = makeMinimalDeps();
    expect(TestCaseGenStep.parseResult("", deps)).toEqual(NULL_PARSE_RESULT);
  });
});

// TC-004: STANDARD_TRANSITIONS に spec-review:approved → test-case-gen が存在する
describe("TC-004: STANDARD_TRANSITIONS に spec-review:approved → test-case-gen が存在する", () => {
  it("spec-review --approved→ test-case-gen が存在する", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "spec-review" && t.on === "approved" && t.to === "test-case-gen",
    );
    expect(found).toBeDefined();
  });

  it("spec-review --approved→ implementer は存在しない（旧 transition が削除されている）", () => {
    const old = STANDARD_TRANSITIONS.find(
      (t) => t.step === "spec-review" && t.on === "approved" && t.to === "implementer",
    );
    expect(old).toBeUndefined();
  });
});

// TC-005: STANDARD_TRANSITIONS に test-case-gen:success → implementer が存在する
describe("TC-005: STANDARD_TRANSITIONS に test-case-gen:success → implementer が存在する", () => {
  it("test-case-gen --success→ implementer が存在する", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "test-case-gen" && t.on === "success" && t.to === "implementer",
    );
    expect(found).toBeDefined();
  });
});

// TC-006: STANDARD_TRANSITIONS に test-case-gen:error → escalate が存在する
describe("TC-006: STANDARD_TRANSITIONS に test-case-gen:error → escalate が存在する", () => {
  it("test-case-gen --error→ escalate が存在する", () => {
    const found = STANDARD_TRANSITIONS.find(
      (t) => t.step === "test-case-gen" && t.on === "error" && t.to === "escalate",
    );
    expect(found).toBeDefined();
  });
});

// TC-007: TEST_CASE_GEN_SYSTEM_PROMPT に必須セクションキーワードが含まれる
describe("TC-007: TEST_CASE_GEN_SYSTEM_PROMPT 内容検証", () => {
  it("Category キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Category");
  });

  it("Source キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Source");
  });

  it("Summary キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Summary");
  });

  it("blocked_reasons キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("blocked_reasons");
  });

  it("must-areas キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("must-areas");
  });

  it("Result キーワードが含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Result");
  });
});

// TC-008: buildMessage — enabled 非空時に <must-areas> が含まれる
describe("TC-008: buildMessage — enabled 非空時に <must-areas> が含まれる", () => {
  it("enabled: ['security'] の場合 <must-areas> セクションが含まれる", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    deps.request.enabled = ["security"];
    const message = TestCaseGenStep.buildMessage(state, deps);

    expect(message).toContain("<must-areas>");
    expect(message).toContain("security");
    expect(message).toContain("</must-areas>");
  });

  it("複数 enabled の場合 <must-areas> にカンマ区切りで含まれる", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    deps.request.enabled = ["security", "performance"];
    const message = TestCaseGenStep.buildMessage(state, deps);

    expect(message).toContain("<must-areas>");
    expect(message).toContain("security, performance");
    expect(message).toContain("</must-areas>");
  });
});

// TC-009: buildMessage — enabled 空配列時に <must-areas> が含まれない
describe("TC-009: buildMessage — enabled 空配列時に <must-areas> が含まれない", () => {
  it("enabled: [] の場合 <must-areas> セクションが含まれない", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    const message = TestCaseGenStep.buildMessage(state, deps);

    expect(message).not.toContain("<must-areas>");
    expect(message).not.toContain("</must-areas>");
  });
});

// TC-010: buildMessage に request.md 読み取り指示が含まれる
describe("TC-010: buildMessage — request.md 読み取り指示が含まれる", () => {
  it("message に request.md が含まれる", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    const message = TestCaseGenStep.buildMessage(state, deps);

    expect(message).toContain("request.md");
  });
});

/**
 * Unit tests for VerificationStep
 *
 * TC-001: VerificationStep kind discriminator and agent 不在
 * TC-018: parseResult — passed 抽出
 * TC-019: parseResult — failed 抽出
 * TC-020: parseResult — verdict 行不在 → null
 */
import { describe, it, expect, vi } from "vitest";
import { VerificationStep } from "../../../src/core/step/verification.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "verification",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
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
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
    },
  };
}

// TC-001: VerificationStep の kind discriminator と agent 不在
describe("TC-001: VerificationStep kind discriminator and agent 不在", () => {
  it("step.kind === 'cli' かつ step.name === 'verification'", () => {
    expect(VerificationStep.kind).toBe("cli");
    expect(VerificationStep.name).toBe("verification");
  });

  it("step.agent プロパティが存在しない (TypeScript 型レベルで agent フィールドがない)", () => {
    // At runtime: CliStep should not have an 'agent' property
    expect("agent" in VerificationStep).toBe(false);
  });

  it("step.run が (state, deps) => Promise<void> の型を持つ", () => {
    expect(typeof VerificationStep.run).toBe("function");
  });
});

// TC-018: VerificationStep.parseResult — passed 抽出
describe("TC-018: VerificationStep.parseResult — passed 抽出", () => {
  it("content に '## Verdict: passed' が含まれる場合 verdict='passed' を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const content = "# Verification Result\n\n## Verdict: passed\n\n## Phase Results\n";
    const result = VerificationStep.parseResult(content, deps);

    expect(result.verdict).toBe("passed");
    expect(result.findingsPath).toContain("my-change");
    expect(result.findingsPath).toContain("verification-result.md");
  });
});

// TC-019: VerificationStep.parseResult — failed 抽出
describe("TC-019: VerificationStep.parseResult — failed 抽出", () => {
  it("content に '## Verdict: failed' が含まれる場合 verdict='failed' を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const content = "# Verification Result\n\n## Verdict: failed\n\n## Phase Results\n";
    const result = VerificationStep.parseResult(content, deps);

    expect(result.verdict).toBe("failed");
    expect(result.findingsPath).toContain("my-change");
  });
});

// TC-020: VerificationStep.parseResult — verdict 行不在 → null
describe("TC-020: VerificationStep.parseResult — verdict 行不在 → null", () => {
  it("content に '## Verdict:' が存在しない場合 verdict=null を返す", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const content = "# Broken verification result\n\nNo verdict here.\n";
    const result = VerificationStep.parseResult(content, deps);

    expect(result.verdict).toBeNull();
    expect(result.findingsPath).toContain("my-change");
  });
});

// resultFilePath
describe("VerificationStep.resultFilePath", () => {
  it("returns the correct path for the verification result", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const filePath = VerificationStep.resultFilePath(state, deps);

    expect(filePath).toBe("openspec/changes/my-change/verification-result.md");
  });
});

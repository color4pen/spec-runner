/**
 * Unit tests for PrCreateStep.
 *
 * TC-008: PrCreateStep — CliStep shape の適合性
 * TC-009: PrCreateStep.resultFilePath — slug から正しいパスを生成する
 * TC-010: PrCreateStep.parseResult — success を verdict "success" にマップする
 * TC-011: PrCreateStep.parseResult — failed を verdict "error" にマップする
 * TC-012: PrCreateStep.parseResult — Status 行なしで verdict null を返す
 * TC-013: PrCreateStep.run — PR 作成成功時に pullRequest を JobState に記録する
 * TC-014: PrCreateStep.run — 失敗時に pullRequest を変更しない
 * TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に pullRequest を記録して success を返す
 * TC-016: pr-create-result.md — 成功時のファイル構造
 * TC-017: pr-create-result.md — 失敗時のファイル構造
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// Mock the runner so we don't spawn real processes
vi.mock("../../../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn(),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pr-create-step-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "running",
    branch: "feat/test",
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
    request: { type: "feature", title: "Test PR", slug: "test-slug", content: "content", enabled: [], sections: {} },
    slug,
    cwd: tempDir,
  };
}

// TC-008: PrCreateStep — CliStep shape の適合性
describe("TC-008: PrCreateStep — CliStep shape の適合性", () => {
  it("step.kind === 'cli'", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    expect(PrCreateStep.kind).toBe("cli");
  });

  it("step.name === 'pr-create'", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    expect(PrCreateStep.name).toBe("pr-create");
  });

  it("step.agent プロパティが存在しない", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    expect("agent" in PrCreateStep).toBe(false);
  });

  it("step.run が (state, deps) => Promise<void> の型を持つ", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    expect(typeof PrCreateStep.run).toBe("function");
  });
});

// TC-009: PrCreateStep.resultFilePath — slug から正しいパスを生成する
describe("TC-009: PrCreateStep.resultFilePath — slug から正しいパスを生成する", () => {
  it("returns openspec/changes/<slug>/pr-create-result.md", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");
    const filePath = PrCreateStep.resultFilePath(state, deps);
    expect(filePath).toBe("openspec/changes/pr-create-step/pr-create-result.md");
  });
});

// TC-010: PrCreateStep.parseResult — success を verdict "success" にマップする
describe("TC-010: PrCreateStep.parseResult — success を verdict 'success' にマップする", () => {
  it("returns verdict='success' for '## Status: success'", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = "# pr-create Result\n\n## Status: success\n\n## PR\n\n- **URL**: https://github.com/owner/repo/pull/42\n";
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("success");
  });
});

// TC-011: PrCreateStep.parseResult — failed を verdict "error" にマップする
describe("TC-011: PrCreateStep.parseResult — failed を verdict 'error' にマップする", () => {
  it("returns verdict='error' for '## Status: failed'", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = "# pr-create Result\n\n## Status: failed\n\n## Detail\n\n- **Reason**: gh-failure\n";
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("error");
  });
});

// TC-012: PrCreateStep.parseResult — Status 行なしで verdict null を返す
describe("TC-012: PrCreateStep.parseResult — Status 行なしで verdict null を返す", () => {
  it("returns verdict=null when no ## Status: line present", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = "# pr-create Result\n\nNo status here.\n";
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBeNull();
  });
});

// TC-013: PrCreateStep.run — PR 作成成功時に pullRequest を JobState に記録する
describe("TC-013: PrCreateStep.run — PR 作成成功時に pullRequest を JobState に記録する", () => {
  it("sets state.pullRequest with url, number, and ISO createdAt", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    // Create the directory structure
    await fs.mkdir(path.join(tempDir, "openspec", "changes", "pr-create-step"), { recursive: true });

    await PrCreateStep.run(state, deps);

    expect(state.pullRequest).toBeDefined();
    expect(state.pullRequest?.url).toBe("https://github.com/owner/repo/pull/42");
    expect(state.pullRequest?.number).toBe(42);
    expect(state.pullRequest?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("result file contains ## Status: success and PR URL", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, "openspec", "changes", "pr-create-step"), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, "openspec", "changes", "pr-create-step", "pr-create-result.md");
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: success");
    expect(content).toContain("https://github.com/owner/repo/pull/42");
    expect(content).toContain("42");
  });
});

// TC-014: PrCreateStep.run — 失敗時に pullRequest を変更しない
describe("TC-014: PrCreateStep.run — 失敗時に pullRequest を変更しない", () => {
  it("does not set state.pullRequest on runner error", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "error",
      reason: "gh-failure",
      message: "auth expired",
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, "openspec", "changes", "pr-create-step"), { recursive: true });
    await PrCreateStep.run(state, deps);

    expect(state.pullRequest).toBeUndefined();
  });

  it("result file contains ## Status: failed and detail info", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "error",
      reason: "gh-failure",
      message: "auth expired",
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, "openspec", "changes", "pr-create-step"), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, "openspec", "changes", "pr-create-step", "pr-create-result.md");
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: failed");
    expect(content).toContain("gh-failure");
    expect(content).toContain("auth expired");
  });
});

// TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に pullRequest を記録して success を返す
describe("TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に pullRequest を記録して success を返す", () => {
  it("sets state.pullRequest and writes success result file for existing-open", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "existing-open",
      url: "https://github.com/owner/repo/pull/12",
      number: 12,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, "openspec", "changes", "pr-create-step"), { recursive: true });
    await PrCreateStep.run(state, deps);

    expect(state.pullRequest?.url).toBe("https://github.com/owner/repo/pull/12");
    expect(state.pullRequest?.number).toBe(12);

    const resultPath = path.join(tempDir, "openspec", "changes", "pr-create-step", "pr-create-result.md");
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: success");
  });
});

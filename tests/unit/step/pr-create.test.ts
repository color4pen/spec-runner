/**
 * Unit tests for PrCreateStep.
 *
 * TC-008: PrCreateStep — CliStep shape の適合性
 * TC-009: PrCreateStep.resultFilePath — slug から正しいパスを生成する
 * TC-010: PrCreateStep.parseResult — success を verdict "success" にマップする
 * TC-011: PrCreateStep.parseResult — failed を verdict "error" にマップする
 * TC-012: PrCreateStep.parseResult — Status 行なしで verdict null を返す
 * TC-013: PrCreateStep.run — PR 作成成功時に state.pullRequest を変更せず parseResult で返す
 * TC-014: PrCreateStep.run — 失敗時に pullRequest を変更しない
 * TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に state.pullRequest を変更せず parseResult で返す
 * TC-016: pr-create-result.md — 成功時のファイル構造（createdAt 含む）
 * TC-017: pr-create-result.md — 失敗時のファイル構造
 * TC-018: PrCreateStep.parseResult — success 時に pullRequest を返す
 * TC-019: PrCreateStep.parseResult — failed 時に pullRequest を返さない
 * TC-020: PrCreateStep.parseResult — URL/Number/CreatedAt が欠落した場合に pullRequest を返さない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { changeFolderPath, prCreateResultPath } from "../../../src/util/paths.js";

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
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test PR", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], sections: {} },
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
    expect(filePath).toBe(prCreateResultPath("pr-create-step"));
  });
});

// TC-010: PrCreateStep.parseResult — success を verdict "success" にマップする
describe("TC-010: PrCreateStep.parseResult — success を verdict 'success' にマップする", () => {
  it("returns verdict='success' for '## Status: success'", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = "# pr-create Result\n\n## Status: success\n\n## PR\n\n- **URL**: https://github.com/owner/repo/pull/42\n- **Number**: 42\n- **CreatedAt**: 2026-01-01T00:00:00.000Z\n";
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

// TC-013: PrCreateStep.run — PR 作成成功時に state.pullRequest を変更せず、parseResult で返す
describe("TC-013: PrCreateStep.run — PR 作成成功時に state.pullRequest を変更しない", () => {
  it("does NOT mutate state.pullRequest after run() (mutation removed)", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });

    await PrCreateStep.run(state, deps);

    // state.pullRequest must NOT be set by run() — mutation is gone
    expect(state.pullRequest).toBeUndefined();
  });

  it("parseResult extracts pullRequest from the result file written by run()", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
    const content = await fs.readFile(resultPath, "utf-8");
    const parsed = PrCreateStep.parseResult(content, deps);

    expect(parsed.pullRequest).toBeDefined();
    expect(parsed.pullRequest?.url).toBe("https://github.com/owner/repo/pull/42");
    expect(parsed.pullRequest?.number).toBe(42);
    expect(parsed.pullRequest?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
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

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
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

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: failed");
    expect(content).toContain("gh-failure");
    expect(content).toContain("auth expired");
  });
});

// TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に state.pullRequest を変更せず parseResult で返す
describe("TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に state.pullRequest を変更しない", () => {
  it("does NOT mutate state.pullRequest for existing-open (mutation removed)", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "existing-open",
      url: "https://github.com/owner/repo/pull/12",
      number: 12,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    // state.pullRequest must NOT be set by run() — mutation is gone
    expect(state.pullRequest).toBeUndefined();
  });

  it("parseResult extracts pullRequest for existing-open from the result file", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "existing-open",
      url: "https://github.com/owner/repo/pull/12",
      number: 12,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
    const content = await fs.readFile(resultPath, "utf-8");
    const parsed = PrCreateStep.parseResult(content, deps);

    expect(parsed.pullRequest?.url).toBe("https://github.com/owner/repo/pull/12");
    expect(parsed.pullRequest?.number).toBe(12);

    expect(content).toContain("## Status: success");
  });
});

// TC-016: pr-create-result.md — 成功時のファイル構造（createdAt 含む）
describe("TC-016: pr-create-result.md — 成功時のファイル構造", () => {
  it("result file includes CreatedAt line", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/99",
      number: 99,
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: success");
    expect(content).toContain("**URL**:");
    expect(content).toContain("**Number**:");
    expect(content).toContain("**CreatedAt**:");
    expect(content).toContain("**Action**:");
  });
});

// TC-017: pr-create-result.md — 失敗時のファイル構造
describe("TC-017: pr-create-result.md — 失敗時のファイル構造", () => {
  it("result file for failure has Status: failed section", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "error",
      reason: "gh-failure",
      message: "timeout",
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps("pr-create-step");

    await fs.mkdir(path.join(tempDir, changeFolderPath("pr-create-step")), { recursive: true });
    await PrCreateStep.run(state, deps);

    const resultPath = path.join(tempDir, prCreateResultPath("pr-create-step"));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: failed");
    expect(content).toContain("gh-failure");
    expect(content).toContain("timeout");
  });
});

// TC-018: PrCreateStep.parseResult — success 時に pullRequest を返す
describe("TC-018: PrCreateStep.parseResult — success 時に pullRequest を返す", () => {
  it("returns pullRequest with url, number, createdAt on success", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = [
      "# pr-create Result — my-change",
      "",
      "## Status: success",
      "",
      "## PR",
      "",
      "- **URL**: https://github.com/owner/repo/pull/77",
      "- **Number**: 77",
      "- **CreatedAt**: 2026-05-09T12:00:00.000Z",
      "- **Action**: created",
      "",
    ].join("\n");

    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("success");
    expect(result.pullRequest).toBeDefined();
    expect(result.pullRequest?.url).toBe("https://github.com/owner/repo/pull/77");
    expect(result.pullRequest?.number).toBe(77);
    expect(result.pullRequest?.createdAt).toBe("2026-05-09T12:00:00.000Z");
  });
});

// TC-019: PrCreateStep.parseResult — failed 時に pullRequest を返さない
describe("TC-019: PrCreateStep.parseResult — failed 時に pullRequest を返さない", () => {
  it("returns no pullRequest on failed status", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = [
      "# pr-create Result — my-change",
      "",
      "## Status: failed",
      "",
      "## Detail",
      "",
      "- **Reason**: gh-failure",
      "- **Message**: auth expired",
      "",
    ].join("\n");

    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("error");
    expect(result.pullRequest).toBeUndefined();
  });
});

// TC-020: PrCreateStep.parseResult — URL/Number/CreatedAt が欠落した場合に pullRequest を返さない
describe("TC-020: PrCreateStep.parseResult — フィールド欠落時に pullRequest を返さない (defensive parsing)", () => {
  it("returns no pullRequest when URL is missing", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = [
      "## Status: success",
      "",
      "- **Number**: 42",
      "- **CreatedAt**: 2026-05-09T12:00:00.000Z",
    ].join("\n");
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("success");
    expect(result.pullRequest).toBeUndefined();
  });

  it("returns no pullRequest when Number is missing", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = [
      "## Status: success",
      "",
      "- **URL**: https://github.com/owner/repo/pull/42",
      "- **CreatedAt**: 2026-05-09T12:00:00.000Z",
    ].join("\n");
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("success");
    expect(result.pullRequest).toBeUndefined();
  });

  it("returns no pullRequest when CreatedAt is missing", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const deps = makeMinimalDeps();
    const content = [
      "## Status: success",
      "",
      "- **URL**: https://github.com/owner/repo/pull/42",
      "- **Number**: 42",
    ].join("\n");
    const result = PrCreateStep.parseResult(content, deps);
    expect(result.verdict).toBe("success");
    expect(result.pullRequest).toBeUndefined();
  });
});

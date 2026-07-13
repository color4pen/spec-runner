/**
 * Unit tests for PrCreateStep best-effort attestation comment attachment.
 *
 * TC-ATT-PR-01: PR 作成成功（created）時に createIssueComment が result.number へ 1 回呼ばれ、
 *               body が attestation の json フェンスを含む
 * TC-ATT-PR-02: createIssueComment が reject しても run が例外を投げず、
 *               pr-create-result.md が ## Status: success を保持する（best-effort）
 * TC-ATT-PR-03: change folder に events.jsonl が無い場合、createIssueComment が呼ばれず
 *               run が成功し pr-create-result.md が ## Status: success を保持する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { JobState } from "../../../src/state/schema.js";
import type { CliStepDeps } from "../../../src/core/step/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { changeFolderPath, prCreateResultPath, slugEventsPath, usageJsonPath } from "../../../src/util/paths.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

// Mock the runner so we don't spawn real processes
vi.mock("../../../src/core/pr-create/runner.js", () => ({
  runPrCreate: vi.fn(),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pr-create-attestation-test-"));
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

function makeCreateIssueCommentMock() {
  return vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" });
}

function makeMinimalDeps(slug: string = "my-change", createIssueComment = makeCreateIssueCommentMock()): CliStepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "feature",
      title: "Test PR",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
      sections: {},
    },
    slug,
    cwd: tempDir,
    spawn: noopSpawn,
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "https://github.com/user/repo/pull/1", number: 1 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment,
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "testowner",
    repo: "testrepo",
  };
}

/** Write a minimal but valid events.jsonl to the change folder */
async function writeMinimalEventsJsonl(slug: string): Promise<void> {
  const dir = path.join(tempDir, changeFolderPath(slug));
  await fs.mkdir(dir, { recursive: true });
  const record = JSON.stringify({
    type: "step-attempt",
    step: "design",
    sessionId: "sess-1",
    outcome: { verdict: "approved", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
  });
  await fs.writeFile(path.join(tempDir, slugEventsPath(slug)), record + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// TC-ATT-PR-01: createIssueComment called once with attestation json fence
// ---------------------------------------------------------------------------

describe("TC-ATT-PR-01: PR 作成成功時に createIssueComment が attestation body で呼ばれる", () => {
  it("createIssueComment is called once with result.number and body containing ```json fence", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    });

    const slug = "pr-attest-test";
    await writeMinimalEventsJsonl(slug);

    const createIssueComment = makeCreateIssueCommentMock();
    const deps = makeMinimalDeps(slug, createIssueComment);
    const state = makeMinimalState();

    await PrCreateStep.run(state, deps);

    // Should have been called once
    expect(createIssueComment).toHaveBeenCalledTimes(1);

    // Called with correct PR number
    const [, , , body] = createIssueComment.mock.calls[0] as [string, string, number, string];
    expect(createIssueComment.mock.calls[0]![2]).toBe(42);

    // Body contains json fence
    expect(body).toContain("```json");
    expect(body).toContain("journalHash");
  });

  it("createIssueComment body's json block parses successfully", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/55",
      number: 55,
    });

    const slug = "pr-attest-json-test";
    await writeMinimalEventsJsonl(slug);

    const createIssueComment = makeCreateIssueCommentMock();
    const deps = makeMinimalDeps(slug, createIssueComment);
    const state = makeMinimalState();

    await PrCreateStep.run(state, deps);

    const body = createIssueComment.mock.calls[0]![3] as string;
    const jsonMatch = /```json\n([\s\S]*?)\n```/.exec(body);
    expect(jsonMatch).not.toBeNull();

    // Should parse without throwing
    expect(() => JSON.parse(jsonMatch![1]!)).not.toThrow();
    const parsed = JSON.parse(jsonMatch![1]!) as Record<string, unknown>;
    expect(typeof parsed["journalHash"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-PR-02: createIssueComment rejection does not fail run (best-effort)
// ---------------------------------------------------------------------------

describe("TC-ATT-PR-02: createIssueComment 失敗でも run が成功し pr-create-result.md が正常", () => {
  it("run succeeds even when createIssueComment rejects", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/77",
      number: 77,
    });

    const slug = "pr-attest-fail-test";
    await writeMinimalEventsJsonl(slug);

    // createIssueComment that rejects
    const createIssueComment = vi.fn().mockRejectedValue(new Error("GitHub API error"));
    const deps = makeMinimalDeps(slug, createIssueComment);
    const state = makeMinimalState();

    // Should NOT throw
    await expect(PrCreateStep.run(state, deps)).resolves.toBeUndefined();

    // pr-create-result.md should still contain ## Status: success
    const resultPath = path.join(tempDir, prCreateResultPath(slug));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: success");
  });
});

// ---------------------------------------------------------------------------
// TC-ATT-PR-03: no events.jsonl → createIssueComment not called, run succeeds
// ---------------------------------------------------------------------------

describe("TC-ATT-PR-03: events.jsonl 欠落時に createIssueComment が呼ばれず run が成功する", () => {
  it("createIssueComment is NOT called when events.jsonl does not exist", async () => {
    const { PrCreateStep } = await import("../../../src/core/step/pr-create.js");
    const { runPrCreate } = await import("../../../src/core/pr-create/runner.js");
    vi.mocked(runPrCreate).mockResolvedValue({
      status: "created",
      url: "https://github.com/owner/repo/pull/99",
      number: 99,
    });

    const slug = "pr-attest-no-journal";
    // Create the change folder but NO events.jsonl
    await fs.mkdir(path.join(tempDir, changeFolderPath(slug)), { recursive: true });

    const createIssueComment = makeCreateIssueCommentMock();
    const deps = makeMinimalDeps(slug, createIssueComment);
    const state = makeMinimalState();

    // run should succeed without throwing
    await expect(PrCreateStep.run(state, deps)).resolves.toBeUndefined();

    // createIssueComment should NOT have been called
    expect(createIssueComment).not.toHaveBeenCalled();

    // pr-create-result.md should still be ## Status: success
    const resultPath = path.join(tempDir, prCreateResultPath(slug));
    const content = await fs.readFile(resultPath, "utf-8");
    expect(content).toContain("## Status: success");
  });
});

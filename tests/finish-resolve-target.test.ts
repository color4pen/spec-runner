/**
 * Tests for finish command: input resolution (resolveTarget).
 *
 * TC-001: --job <jobId> resolves state file
 * TC-002: <slug> positional resolves single match
 * TC-003: <slug> multiple matches → picks latest updatedAt + stdout warning (TC-134)
 * TC-004: no args → exit code 2 (auto-detect removed)
 * TC-131: no slug specified → "Specify <slug>, --pr, or --job" error
 * TC-109: --pr <num> → headRefName → slug resolved
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { resolveTarget } from "../src/core/finish/resolve-target.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-resolve-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write a job state to the slug dir (section 1) so list() can find it,
 * and write a liveness.json sidecar so loadStateByJobId can resolve via sidecar.
 */
async function makeJobWithPr(slug: string, updatedAt?: string) {
  const jobId = randomUUID();
  const now = updatedAt ?? new Date().toISOString();

  const stateJson = {
    version: 1,
    jobId,
    createdAt: now,
    updatedAt: now,
    request: { path: `/specrunner/drafts/${slug}.md`, title: "Test", type: "new-feature", slug },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: `feat/${slug}`,
    pullRequest: { url: `https://github.com/user/repo/pull/42`, number: 42, createdAt: "2026-01-01" },
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };

  // Write to slug dir (section 1 — list() scans this)
  const slugDir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(path.join(slugDir, "state.json"), JSON.stringify(stateJson, null, 2));
  await fs.writeFile(path.join(slugDir, "events.jsonl"), "");

  // Write liveness.json sidecar (loadStateByJobId resolves via sidecar → slug dir)
  const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(sidecarDir, { recursive: true });
  await fs.writeFile(
    path.join(sidecarDir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath: null, pid: 1234 }),
  );

  return { ...stateJson, jobId };
}

describe("TC-001: --job resolves state file", () => {
  it("returns correct prNumber, branch, slug from state file", async () => {
    const job = await makeJobWithPr("my-slug");

    const result = await resolveTarget({ jobId: job.jobId, cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.jobId).toBe(job.jobId);
    expect(result.target.prNumber).toBe(42);
    expect(result.target.branch).toBe("feat/my-slug");
    expect(result.target.slug).toBe("my-slug");
  });
});

describe("TC-002: <slug> positional resolves single match", () => {
  it("returns the single matching state when slug matches", async () => {
    await makeJobWithPr("my-slug");

    const result = await resolveTarget({ slug: "my-slug", cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.slug).toBe("my-slug");
    expect(result.target.prNumber).toBe(42);
  });
});

describe("TC-003 / TC-134: <slug> multiple matches → latest updatedAt, stdout warning", () => {
  it("picks most recently updated state and emits stdout warning", async () => {
    // Older job in archive (section 1b)
    const olderJobId = randomUUID();
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-multi-slug");
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(path.join(archiveDir, "state.json"), JSON.stringify({
      version: 1, jobId: olderJobId,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/specrunner/drafts/multi-slug.md", title: "Test", type: "new-feature", slug: "multi-slug" },
      repository: { owner: "user", name: "repo" }, session: null,
      step: "pr-create", status: "archived", branch: "feat/multi-slug",
      pullRequest: { url: "https://github.com/user/repo/pull/42", number: 42, createdAt: "2026-01-01" },
      error: null, _journal: { historyCount: 0, stepCounts: {} },
    }, null, 2));
    await fs.writeFile(path.join(archiveDir, "events.jsonl"), "");

    // Newer job in active dir (section 1)
    const newer = await makeJobWithPr("multi-slug", "2026-06-01T00:00:00.000Z");

    const messages: string[] = [];
    const result = await resolveTarget({ slug: "multi-slug", cwd: tempDir }, (m) => messages.push(m));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.jobId).toBe(newer.jobId);
    expect(messages.some((m) => m.includes("Multiple states found for slug"))).toBe(true);
  });
});

describe("TC-004 / TC-131: no args → exit code 2 with Specify error", () => {
  it("returns exit code 2 when called with no args (auto-detect removed)", async () => {
    const result = await resolveTarget({ cwd: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("Specify <slug>, --pr, or --job");
  });
});

describe("TC-109: --pr <num> → headRefName → slug resolved", () => {
  it("strips feat/ prefix from headRefName and resolves slug", async () => {
    await makeJobWithPr("readme-status-section");

    const mockClient = {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", headRefName: "feat/readme-status-section", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    };

    const result = await resolveTarget({ prNumber: 48, cwd: tempDir, githubClient: mockClient, owner: "user", repo: "repo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.slug).toBe("readme-status-section");
  });
});

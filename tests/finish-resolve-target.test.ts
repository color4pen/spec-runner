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
import { JobStateStore } from "../src/store/job-state-store.js";
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

async function makeJobWithPr(slug: string, updatedAt?: string) {
  const state = await JobStateStore.create(tempDir, {
    request: { path: `/specrunner/drafts/${slug}.md`, title: "Test", type: "new-feature", slug },
    repository: { owner: "user", name: "repo" },
  });

  const jobsDir = path.join(tempDir, ".specrunner", "jobs");
  const statePath = path.join(jobsDir, `${state.jobId}.json`);
  const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
  raw.pullRequest = { url: `https://github.com/user/repo/pull/42`, number: 42, createdAt: "2026-01-01" };
  raw.branch = `feat/${slug}`;
  if (updatedAt) {
    raw.updatedAt = updatedAt;
  }
  await fs.writeFile(statePath, JSON.stringify(raw, null, 2));
  return { ...raw, jobId: state.jobId };
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
    await makeJobWithPr("multi-slug", "2026-01-01T00:00:00.000Z");
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
    };

    const result = await resolveTarget({ prNumber: 48, cwd: tempDir, githubClient: mockClient, owner: "user", repo: "repo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.slug).toBe("readme-status-section");
  });
});

/**
 * Tests for finish command: input resolution (resolveTarget).
 *
 * TC-001: --job <jobId> resolves state file
 * TC-002: <slug> positional resolves single match
 * TC-003: <slug> multiple matches → picks latest updatedAt + stdout warning (TC-134)
 * TC-004: active 1 entry → auto-detect
 * TC-005: active 0 entries → exit code 2
 * TC-006: active 2+ entries → exit code 2
 * TC-109: --pr <num> → headRefName → slug resolved
 * TC-131: No request in active → escalation message
 * TC-132: Multiple slugs in active → escalation with list
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { resolveTarget } from "../src/core/finish/resolve-target.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-resolve-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobWithPr(slug: string, updatedAt?: string) {
  const state = await createJobState({
    request: { path: `/specrunner/requests/active/${slug}/request.md`, title: "Test", type: "new-feature", slug },
    repository: { owner: "user", name: "repo" },
  });

  // Manually inject pullRequest and branch into the state file
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
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

// TC-001: --job resolves state file
describe("TC-001: --job resolves state file", () => {
  it("returns correct prNumber, branch, slug from state file", async () => {
    const job = await makeJobWithPr("my-slug");

    const result = await resolveTarget({ jobId: job.jobId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.jobId).toBe(job.jobId);
    expect(result.target.prNumber).toBe(42);
    expect(result.target.branch).toBe("feat/my-slug");
    expect(result.target.slug).toBe("my-slug");
  });
});

// TC-002: <slug> positional resolves single match
describe("TC-002: <slug> positional resolves single match", () => {
  it("returns the single matching state when slug matches", async () => {
    await makeJobWithPr("my-slug");

    const result = await resolveTarget({ slug: "my-slug" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.slug).toBe("my-slug");
    expect(result.target.prNumber).toBe(42);
  });
});

// TC-003 / TC-134: <slug> multiple matches → latest updatedAt, stdout warning
describe("TC-003 / TC-134: <slug> multiple matches → latest updatedAt, stdout warning", () => {
  it("picks most recently updated state and emits stdout warning", async () => {
    // Create two jobs with same slug, different updatedAt
    await makeJobWithPr("multi-slug", "2026-01-01T00:00:00.000Z");
    const newer = await makeJobWithPr("multi-slug", "2026-06-01T00:00:00.000Z");

    const messages: string[] = [];
    const result = await resolveTarget({ slug: "multi-slug" }, (m) => messages.push(m));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should pick the newer one
    expect(result.target.jobId).toBe(newer.jobId);
    // Should have warning about multiple matches (TC-134: "Multiple states found for slug ...")
    expect(messages.some((m) => m.includes("Multiple states found for slug"))).toBe(true);
  });
});

// TC-004: active 1 entry → auto-detect
describe("TC-004: active 1 entry → auto-detect", () => {
  it("auto-detects the single active slug", async () => {
    // Create a flat .md file for the slug
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(path.join(activeDir, "auto-slug.md"), "# auto-slug\n");

    // Create matching job state
    await makeJobWithPr("auto-slug");

    const messages: string[] = [];
    const result = await resolveTarget({ cwd: tempDir }, (m) => messages.push(m));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.slug).toBe("auto-slug");
    expect(messages.some((m) => m.includes("Auto-detected"))).toBe(true);
  });
});

// TC-005 / TC-131: active 0 entries → exit code 2
describe("TC-005 / TC-131: active 0 entries → exit code 2", () => {
  it("returns exit code 2 when active is empty", async () => {
    // Create empty active dir
    const activeDir = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(activeDir, { recursive: true });

    const result = await resolveTarget({ cwd: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.exitCode).toBe(2);
    // TC-131 message format
    expect(result.message).toContain("No request found in active/");
  });
});

// TC-006 / TC-132: active 2+ entries → exit code 2
describe("TC-006 / TC-132: active 2+ entries → exit code 2", () => {
  it("returns exit code 2 with slug list when multiple active slugs", async () => {
    // Create two flat .md files
    const base = path.join(tempDir, "specrunner", "requests", "active");
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, "slug-a.md"), "# slug-a\n");
    await fs.writeFile(path.join(base, "slug-b.md"), "# slug-b\n");

    const result = await resolveTarget({ cwd: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.exitCode).toBe(2);
    // TC-132 message format
    expect(result.message).toContain("Multiple slugs in active/:");
    expect(result.message).toContain("slug-a");
    expect(result.message).toContain("slug-b");
  });
});

// TC-109: --pr <num> → headRefName → slug resolved
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
    };

    const result = await resolveTarget({ prNumber: 48, cwd: tempDir, githubClient: mockClient, owner: "user", repo: "repo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.slug).toBe("readme-status-section");
  });
});

/**
 * Tests for finish command: input resolution (resolveTarget).
 *
 * TC-001: jobId resolves state file
 * TC-002: --slug resolves single match
 * TC-003: --slug multiple matches → picks latest updatedAt + stdout warning
 * TC-004: awaiting-merge 1 entry → auto-detect
 * TC-005: awaiting-merge 0 entries → exit code 2
 * TC-006: awaiting-merge 2+ entries → exit code 2
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
    request: { path: `/openspec-workflow/requests/active/${slug}`, title: "Test", type: "new-feature" },
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

// TC-001
describe("TC-001: jobId resolves state file", () => {
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

// TC-002
describe("TC-002: --slug resolves single match", () => {
  it("returns the single matching state when slug matches", async () => {
    await makeJobWithPr("my-slug");

    const result = await resolveTarget({ slug: "my-slug" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.slug).toBe("my-slug");
    expect(result.target.prNumber).toBe(42);
  });
});

// TC-003
describe("TC-003: --slug multiple matches → latest updatedAt, stdout warning", () => {
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
    // Should have warning about multiple matches
    expect(messages.some((m) => m.includes("Multiple jobs"))).toBe(true);
  });
});

// TC-004
describe("TC-004: awaiting-merge 1 entry → auto-detect", () => {
  it("auto-detects the single awaiting-merge slug", async () => {
    // Create the awaiting-merge dir with one slug
    const awaitingMergeDir = path.join(tempDir, "openspec-workflow", "requests", "awaiting-merge", "auto-slug");
    await fs.mkdir(awaitingMergeDir, { recursive: true });

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

// TC-005
describe("TC-005: awaiting-merge 0 entries → exit code 2", () => {
  it("returns exit code 2 when awaiting-merge is empty", async () => {
    // Create empty awaiting-merge dir
    const awaitingMergeDir = path.join(tempDir, "openspec-workflow", "requests", "awaiting-merge");
    await fs.mkdir(awaitingMergeDir, { recursive: true });

    const result = await resolveTarget({ cwd: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("No awaiting-merge");
  });
});

// TC-006
describe("TC-006: awaiting-merge 2+ entries → exit code 2", () => {
  it("returns exit code 2 with slug list when multiple await-merge slugs", async () => {
    // Create two awaiting-merge dirs
    const base = path.join(tempDir, "openspec-workflow", "requests", "awaiting-merge");
    await fs.mkdir(path.join(base, "slug-a"), { recursive: true });
    await fs.mkdir(path.join(base, "slug-b"), { recursive: true });

    const result = await resolveTarget({ cwd: tempDir });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("Multiple awaiting-merge");
    expect(result.message).toContain("slug-a");
    expect(result.message).toContain("slug-b");
  });
});

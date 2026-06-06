/**
 * Integration test: AC1 — list() / resolveId() do not readdir .specrunner/jobs/
 *
 * TC-001: list() does not call fs.readdir on getJobsDir(repoRoot)
 * TC-007: resolveId() does not call fs.readdir on getJobsDir(repoRoot)
 * TC-037: separate-branch active local job appears in list()
 * TC-038: active managed job appears in list()
 * TC-039: managed section 4 (marker → jobs-dir) preserved — no jobs-dir readdir
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../src/store/job-state-store.js";
import { getJobsDir } from "../src/util/xdg.js";

// Wrap fs.readdir and fs.writeFile in vi.fn() so we can spy on them in ESM.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: vi.fn(actual.readdir.bind(actual)),
  };
});

import * as fs from "node:fs/promises";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-no-readdir-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.mocked(fs.readdir).mockClear();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write a minimal slug state.json to the given directory.
 */
async function writeSlugState(
  dir: string,
  jobId: string,
  status: string,
  slug: string,
  updatedAt = "2026-01-01T00:00:00.000Z",
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status,
    branch: `change/${slug}`,
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(stateJson));
  await fs.writeFile(path.join(dir, "events.jsonl"), "");
}

async function writeLiveness(slug: string, jobId: string, worktreePath: string | null): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath, pid: 1234 }),
  );
}

async function writeMarker(slug: string, jobId: string): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "marker.json"),
    JSON.stringify({ slug, jobId, status: "running" }),
  );
}

// TC-001: list() does not readdir the jobs-dir
describe("TC-001: list() does not readdir .specrunner/jobs/", () => {
  it("never calls fs.readdir on getJobsDir(repoRoot)", async () => {
    const slug = "active-job";
    const jobId = "aaaa1111-0000-0000-0000-000000000001";

    // Write state to main-checkout slug dir (section 1)
    const stateDir = path.join(tempDir, "specrunner", "changes", slug);
    await writeSlugState(stateDir, jobId, "running", slug);

    // Also create jobs-dir (to ensure it exists, but list() should not readdir it)
    const jobsDir = getJobsDir(tempDir);
    await fs.mkdir(jobsDir, { recursive: true });

    // Clear call tracking after setup
    vi.mocked(fs.readdir).mockClear();

    await JobStateStore.list(tempDir);

    // Verify readdir was NOT called on getJobsDir root
    const jobsDirCalls = vi.mocked(fs.readdir).mock.calls.filter(
      ([arg]) => String(arg) === jobsDir,
    );
    expect(jobsDirCalls).toHaveLength(0);

    // But the job should still be found (via section 1 — changes dir)
    const states = await JobStateStore.list(tempDir);
    expect(states.some((s) => s.jobId === jobId)).toBe(true);
  });
});

// TC-007: resolveId() does not readdir the jobs-dir
describe("TC-007: resolveId() does not readdir .specrunner/jobs/", () => {
  it("never calls fs.readdir on getJobsDir(repoRoot) during prefix resolution", async () => {
    const slug = "prefix-test-slug";
    const jobId = "bbbb1111-0000-0000-0000-000000000001";

    // Write sidecar so resolveId can find via sidecar union
    await writeLiveness(slug, jobId, null);

    // Also create jobs-dir (should NOT be readdir'd)
    const jobsDir = getJobsDir(tempDir);
    await fs.mkdir(jobsDir, { recursive: true });

    // Clear call tracking after setup
    vi.mocked(fs.readdir).mockClear();

    const prefix = jobId.slice(0, 8);
    const resolved = await JobStateStore.resolveId(tempDir, prefix);
    expect(resolved).toBe(jobId);

    const jobsDirCalls = vi.mocked(fs.readdir).mock.calls.filter(
      ([arg]) => String(arg) === jobsDir,
    );
    expect(jobsDirCalls).toHaveLength(0);
  });
});

// TC-037: separate-branch active local job appears in list()
describe("TC-037: separate-branch active local job visible in list()", () => {
  it("job in a non-current worktree appears via worktrees scan", async () => {
    const slug = "cross-branch-slug";
    const jobId = "cccc1111-0000-0000-0000-000000000001";

    // Write state in a simulated worktree under .git/specrunner-worktrees/
    const worktreeName = `${slug}-${jobId.slice(0, 8)}`;
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", worktreeName);
    const stateDir = path.join(worktreePath, "specrunner", "changes", slug);
    await writeSlugState(stateDir, jobId, "running", slug);

    const states = await JobStateStore.list(tempDir);
    expect(states.some((s) => s.jobId === jobId)).toBe(true);
    const found = states.find((s) => s.jobId === jobId);
    expect(found?.status).toBe("running");
  });
});

// TC-038: active managed job appears in list()
describe("TC-038: active managed job visible in list()", () => {
  it("managed job with marker → jobs-dir state is in list()", async () => {
    const slug = "managed-active-slug";
    const jobId = "dddd1111-0000-0000-0000-000000000001";

    // Write managed marker
    await writeMarker(slug, jobId);

    // Write managed state to jobs-dir (section 4 reads this via readFile, not readdir)
    const jobsDir = path.join(tempDir, ".specrunner", "jobs", jobId);
    await writeSlugState(jobsDir, jobId, "running", slug);

    const states = await JobStateStore.list(tempDir);
    expect(states.some((s) => s.jobId === jobId)).toBe(true);
  });
});

// TC-039: managed section 4 is preserved — no jobs-dir readdir
describe("TC-039: managed section 4 preserved — no jobs-dir readdir", () => {
  it("managed job found via marker readFile, not jobs-dir readdir", async () => {
    const slug = "managed-no-readdir";
    const jobId = "eeee1111-0000-0000-0000-000000000001";

    await writeMarker(slug, jobId);

    const jobsDir = path.join(tempDir, ".specrunner", "jobs", jobId);
    await writeSlugState(jobsDir, jobId, "running", slug);

    const jobsDirRoot = getJobsDir(tempDir);
    await fs.mkdir(jobsDirRoot, { recursive: true });

    // Clear call tracking after setup
    vi.mocked(fs.readdir).mockClear();

    const states = await JobStateStore.list(tempDir);
    expect(states.some((s) => s.jobId === jobId)).toBe(true);

    // Jobs-dir root should NOT be readdir'd (section 3 is gone)
    const jobsDirRootCalls = vi.mocked(fs.readdir).mock.calls.filter(
      ([arg]) => String(arg) === jobsDirRoot,
    );
    expect(jobsDirRootCalls).toHaveLength(0);
  });
});

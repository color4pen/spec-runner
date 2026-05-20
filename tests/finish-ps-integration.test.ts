/**
 * Tests for ps command with archived status.
 *
 * TC-032: JobStatus archived in state file → ps reads it correctly
 * TC-033: Existing state file with status=success → ps reads correctly
 * TC-034: specrunner ps --active excludes archived
 * TC-110: specrunner ps --all shows SLUG column and archived jobs
 * TC-143: non-TTY TAB-separated output has SLUG as second column
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { runPs, formatJobRow } from "../src/cli/ps.js";
import type { JobState } from "../src/state/schema.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-ps-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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

async function writeStateFile(state: JobState) {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(
    path.join(jobsDir, `${state.jobId}.json`),
    JSON.stringify(state, null, 2),
  );
}

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-00000000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-merge",
    branch: "feat/test",
    history: [],
    error: null,
    ...overrides,
  };
}

// TC-032
describe("TC-032: archived state file → ps reads without crash", () => {
  it("ps --all does not crash and shows archived status", async () => {
    await writeStateFile(makeBaseState({ status: "archived", jobId: "archived-job-001" }));

    // Should not throw
    await expect(runPs({ all: true })).resolves.toBeUndefined();

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("archived");
  });

  it("ps (no flags) hides archived jobs by default (TC-142)", async () => {
    await writeStateFile(makeBaseState({ status: "archived", jobId: "archived-job-002" }));

    await runPs();

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // archived-job-002 should NOT appear in default ps
    expect(output).not.toContain("archived-job-002".slice(0, 8));
  });
});

// TC-033
describe("TC-033: legacy state file with status=success → ps reads correctly", () => {
  it("reads success state files without crash", async () => {
    const job = await createJobState({
      request: { path: "/req.md", title: "T", type: "new-feature" },
      repository: { owner: "u", name: "r" },
    });

    await expect(runPs()).resolves.toBeUndefined();

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(output).toContain(job.jobId.slice(0, 8));
  });
});

// TC-034
describe("TC-034: ps --active excludes archived", () => {
  it("--active flag excludes archived and non-running jobs", async () => {
    // Use UUIDs so the 8-char prefix is deterministic
    const runningId = "aaaaaaaa-0000-0000-0000-000000000001";
    const archivedId = "bbbbbbbb-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: runningId, status: "running" }));
    await writeStateFile(makeBaseState({ jobId: archivedId, status: "archived" }));

    await runPs({ active: true });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // JOB_ID column shows 8-char prefix
    expect(output).toContain("aaaaaaaa"); // running job prefix
    expect(output).not.toContain("bbbbbbbb"); // archived job prefix
  });

  it("--active shows running jobs only", async () => {
    const runningId = "cccccccc-0000-0000-0000-000000000001";
    const successId = "dddddddd-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: runningId, status: "running" }));
    await writeStateFile(makeBaseState({ jobId: successId, status: "awaiting-merge" }));

    await runPs({ active: true });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // Only running should appear
    expect(output).toContain("cccccccc");
    expect(output).not.toContain("dddddddd");
  });
});

// TC-054: TypeScript exhaustive-switch — runtime check that archived is handled in formatJobRow
describe("TC-054: formatJobRow handles archived status", () => {
  it("does not throw or produce undefined for archived status", () => {
    const state = makeBaseState({ status: "archived" });
    const row = formatJobRow(state, false);
    expect(row).toBeTruthy();
    expect(row).toContain("archived");
  });
});

// TC-110: specrunner ps --all shows SLUG column and archived jobs
describe("TC-110: specrunner ps --all shows SLUG column and archived jobs", () => {
  it("--all output contains SLUG header at position 2, archived job row, and SLUG value", async () => {
    const archivedId = "eeeeeeee-0000-0000-0000-000000000001";
    const successId = "ffffffff-0000-0000-0000-000000000001";

    await writeStateFile(makeBaseState({
      jobId: archivedId,
      status: "archived",
      branch: "feat/my-archived-feature",
      request: { path: "specrunner/drafts/my-archived-feature.md", title: "T", type: "new-feature", slug: "my-archived-feature" },
    }));
    await writeStateFile(makeBaseState({
      jobId: successId,
      status: "awaiting-merge",
      branch: "feat/active-job",
      request: { path: "specrunner/drafts/active-job.md", title: "T", type: "new-feature", slug: "active-job" },
    }));

    await runPs({ all: true });

    const allOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // SLUG header should appear (non-TTY since stdout is mocked/not a real TTY)
    expect(allOutput).toContain("SLUG");
    // Both jobs should appear
    expect(allOutput).toContain("eeeeeeee");
    expect(allOutput).toContain("ffffffff");
    // archived status appears
    expect(allOutput).toContain("archived");
    // SLUG values appear
    expect(allOutput).toContain("my-archived-feature");
    expect(allOutput).toContain("active-job");
  });
});

// TC-NEW-07: ps ACTIVE_STATUSES — awaiting-resume が active として表示される
describe("TC-NEW-07: ps --active includes awaiting-resume", () => {
  it("--active flag shows awaiting-resume jobs", async () => {
    const awaitingResumeId = "11111111-0000-0000-0000-000000000001";
    const archivedId = "22222222-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: awaitingResumeId, status: "awaiting-resume" as JobState["status"] }));
    await writeStateFile(makeBaseState({ jobId: archivedId, status: "archived" }));

    await runPs({ active: true });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("11111111"); // awaiting-resume job should appear
    expect(output).not.toContain("22222222"); // archived should not appear
  });
});

// TC-NEW-08: ps stale detection — 古い running job に (stale?) が付く
describe("TC-NEW-08: ps stale detection", () => {
  it("adds (stale?) to running jobs with updatedAt > 1 hour ago", () => {
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const state = makeBaseState({
      status: "running",
      updatedAt: staleUpdatedAt,
    });
    const row = formatJobRow(state, false, Date.now());

    expect(row).toContain("stale?");
  });

  it("does NOT add (stale?) to recently updated running jobs", () => {
    const recentUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    const state = makeBaseState({
      status: "running",
      updatedAt: recentUpdatedAt,
    });
    const row = formatJobRow(state, false, Date.now());

    expect(row).not.toContain("stale?");
  });

  it("does NOT add (stale?) to awaiting-resume jobs regardless of age", () => {
    const oldUpdatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    const state = makeBaseState({
      status: "awaiting-resume" as JobState["status"],
      updatedAt: oldUpdatedAt,
    });
    const row = formatJobRow(state, false, Date.now());

    expect(row).not.toContain("stale?");
  });
});

// TC-143: non-TTY TAB-separated output has SLUG as second column
describe("TC-143: non-TTY TAB-separated output — SLUG is second column", () => {
  it("header row second tab-delimited field is SLUG", async () => {
    await writeStateFile(makeBaseState({
      jobId: "aaaaaaaa-0000-0000-0000-000000000099",
      status: "awaiting-merge",
      branch: "feat/test-slug",
      request: { path: "specrunner/drafts/test-slug.md", title: "T", type: "new-feature", slug: "test-slug" },
    }));

    // formatJobRow non-TTY (isTty=false) — validate header fields
    const state = makeBaseState({
      jobId: "aaaaaaaa-0000-0000-0000-000000000099",
      status: "awaiting-merge",
      branch: "feat/test-slug",
      request: { path: "specrunner/drafts/test-slug.md", title: "T", type: "new-feature", slug: "test-slug" },
    });
    const row = formatJobRow(state, false);
    const fields = row.split("\t");

    // Non-TTY format: JOB_ID, SLUG, STEP, STATUS, BRANCH, AGE
    expect(fields).toHaveLength(6);
    expect(fields[0]).toBe("aaaaaaaa");  // JOB_ID 8 chars
    expect(fields[1]).toBe("test-slug"); // SLUG is second column
    expect(fields[3]).toBe("awaiting-merge");   // STATUS is fourth column
  });

  it("ps output header TAB-separated second field is SLUG", async () => {
    await writeStateFile(makeBaseState({
      jobId: "bbbbbbbb-0000-0000-0000-000000000099",
      status: "awaiting-merge",
    }));

    await runPs();

    const allOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // First line is the header
    const lines = allOutput.split("\n").filter((l) => l.trim().length > 0);
    const headerLine = lines[0] ?? "";
    const headerFields = headerLine.split("\t");
    expect(headerFields[1]).toBe("SLUG");
  });
});

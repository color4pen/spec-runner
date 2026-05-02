/**
 * Tests for ps command with archived status.
 *
 * TC-032: JobStatus archived in state file → ps reads it correctly
 * TC-033: Existing state file with status=success → ps reads correctly
 * TC-034: specrunner ps --active excludes archived
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
    status: "success",
    branch: "feat/test",
    history: [],
    error: null,
    ...overrides,
  };
}

// TC-032
describe("TC-032: archived state file → ps reads without crash", () => {
  it("ps does not crash and shows archived status", async () => {
    await writeStateFile(makeBaseState({ status: "archived", jobId: "archived-job-001" }));

    // Should not throw
    await expect(runPs()).resolves.toBeUndefined();

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("archived");
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
    await writeStateFile(makeBaseState({ jobId: successId, status: "success" }));

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

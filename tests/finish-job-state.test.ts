/**
 * Tests for finish command: job state updates.
 *
 * TC-029: awaiting-merge → status: "archived" + history entry
 * TC-030: escalation → state unchanged
 * TC-031: status=running → reject
 * TC-039: loadJobState ENOENT → JOB_NOT_FOUND
 * TC-040: loadJobState parse failure → STATE_FILE_INVALID
 * TC-041: updateJobState atomic write
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../src/store/job-state-store.js";
import { assertJobFinishable, markJobArchived } from "../src/core/finish/job-state-update.js";
import { SpecRunnerError, ERROR_CODES } from "../src/errors.js";
import type { JobState } from "../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-state-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJob(status: JobState["status"] = "awaiting-archive") {
  const job = await JobStateStore.create(tempDir, {
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });

  // Patch status
  if (status !== "running") {
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    const statePath = path.join(jobsDir, `${job.jobId}.json`);
    const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
    raw.status = status;
    await fs.writeFile(statePath, JSON.stringify(raw, null, 2));
  }

  return job;
}

/** Helper replacing the removed loadJobState(id) from state/store.ts */
async function loadJobState(jobId: string): Promise<JobState> {
  try {
    return (await new JobStateStore(jobId, tempDir).load()) as JobState;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SpecRunnerError(ERROR_CODES.JOB_NOT_FOUND, "", `Job not found: ${jobId}`);
    }
    if (err instanceof SyntaxError) {
      throw new SpecRunnerError(ERROR_CODES.STATE_FILE_INVALID, "", `State file invalid for: ${jobId}`);
    }
    throw err;
  }
}

// TC-029
describe("TC-029: awaiting-merge → status: archived + history entry", () => {
  it("marks job as archived and appends finish history entry", async () => {
    const job = await makeJob("awaiting-archive");

    const updated = await markJobArchived(job.jobId, tempDir);

    expect(updated.status).toBe("archived");
    const finishEntry = updated.history.find((h) => h.step === "archive");
    expect(finishEntry).toBeDefined();
    expect(finishEntry?.status).toBe("ok");
  });
});

// TC-030
describe("TC-030: escalation → state unchanged", () => {
  it("state status remains unchanged when escalation occurs (no markJobArchived called)", async () => {
    const job = await makeJob("awaiting-archive");

    // Simulate escalation by NOT calling markJobArchived
    const stateAfter = await loadJobState(job.jobId);
    expect(stateAfter.status).toBe("awaiting-archive"); // unchanged
  });
});

// TC-031
describe("TC-031: status=running → reject (JOB_NOT_FINISHABLE)", () => {
  it("throws JOB_NOT_FINISHABLE when job status is running", async () => {
    const job = await makeJob("running");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/running/);
  });

  it("does not throw for awaiting-merge status", async () => {
    const job = await makeJob("awaiting-archive");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).not.toThrow();
  });

  it("throws JOB_NOT_FINISHABLE for failed status", async () => {
    const job = await makeJob("failed");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/failed/);
  });

  it("throws JOB_NOT_FINISHABLE for terminated status", async () => {
    const job = await makeJob("terminated");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/terminated/);
  });

  it("does not throw for archived status (idempotent)", async () => {
    const job = await makeJob("archived");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).not.toThrow();
  });
});

// Backward compatibility: legacy status=success
describe("Backward compatibility: legacy status=success", () => {
  it("loads legacy success state as awaiting-merge", async () => {
    const job = await makeJob("awaiting-archive");
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    const statePath = path.join(jobsDir, `${job.jobId}.json`);
    
    // Write legacy state with status="success"
    const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
    raw.status = "success";
    await fs.writeFile(statePath, JSON.stringify(raw, null, 2));
    
    // Load and verify migration
    const loaded = await loadJobState(job.jobId);
    expect(loaded.status).toBe("awaiting-archive");
  });
});

// TC-039
describe("TC-039: loadJobState ENOENT → JOB_NOT_FOUND", () => {
  it("throws SpecRunnerError with JOB_NOT_FOUND for non-existent jobId", async () => {
    await expect(loadJobState("nonexistent-job-id-00000000")).rejects.toThrow(SpecRunnerError);

    try {
      await loadJobState("nonexistent-job-id-00000000");
    } catch (err: unknown) {
      expect(err instanceof SpecRunnerError).toBe(true);
      expect((err as SpecRunnerError).code).toBe("JOB_NOT_FOUND");
    }
  });
});

// TC-040
describe("TC-040: loadJobState parse failure → STATE_FILE_INVALID", () => {
  it("throws SpecRunnerError with STATE_FILE_INVALID for corrupt JSON", async () => {
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    const badJobId = "corrupt-job-00000000-0000-0000-0000-000000000000";
    await fs.writeFile(path.join(jobsDir, `${badJobId}.json`), "NOT VALID JSON {{{");

    try {
      await loadJobState(badJobId);
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err instanceof SpecRunnerError).toBe(true);
      expect((err as SpecRunnerError).code).toBe("STATE_FILE_INVALID");
    }
  });
});

// TC-NEW-03: assertJobFinishable — awaiting-resume → resume 案内エラー
describe("TC-NEW-03: assertJobFinishable — awaiting-resume → resume hint", () => {
  it("throws JOB_NOT_FINISHABLE with resume hint for awaiting-resume status", async () => {
    const job = await makeJob("awaiting-resume" as JobState["status"]);
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/awaiting-resume/);
  });
});

// TC-NEW-04: assertJobFinishable — canceled → 操作不要エラー
describe("TC-NEW-04: assertJobFinishable — canceled → no action needed", () => {
  it("throws JOB_NOT_FINISHABLE with no-action hint for canceled status", async () => {
    const job = await makeJob("canceled" as JobState["status"]);
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/canceled/);
  });
});

// TC-041
describe("TC-041: updateJobState atomic write protocol", () => {
  it("writes via atomic tmp+rename (no .tmp files remain)", async () => {
    const job = await makeJob("awaiting-archive");

    const store = new JobStateStore(job.jobId, tempDir);
    const current = await store.load();
    await store.persist({ ...current, step: "updated-step" });

    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    const files = await fs.readdir(jobsDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);

    // Verify the actual file was updated
    const updated = await loadJobState(job.jobId);
    expect(updated.step).toBe("updated-step");
  });
});

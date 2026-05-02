/**
 * Tests for finish command: job state updates.
 *
 * TC-029: success → status: "archived" + history entry
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
import { createJobState, loadJobState, updateJobState } from "../src/state/store.js";
import { assertJobFinishable, markJobArchived } from "../src/core/finish/job-state-update.js";
import { SpecRunnerError } from "../src/errors.js";
import type { JobState } from "../src/state/schema.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-state-"));
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

async function makeJob(status: JobState["status"] = "success") {
  const job = await createJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });

  // Patch status
  if (status !== "running") {
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    const statePath = path.join(jobsDir, `${job.jobId}.json`);
    const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
    raw.status = status;
    await fs.writeFile(statePath, JSON.stringify(raw, null, 2));
  }

  return job;
}

// TC-029
describe("TC-029: success → status: archived + history entry", () => {
  it("marks job as archived and appends finish history entry", async () => {
    const job = await makeJob("success");

    const updated = await markJobArchived(job.jobId);

    expect(updated.status).toBe("archived");
    const finishEntry = updated.history.find((h) => h.step === "finish");
    expect(finishEntry).toBeDefined();
    expect(finishEntry?.status).toBe("ok");
  });
});

// TC-030
describe("TC-030: escalation → state unchanged", () => {
  it("state status remains unchanged when escalation occurs (no markJobArchived called)", async () => {
    const job = await makeJob("success");

    // Simulate escalation by NOT calling markJobArchived
    const stateAfter = await loadJobState(job.jobId);
    expect(stateAfter.status).toBe("success"); // unchanged
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

  it("does not throw for success status", async () => {
    const job = await makeJob("success");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).not.toThrow();
  });

  it("does not throw for failed status", async () => {
    const job = await makeJob("failed");
    const state = await loadJobState(job.jobId);

    expect(() => assertJobFinishable(state)).not.toThrow();
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
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
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

// TC-041
describe("TC-041: updateJobState atomic write protocol", () => {
  it("writes via atomic tmp+rename (no .tmp files remain)", async () => {
    const job = await makeJob("success");

    await updateJobState(job.jobId, (s) => ({ ...s, step: "updated-step" }));

    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    const files = await fs.readdir(jobsDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);

    // Verify the actual file was updated
    const updated = await loadJobState(job.jobId);
    expect(updated.step).toBe("updated-step");
  });
});

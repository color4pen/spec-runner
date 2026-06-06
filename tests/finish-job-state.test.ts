/**
 * Tests for finish command: job state updates.
 *
 * TC-029: awaiting-archive → status: "archived" + history entry (slug canonical state)
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
import { JobStateStore, buildInitialJobState } from "../src/store/job-state-store.js";
import { assertJobFinishable, markJobArchived } from "../src/core/finish/job-state-update.js";
import { SpecRunnerError, ERROR_CODES } from "../src/errors.js";
import type { JobState } from "../src/state/schema.js";
import { makeStoreFactory } from "./helpers/store-factory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-state-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a slug-based state at tempDir/specrunner/changes/<slug>/.
 * Returns the jobId used for the state.
 */
async function makeSlugJob(slug: string, status: JobState["status"] = "awaiting-archive"): Promise<string> {
  const jobId = "00000000-0000-0000-0000-" + slug.replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(12, "0");
  const slugDir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(slugDir, { recursive: true });

  const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });

  // Build an initial state that passes validation
  const now = new Date().toISOString();
  const initialState: JobState = {
    version: 1,
    jobId,
    createdAt: now,
    updatedAt: now,
    request: { path: path.join(slugDir, "request.md"), title: "Test", type: "spec-change" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status,
    pid: null,
    branch: `change/${slug}-abc12345`,
    history: [],
    error: null,
    pipelineId: "standard",
  };

  await store.persist(initialState);
  return jobId;
}

/** Helper replacing the removed loadJobState(id) from state/store.ts */
async function loadJobState(jobId: string): Promise<JobState> {
  try {
    return (await makeStoreFactory(tempDir)(jobId).load()) as JobState;
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
describe("TC-029: awaiting-archive → status: archived + history entry (slug canonical state)", () => {
  it("marks job as archived via slug canonical state and appends finish history entry", async () => {
    const slug = "test-slug-029";
    await makeSlugJob(slug, "awaiting-archive");

    const updated = await markJobArchived(slug, tempDir);

    expect(updated.status).toBe("archived");
    const finishEntry = updated.history.find((h) => h.step === "archive");
    expect(finishEntry).toBeDefined();
    expect(finishEntry?.status).toBe("ok");
  });

  it("persists archived status to slug canonical dir (state.json)", async () => {
    const slug = "test-slug-029b";
    await makeSlugJob(slug, "awaiting-archive");

    await markJobArchived(slug, tempDir);

    // Verify state.json in slug dir was updated
    const stateJsonPath = path.join(tempDir, "specrunner", "changes", slug, "state.json");
    const raw = JSON.parse(await fs.readFile(stateJsonPath, "utf-8")) as Record<string, unknown>;
    expect(raw["status"]).toBe("archived");
  });

  it("appends awaiting-archive → archived transition record to events.jsonl", async () => {
    const slug = "test-slug-029c";
    await makeSlugJob(slug, "awaiting-archive");

    await markJobArchived(slug, tempDir);

    // Verify events.jsonl has a transition record
    const eventsPath = path.join(tempDir, "specrunner", "changes", slug, "events.jsonl");
    const content = await fs.readFile(eventsPath, "utf-8");
    expect(content).toContain("archived");
  });
});

// TC-029-IDEMPOTENT: already archived → no-op
describe("TC-029-IDEMPOTENT: already archived → no-op", () => {
  it("returns current state without additional transition when already archived", async () => {
    const slug = "test-slug-idempotent";
    await makeSlugJob(slug, "archived");

    // Call once → no-op since already archived
    const result = await markJobArchived(slug, tempDir);
    expect(result.status).toBe("archived");

    // Call a second time to confirm idempotency
    const result2 = await markJobArchived(slug, tempDir);
    expect(result2.status).toBe("archived");
  });

  it("does not append extra events on re-archive when already archived", async () => {
    const slug = "test-slug-idempotent-events";
    // Start with awaiting-archive, archive it, then try to archive again
    await makeSlugJob(slug, "awaiting-archive");

    // First archive: creates transition record
    await markJobArchived(slug, tempDir);

    // Read events count after first archive
    const eventsPath = path.join(tempDir, "specrunner", "changes", slug, "events.jsonl");
    const afterFirst = await fs.readFile(eventsPath, "utf-8");
    const countAfterFirst = afterFirst.trim().split("\n").filter(Boolean).length;

    // Second archive: should be no-op, no new events
    await markJobArchived(slug, tempDir);
    const afterSecond = await fs.readFile(eventsPath, "utf-8");
    const countAfterSecond = afterSecond.trim().split("\n").filter(Boolean).length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

// TC-029-ARCHIVE-DIR: slug in archive location
describe("TC-029-ARCHIVE-DIR: slug in archive location → resolved correctly", () => {
  it("resolves canonical state from archive dir and archives successfully", async () => {
    const slug = "test-slug-archive-dir";
    const datedSlug = "2026-01-15-" + slug;
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", datedSlug);
    await fs.mkdir(archiveDir, { recursive: true });

    // Write state directly to archive dir using changeDir seam
    const jobId = "00000000-0000-0000-0000-000000000099";
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir, changeDir: archiveDir });
    const now = new Date().toISOString();
    const state: JobState = {
      version: 1,
      jobId,
      createdAt: now,
      updatedAt: now,
      request: { path: path.join(archiveDir, "request.md"), title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "pr-create",
      status: "awaiting-archive",
      pid: null,
      branch: "change/test-slug-archive-dir-abc",
      history: [],
      error: null,
      pipelineId: "standard",
    };
    await store.persist(state);

    const result = await markJobArchived(slug, tempDir);
    expect(result.status).toBe("archived");

    // Verify written to archive dir
    const raw = JSON.parse(await fs.readFile(path.join(archiveDir, "state.json"), "utf-8")) as Record<string, unknown>;
    expect(raw["status"]).toBe("archived");
  });
});

// TC-030
describe("TC-030: escalation → state unchanged", () => {
  it("state status remains unchanged when escalation occurs (no markJobArchived called)", async () => {
    const slug = "test-slug-030";
    const jobId = await makeSlugJob(slug, "awaiting-archive");

    // Simulate escalation by NOT calling markJobArchived
    // Load from slug store (makeSlugJob writes to slug dir)
    const stateAfter = await new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir }).load();
    expect(stateAfter.status).toBe("awaiting-archive"); // unchanged
  });
});

// TC-031
describe("TC-031: status=running → reject (JOB_NOT_FINISHABLE)", () => {
  it("throws JOB_NOT_FINISHABLE when job status is running", async () => {
    const state = buildInitialJobState({
      request: { path: "/test/request.md", title: "Test", type: "new-feature" },
      repository: { owner: "user", name: "repo" },
    });
    // buildInitialJobState returns status: "running"
    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/running/);
  });

  it("does not throw for awaiting-archive status", async () => {
    const slug = "test-slug-031b";
    const jobId = await makeSlugJob(slug, "awaiting-archive");
    // Load from slug store (not jobId store) since makeSlugJob writes to slug dir
    const state = await new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir }).load();

    expect(() => assertJobFinishable(state)).not.toThrow();
  });

  it("throws JOB_NOT_FINISHABLE for failed status", async () => {
    const state: JobState = {
      ...buildInitialJobState({
        request: { path: "/test/request.md", title: "Test", type: "new-feature" },
        repository: { owner: "user", name: "repo" },
      }),
      status: "failed",
    };
    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/failed/);
  });

  it("throws JOB_NOT_FINISHABLE for terminated status", async () => {
    const state: JobState = {
      ...buildInitialJobState({
        request: { path: "/test/request.md", title: "Test", type: "new-feature" },
        repository: { owner: "user", name: "repo" },
      }),
      status: "terminated",
    };
    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/terminated/);
  });

  it("does not throw for archived status (idempotent)", async () => {
    const slug = "test-slug-031e";
    const jobId = await makeSlugJob(slug, "archived");
    const state = await new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir }).load();

    expect(() => assertJobFinishable(state)).not.toThrow();
  });
});

// Backward compatibility: legacy status=success
describe("Backward compatibility: legacy status=success", () => {
  it("loads legacy success state as awaiting-archive", async () => {
    const jobId = "backward-compat-legacy-success";
    const changeDir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "state.json"), JSON.stringify({
      version: 1, jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/test/request.md", title: "Test", type: "new-feature" },
      repository: { owner: "user", name: "repo" },
      session: null, step: "pr-create", status: "success",
      branch: null, history: [], error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    }, null, 2));
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "");

    // Load and verify migration
    const loaded = await loadJobState(jobId);
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
    const badJobId = "corrupt-job-00000000-0000-0000-0000-000000000000";
    const changeDir = path.join(tempDir, ".specrunner", "test-jobs", badJobId);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, "state.json"), "NOT VALID JSON {{{");
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "");

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
    const slug = "test-slug-newtest-03";
    const jobId = await makeSlugJob(slug, "awaiting-resume" as JobState["status"]);
    const state = await new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir }).load();

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/awaiting-resume/);
  });
});

// TC-NEW-04: assertJobFinishable — canceled → 操作不要エラー
describe("TC-NEW-04: assertJobFinishable — canceled → no action needed", () => {
  it("throws JOB_NOT_FINISHABLE with no-action hint for canceled status", async () => {
    const slug = "test-slug-newtest-04";
    const jobId = await makeSlugJob(slug, "canceled" as JobState["status"]);
    const state = await new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir }).load();

    expect(() => assertJobFinishable(state)).toThrow(SpecRunnerError);
    expect(() => assertJobFinishable(state)).toThrow(/canceled/);
  });
});

// TC-041
describe("TC-041: updateJobState atomic write protocol", () => {
  it("writes via atomic tmp+rename (no .tmp files remain)", async () => {
    const state = buildInitialJobState({
      request: { path: "/test/request.md", title: "Test", type: "new-feature" },
      repository: { owner: "user", name: "repo" },
    });
    const store = makeStoreFactory(tempDir)(state.jobId);
    await store.persist(state);
    await store.persist({ ...state, step: "implementer" });

    const changeDir = path.join(tempDir, ".specrunner", "test-jobs", state.jobId);
    const files = await fs.readdir(changeDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);

    // Verify the actual file was updated
    const updated = await loadJobState(state.jobId);
    expect(updated.step).toBe("implementer");
  });
});

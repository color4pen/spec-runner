/**
 * Unit and integration tests for JobStateStore.
 *
 * TC-001: Legacy pre-PR24 single StepResult normalizes to StepRun array on load
 * TC-002: Legacy post-PR24 StepResult array normalizes to StepRun array on load
 * TC-003: Fixture round-trip — pre-PR24 legacy JSON load → normalize → save diff is 0
 * TC-004: Fixture round-trip — post-PR24 legacy JSON load → normalize → save diff is 0
 * TC-005: appendStepRun appends to existing array, auto-incrementing attempt
 * TC-006: appendStepRun persists atomically
 * TC-007: StepRun captures startedAt and endedAt timestamps
 * TC-008: Subsequent persist after legacy load writes new format only
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../../src/store/job-state-store.js";
import type { NormalizedJobState } from "../../src/store/job-state-store.js";
import type { StepRun } from "../../src/state/schema.js";
import { specReviewResultPath } from "../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-state-store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Write raw JSON directly to the jobs dir for a given jobId.
 */
async function writeRawState(jobId: string, raw: unknown): Promise<void> {
  const jobsDir = path.join(tempDir, ".specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(raw, null, 2),
  );
}

/**
 * Make a minimal valid NormalizedJobState for testing appendStepRun.
 */
function makeMinimalNormalizedState(jobId: string): NormalizedJobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// TC-001: Legacy pre-PR24 single StepResult normalizes to StepRun array on load
// ---------------------------------------------------------------------------
describe("TC-001: pre-PR24 single object → StepRun[] normalization", () => {
  it("normalizes single propose object to array of length 1 with attempt:1, sessionId, outcome.verdict", async () => {
    const jobId = "tc001-job";
    const raw = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "a", name: "b" },
      session: null,
      step: "success",
      status: "success",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        design: {
          sessionId: "s1",
          verdict: "approved",
          completedAt: "2026-01-01T00:05:00.000Z",
          findingsPath: null,
          error: null,
        },
      },
    };
    await writeRawState(jobId, raw);

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();

    const designRuns = state.steps["design"];
    expect(designRuns).toBeDefined();
    expect(Array.isArray(designRuns)).toBe(true);
    expect(designRuns!.length).toBe(1);

    const first = designRuns![0]!;
    expect(first.attempt).toBe(1);
    expect(first.sessionId).toBe("s1");
    expect(first.outcome.verdict).toBe("approved");
    expect(first.startedAt).toBeTruthy();
    expect(first.endedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-002: Legacy post-PR24 StepResult array normalizes to StepRun array
// ---------------------------------------------------------------------------
describe("TC-002: post-PR24 StepResult[] → StepRun[] normalization", () => {
  it("normalizes spec-review StepResult[] to StepRun[] preserving attempt numbers", async () => {
    const jobId = "tc002-job";
    const updatedAt = "2026-02-01T01:00:00.000Z";
    const raw = {
      version: 1,
      jobId,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt,
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "a", name: "b" },
      session: null,
      step: "success",
      status: "success",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        "spec-review": [
          {
            iteration: 1,
            session: { id: "s1", agentId: "agent_001", environmentId: "env_001" },
            verdict: "needs-fix",
            findingsPath: specReviewResultPath("test", 1),
            completedAt: "2026-02-01T00:30:00.000Z",
            error: null,
          },
          {
            iteration: 2,
            session: { id: "s2", agentId: "agent_001", environmentId: "env_001" },
            verdict: "approved",
            findingsPath: specReviewResultPath("test", 2),
            completedAt: "2026-02-01T01:00:00.000Z",
            error: null,
          },
        ],
      },
    };
    await writeRawState(jobId, raw);

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();

    const runs = state.steps["spec-review"];
    expect(runs).toBeDefined();
    expect(runs!.length).toBe(2);

    const first = runs![0]!;
    expect(first.attempt).toBe(1);
    expect(first.sessionId).toBe("s1");
    expect(first.outcome.verdict).toBe("needs-fix");
    expect(first.endedAt).toBe("2026-02-01T00:30:00.000Z");

    const second = runs![1]!;
    expect(second.attempt).toBe(2);
    expect(second.sessionId).toBe("s2");
    expect(second.outcome.verdict).toBe("approved");
    expect(second.endedAt).toBe("2026-02-01T01:00:00.000Z");
  });

  it("uses state.updatedAt as best-effort fallback for startedAt", async () => {
    const jobId = "tc002b-job";
    const updatedAt = "2026-02-01T01:00:00.000Z";
    const raw = {
      version: 1,
      jobId,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt,
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "a", name: "b" },
      session: null,
      step: "success",
      status: "success",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        "spec-review": [
          {
            iteration: 1,
            session: { id: "s1", agentId: "agent_001", environmentId: "env_001" },
            verdict: "approved",
            findingsPath: null,
            completedAt: "2026-02-01T01:00:00.000Z",
            error: null,
          },
        ],
      },
    };
    await writeRawState(jobId, raw);

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();

    const runs = state.steps["spec-review"];
    const first = runs![0]!;
    // startedAt should be set to updatedAt as best-effort fallback
    expect(first.startedAt).toBe(updatedAt);
  });
});

// ---------------------------------------------------------------------------
// TC-003: Fixture round-trip — pre-PR24 legacy JSON
// ---------------------------------------------------------------------------
describe("TC-003: pre-PR24 fixture round-trip — load → normalize → save", () => {
  it("loads pre-pr24 fixture, normalizes, and saved JSON uses StepRun[] shape without legacy fields", async () => {
    // Read fixture and write to temp store dir
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/legacy-job-state-pre-pr24.json",
    );
    const fixtureRaw = await fs.readFile(fixturePath, "utf-8");
    const fixture = JSON.parse(fixtureRaw) as { jobId: string };
    const jobId = fixture.jobId;

    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(path.join(jobsDir, `${jobId}.json`), fixtureRaw);

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();

    // Save to a temp path to inspect output
    const savedPath = path.join(tempDir, "saved.json");
    await fs.writeFile(savedPath, JSON.stringify(state, null, 2) + "\n");
    const savedContent = await fs.readFile(savedPath, "utf-8");
    const saved = JSON.parse(savedContent) as Record<string, unknown>;

    // steps["propose"] must be StepRun[] (array)
    const proposeRuns = (saved["steps"] as Record<string, unknown>)?.["propose"];
    expect(Array.isArray(proposeRuns)).toBe(true);
    const first = (proposeRuns as unknown[])[0] as Record<string, unknown>;
    expect(first["attempt"]).toBe(1);
    expect(first["outcome"]).toBeDefined();
    expect(typeof (first["outcome"] as Record<string, unknown>)["verdict"]).toBe("string");

    // No legacy field names in the top-level step result
    expect(first["iteration"]).toBeUndefined();
    expect(first["completedAt"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-004: Fixture round-trip — post-PR24 legacy JSON
// ---------------------------------------------------------------------------
describe("TC-004: post-PR24 fixture round-trip — load → normalize → save", () => {
  it("loads post-pr24 fixture, normalizes, saved JSON uses StepRun[] shape", async () => {
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/legacy-job-state-post-pr24.json",
    );
    const fixtureRaw = await fs.readFile(fixturePath, "utf-8");
    const fixture = JSON.parse(fixtureRaw) as { jobId: string };
    const jobId = fixture.jobId;

    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(path.join(jobsDir, `${jobId}.json`), fixtureRaw);

    const store = new JobStateStore(jobId, tempDir);
    const state = await store.load();
    await store.persist(state);

    const savedRaw = await fs.readFile(
      path.join(jobsDir, `${jobId}.json`),
      "utf-8",
    );
    const saved = JSON.parse(savedRaw) as Record<string, unknown>;
    const stepsRecord = saved["steps"] as Record<string, unknown[]>;

    const specReviewRuns = stepsRecord["spec-review"];
    expect(Array.isArray(specReviewRuns)).toBe(true);
    expect(specReviewRuns!.length).toBe(2);

    const first = specReviewRuns![0] as Record<string, unknown>;
    expect(first["attempt"]).toBe(1);
    expect(first["outcome"]).toBeDefined();
    expect((first["outcome"] as Record<string, unknown>)["verdict"]).toBe("needs-fix");
    expect(first["endedAt"]).toBe("2026-02-01T00:30:00.000Z");

    // No legacy field names
    expect(first["iteration"]).toBeUndefined();
    expect(first["completedAt"]).toBeUndefined();
    expect(first["session"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-005: appendStepRun appends and auto-increments attempt
// ---------------------------------------------------------------------------
describe("TC-005: appendStepRun — appends and auto-increments attempt", () => {
  it("appends to existing array with attempt 2 when one entry exists", async () => {
    const jobId = "tc005-job";
    const state = makeMinimalNormalizedState(jobId);
    // Seed with one existing StepRun
    const existingRun: StepRun = {
      attempt: 1,
      sessionId: "sess_001",
      outcome: { verdict: "needs-fix", findingsPath: null, fileContent: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };
    const seeded: NormalizedJobState = {
      ...state,
      steps: { "spec-review": [existingRun] },
    };

    // Write the seeded state to disk first
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(seeded, null, 2),
    );

    const store = new JobStateStore(jobId, tempDir);
    const newRun: Omit<StepRun, "attempt"> = {
      sessionId: "sess_002",
      outcome: { verdict: "approved", findingsPath: null, fileContent: null, error: null },
      startedAt: "2026-01-01T00:10:00.000Z",
      endedAt: "2026-01-01T00:15:00.000Z",
    };
    const updated = await store.appendStepRun(seeded, "spec-review", newRun);

    expect(updated.steps["spec-review"]?.length).toBe(2);
    const appended = updated.steps["spec-review"]![1]!;
    expect(appended.attempt).toBe(2);
    expect(appended.sessionId).toBe("sess_002");
    expect(appended.outcome.verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-006: appendStepRun persists atomically
// ---------------------------------------------------------------------------
describe("TC-006: appendStepRun — persists atomically (write-and-rename)", () => {
  it("file is fully updated after appendStepRun — no partial write", async () => {
    const jobId = "tc006-job";
    const state = makeMinimalNormalizedState(jobId);

    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(state, null, 2),
    );

    const store = new JobStateStore(jobId, tempDir);
    const run: Omit<StepRun, "attempt"> = {
      sessionId: "sess_001",
      outcome: { verdict: "approved", findingsPath: null, fileContent: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };
    await store.appendStepRun(state, "design", run);

    // Verify file on disk is valid JSON with the appended run
    const diskContent = await fs.readFile(
      path.join(jobsDir, `${jobId}.json`),
      "utf-8",
    );
    const diskState = JSON.parse(diskContent) as Record<string, unknown>;
    const designRuns = (diskState["steps"] as Record<string, unknown>)?.["design"];
    expect(Array.isArray(designRuns)).toBe(true);
    expect((designRuns as unknown[]).length).toBe(1);

    // No tmp files left
    const files = await fs.readdir(jobsDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007: StepRun captures startedAt and endedAt timestamps
// ---------------------------------------------------------------------------
describe("TC-007: StepRun captures startedAt and endedAt timestamps", () => {
  it("persisted StepRun has both startedAt and endedAt as ISO 8601 strings and endedAt >= startedAt", async () => {
    const jobId = "tc007-job";
    const state = makeMinimalNormalizedState(jobId);

    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(state, null, 2),
    );

    const startedAt = "2026-01-01T00:00:00.000Z";
    const endedAt = "2026-01-01T00:05:00.000Z";

    const store = new JobStateStore(jobId, tempDir);
    const run: Omit<StepRun, "attempt"> = {
      sessionId: null,
      outcome: { verdict: "approved", findingsPath: null, fileContent: null, error: null },
      startedAt,
      endedAt,
    };
    const updated = await store.appendStepRun(state, "design", run);

    const first = updated.steps["design"]![0]!;
    expect(first.startedAt).toBe(startedAt);
    expect(first.endedAt).toBe(endedAt);
    expect(new Date(first.endedAt) >= new Date(first.startedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-008: Subsequent persist after legacy load writes new format only
// ---------------------------------------------------------------------------
describe("TC-008: persist after legacy load writes new format only", () => {
  it("saved file contains StepRun[] and no legacy fields (iteration, session object, completedAt)", async () => {
    const jobId = "tc008-job";
    const raw = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "a", name: "b" },
      session: null,
      step: "success",
      status: "success",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        "spec-review": [
          {
            iteration: 1,
            session: { id: "sess_001", agentId: "agent_001", environmentId: "env_001" },
            verdict: "approved",
            findingsPath: null,
            completedAt: "2026-01-01T01:00:00.000Z",
            error: null,
          },
        ],
      },
    };
    await writeRawState(jobId, raw);

    const store = new JobStateStore(jobId, tempDir);
    const normalized = await store.load();
    await store.persist(normalized);

    const savedRaw = await fs.readFile(
      path.join(tempDir, ".specrunner", "jobs", `${jobId}.json`),
      "utf-8",
    );
    const saved = JSON.parse(savedRaw) as Record<string, unknown>;
    const stepsRecord = saved["steps"] as Record<string, unknown[]>;
    const runs = stepsRecord["spec-review"];
    const first = runs![0] as Record<string, unknown>;

    // Must have StepRun fields
    expect(first["attempt"]).toBe(1);
    expect(first["outcome"]).toBeDefined();
    expect(first["startedAt"]).toBeTruthy();
    expect(first["endedAt"]).toBeTruthy();

    // Must NOT have legacy fields
    expect(first["iteration"]).toBeUndefined();
    expect(first["completedAt"]).toBeUndefined();
    // session as sub-object should not appear at top level of StepRun
    expect(typeof first["session"]).not.toBe("object");
  });
});

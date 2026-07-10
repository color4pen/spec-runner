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
import { SpecRunnerError, ERROR_CODES } from "../../src/errors.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-state-store-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Write raw JSON directly to a changeDir for a given jobId.
 * Returns the changeDir path and a store for it.
 */
async function writeRawState(jobId: string, raw: unknown): Promise<{ changeDir: string; store: JobStateStore }> {
  const changeDir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(changeDir, { recursive: true });
  await fs.writeFile(
    path.join(changeDir, "state.json"),
    JSON.stringify(raw, null, 2),
  );
  await fs.writeFile(path.join(changeDir, "events.jsonl"), "");
  const store = new JobStateStore(jobId, tempDir, { changeDir });
  return { changeDir, store };
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
    const { store } = await writeRawState(jobId, raw);
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
    const { store } = await writeRawState(jobId, raw);
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
    const { store } = await writeRawState(jobId, raw);
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
    // Read fixture and write to temp changeDir
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/legacy-job-state-pre-pr24.json",
    );
    const fixtureRaw = await fs.readFile(fixturePath, "utf-8");
    const fixture = JSON.parse(fixtureRaw) as { jobId: string };
    const jobId = fixture.jobId;

    const { store } = await writeRawState(jobId, fixture);
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
  it("loads post-pr24 fixture, normalizes, reloaded state uses StepRun[] shape", async () => {
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/legacy-job-state-post-pr24.json",
    );
    const fixtureRaw = await fs.readFile(fixturePath, "utf-8");
    const fixture = JSON.parse(fixtureRaw) as { jobId: string };
    const jobId = fixture.jobId;

    const { store } = await writeRawState(jobId, fixture);
    const state = await store.load();
    await store.persist(state);

    // After persist, reload via store to verify
    const reloaded = await store.load();
    const specReviewRuns = reloaded.steps["spec-review"];

    expect(Array.isArray(specReviewRuns)).toBe(true);
    expect(specReviewRuns!.length).toBe(2);

    const first = specReviewRuns![0]!;
    expect(first.attempt).toBe(1);
    expect(first.outcome).toBeDefined();
    expect(first.outcome.verdict).toBe("needs-fix");
    expect(first.endedAt).toBe("2026-02-01T00:30:00.000Z");

    // No legacy field names (StepRun shape)
    expect((first as unknown as Record<string, unknown>)["iteration"]).toBeUndefined();
    expect((first as unknown as Record<string, unknown>)["completedAt"]).toBeUndefined();
    expect((first as unknown as Record<string, unknown>)["session"]).toBeUndefined();
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
      outcome: { verdict: "needs-fix", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };
    const seeded: NormalizedJobState = {
      ...state,
      steps: { "spec-review": [existingRun] },
    };

    const { store } = await writeRawState(jobId, seeded);
    const newRun: Omit<StepRun, "attempt"> = {
      sessionId: "sess_002",
      outcome: { verdict: "approved", findingsPath: null, error: null },
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
  it("state is fully updated after appendStepRun — no partial write (changeDir layout)", async () => {
    const jobId = "tc006-job";
    const state = makeMinimalNormalizedState(jobId);

    const { store, changeDir } = await writeRawState(jobId, state);
    const run: Omit<StepRun, "attempt"> = {
      sessionId: "sess_001",
      outcome: { verdict: "approved", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };
    await store.appendStepRun(state, "design", run);

    // After persist, reload via store to verify
    const reloaded = await store.load();
    const designRuns = reloaded.steps["design"];
    expect(Array.isArray(designRuns)).toBe(true);
    expect(designRuns!.length).toBe(1);

    // No tmp files left in the changeDir
    const files = await fs.readdir(changeDir);
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

    const { store } = await writeRawState(jobId, state);

    const startedAt = "2026-01-01T00:00:00.000Z";
    const endedAt = "2026-01-01T00:05:00.000Z";

    const run: Omit<StepRun, "attempt"> = {
      sessionId: null,
      outcome: { verdict: "approved", findingsPath: null, error: null },
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
    const { store } = await writeRawState(jobId, raw);
    const normalized = await store.load();
    await store.persist(normalized);

    // After persist, reload via store to verify
    const reloaded = await store.load();
    const runs = reloaded.steps["spec-review"];
    const first = runs![0]!;

    // Must have StepRun fields
    expect(first.attempt).toBe(1);
    expect(first.outcome).toBeDefined();
    expect(first.startedAt).toBeTruthy();
    expect(first.endedAt).toBeTruthy();

    // Must NOT have legacy fields
    expect((first as unknown as Record<string, unknown>)["iteration"]).toBeUndefined();
    expect((first as unknown as Record<string, unknown>)["completedAt"]).toBeUndefined();
    // session as sub-object should not appear at top level of StepRun
    expect(typeof (first as unknown as Record<string, unknown>)["session"]).not.toBe("object");
  });
});

// ---------------------------------------------------------------------------
// TC-009: slug-mode persist strips machine-local values from state.json
// ---------------------------------------------------------------------------
describe("TC-009: slug-mode persist — worktreePath / pid / session absent from state.json", () => {
  it("state.json written in slug mode does not contain worktreePath, pid, or session", async () => {
    const jobId = "tc009-slug-strip";
    const slug = "tc009-slug";

    // Set up slug-based layout: {tempDir}/specrunner/changes/{slug}/
    const changeDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(changeDir, { recursive: true });
    const stateJsonPath = path.join(changeDir, "state.json");
    const eventsJsonlPath = path.join(changeDir, "events.jsonl");

    // Write an initial minimal state.json (slug mode — no machine-local fields)
    const initialStateJson = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { title: "Test", type: "feature" },
      repository: { owner: "testowner", name: "testrepo" },
      step: "design",
      status: "running",
      branch: `change/${slug}-${jobId.slice(0, 8)}`,
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(stateJsonPath, JSON.stringify(initialStateJson), "utf-8");
    await fs.writeFile(eventsJsonlPath, "", "utf-8");

    // Create slug-mode store and persist a state that includes machine-local values
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const loaded = await store.load();

    // Augment with machine-local values (as would exist in split-layout / legacy mode)
    const stateWithLocals = {
      ...loaded,
      worktreePath: "/some/local/path",
      pid: 12345,
      session: { id: "sess_001", agentId: "agent_001", environmentId: "env_001" },
    };

    // Persist in slug mode — machine-local fields must be stripped
    await store.persist(stateWithLocals);

    // Read raw bytes of state.json and verify no machine-local keys
    const rawJson = await fs.readFile(stateJsonPath, "utf-8");
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;

    expect(parsed["worktreePath"]).toBeUndefined();
    expect(parsed["pid"]).toBeUndefined();
    expect(parsed["session"]).toBeUndefined();

    // Sanity: cursor fields (status, step) must still be present
    expect(parsed["status"]).toBe("running");
    expect(parsed["jobId"]).toBe(jobId);
  });
});

// ---------------------------------------------------------------------------
// TC-017: changeDir 単独ストアが load() で changeDir/state.json を読む (D2)
// ---------------------------------------------------------------------------
describe("TC-017: changeDir-only store load() reads changeDir/state.json", () => {
  it("loads from changeDir/state.json when only changeDir is set (isSlugMode=false)", async () => {
    const jobId = "tc017-changeDir-load";

    // Write state.json to an arbitrary changeDir (simulates .specrunner/local/<slug>/)
    const changeDir = path.join(tempDir, ".specrunner", "local", "tc017-slug");
    await fs.mkdir(changeDir, { recursive: true });
    const stateJson = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "design",
      status: "running",
      branch: "change/tc017-slug",
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(changeDir, "state.json"), JSON.stringify(stateJson), "utf-8");
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");

    // Construct store with changeDir only (no slug, no stateRoot → isSlugMode=false)
    const store = new JobStateStore(jobId, tempDir, { changeDir });
    const loaded = await store.load();

    expect(loaded.jobId).toBe(jobId);
    expect(loaded.status).toBe("running");

    // Verify jobs-dir was NOT accessed (no file there)
    const jobsDir = path.join(tempDir, ".specrunner", "jobs", jobId);
    await expect(fs.access(jobsDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-018: changeDir + slug + stateRoot (isSlugMode=true) load() 挙動が不変 (D2)
// ---------------------------------------------------------------------------
describe("TC-018: changeDir + slug + stateRoot (isSlugMode=true) load() is unchanged", () => {
  it("loads via slug-mode (slugInject) when all three options are provided", async () => {
    const slug = "tc018-slug";
    const jobId = "tc018-slug-load";

    // Write state.json to changeDir (simulates archive or canonical dir)
    const changeDir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(changeDir, { recursive: true });
    const stateJson = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { title: "Test", type: "new-feature" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "design",
      status: "awaiting-resume",
      branch: `change/${slug}`,
      error: null,
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(changeDir, "state.json"), JSON.stringify(stateJson), "utf-8");
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");

    // changeDir + slug + stateRoot: isSlugMode()=true, slugInject should inject request fields
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir, changeDir });
    const loaded = await store.load();

    expect(loaded.jobId).toBe(jobId);
    expect(loaded.status).toBe("awaiting-resume");
    // slugInject: request.slug and request.path injected from convention
    expect(loaded.request.slug).toBe(slug);
    expect(loaded.request.path).toContain(slug);
  });
});

// ---------------------------------------------------------------------------
// T-04 tests: journal integrity fail-closed behavior
// ---------------------------------------------------------------------------

/**
 * Helper: write a minimal valid state.json + events.jsonl to a changeDir.
 * Returns the store and the paths.
 */
async function makeChangeDirStore(
  jobId: string,
  opts: {
    historyCount?: number;
    stepCounts?: Record<string, number>;
  } = {},
): Promise<{ store: JobStateStore; changeDir: string; eventsPath: string; stateJsonPath: string }> {
  const changeDir = path.join(tempDir, ".specrunner", "integrity-test", jobId);
  await fs.mkdir(changeDir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature" },
    repository: { owner: "u", name: "r" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    error: null,
    _journal: {
      historyCount: opts.historyCount ?? 0,
      stepCounts: opts.stepCounts ?? {},
    },
  };
  const stateJsonPath = path.join(changeDir, "state.json");
  const eventsPath = path.join(changeDir, "events.jsonl");
  await fs.writeFile(stateJsonPath, JSON.stringify(stateJson));
  await fs.writeFile(eventsPath, "");
  const store = new JobStateStore(jobId, tempDir, { changeDir });
  return { store, changeDir, eventsPath, stateJsonPath };
}

describe("T-04: load() fail-closed on corrupt journal", () => {
  it("throws JOURNAL_CORRUPTED when events.jsonl has a mid-journal invalid-json line", async () => {
    const jobId = "t04-load-corrupt-json";
    const { store, eventsPath } = await makeChangeDirStore(jobId);

    // Write: valid line, corrupt line, valid line
    const good = JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" });
    const bad = "NOT JSON AT ALL";
    const good2 = JSON.stringify({ type: "transition", ts: "2026-01-01T00:01:00Z", step: "design", status: "started", message: "m" });
    await fs.writeFile(eventsPath, [good, bad, good2].join("\n") + "\n");

    await expect(store.load()).rejects.toMatchObject({
      code: ERROR_CODES.JOURNAL_CORRUPTED,
    });
    await expect(store.load()).rejects.toBeInstanceOf(SpecRunnerError);
  });

  it("throws JOURNAL_CORRUPTED when a committed line parses as non-object (array)", async () => {
    const jobId = "t04-load-not-object";
    const { store, eventsPath } = await makeChangeDirStore(jobId);

    // Use 3 lines so the array line is a committed (non-tail) line
    const good = JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" });
    const arrayLine = JSON.stringify(["not", "an", "object"]);
    const good2 = JSON.stringify({ type: "transition", ts: "2026-01-01T00:01:00Z", step: "design", status: "started", message: "m" });
    await fs.writeFile(eventsPath, [good, arrayLine, good2].join("\n") + "\n");

    await expect(store.load()).rejects.toMatchObject({
      code: ERROR_CODES.JOURNAL_CORRUPTED,
    });
  });

  it("succeeds when journal has only a tail-partial (tail dropped, prior records restored)", async () => {
    const jobId = "t04-load-tail-partial";
    const { store, eventsPath } = await makeChangeDirStore(jobId);

    const good = JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" });
    const partial = '{"type":"transition","ts":"2026-01-01T00:01'; // truncated
    await fs.writeFile(eventsPath, [good, partial].join("\n"));

    const state = await store.load();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.step).toBe("init");
  });

  it("succeeds when events.jsonl is absent (no journal)", async () => {
    const jobId = "t04-load-no-events";
    const changeDir = path.join(tempDir, ".specrunner", "integrity-test", jobId);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, "state.json"),
      JSON.stringify({
        version: 1,
        jobId,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        request: { path: "/req.md", title: "Test", type: "new-feature" },
        repository: { owner: "u", name: "r" },
        session: null,
        step: "init",
        status: "running",
        branch: null,
        error: null,
        _journal: { historyCount: 0, stepCounts: {} },
      }),
    );
    // No events.jsonl written
    const store = new JobStateStore(jobId, tempDir, { changeDir });
    const state = await store.load();
    expect(state.history).toHaveLength(0);
  });
});

describe("T-04: persist() fail-closed on corrupt journal", () => {
  it("throws JOURNAL_CORRUPTED when events.jsonl has a mid-journal corrupt line", async () => {
    const jobId = "t04-persist-corrupt";
    // state.json has historyCount=0; we'll write 3 lines to events.jsonl to ensure bad line is committed
    const { store, eventsPath } = await makeChangeDirStore(jobId);

    // 3 lines: good, CORRUPT, good — so the corrupt line is committed (not tail-partial)
    const good = JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" });
    const bad = "CORRUPT LINE";
    const good2 = JSON.stringify({ type: "transition", ts: "2026-01-01T00:01:00Z", step: "design", status: "started", message: "m2" });
    await fs.writeFile(eventsPath, [good, bad, good2].join("\n") + "\n");

    // State has 3 entries (> 0 stored) so fast path is not taken and fold is triggered
    const state: NormalizedJobState = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature" },
      repository: { owner: "u", name: "r" },
      session: null,
      step: "design",
      status: "running",
      branch: null,
      error: null,
      history: [
        { ts: "2026-01-01T00:00:00.000Z", step: "init", status: "started", message: "m" },
        { ts: "2026-01-01T00:01:00.000Z", step: "design", status: "started", message: "m2" },
        { ts: "2026-01-01T00:02:00.000Z", step: "design", status: "ok", message: "done" },
      ],
      steps: {},
    };
    await expect(store.persist(state)).rejects.toMatchObject({
      code: ERROR_CODES.JOURNAL_CORRUPTED,
    });
  });

  it("throws JOURNAL_CORRUPTED when stored counters exceed fold counts (journal truncation)", async () => {
    const jobId = "t04-persist-truncated";
    // Scenario: state.json says historyCount=5 (last successful persist)
    // events.jsonl was truncated externally → only 1 record
    // Now persist() is called with 6 in-memory entries (5+1 new)
    // Fast path: existingCounters.historyCount(5) >= state.history.length(6)? 5 >= 6 → false
    // → fold path taken → fold gives historyCount=1 → detectCounterReversal finds reversal
    const { store, eventsPath } = await makeChangeDirStore(jobId, {
      historyCount: 5, // stored says 5
    });

    // events.jsonl has only 1 record (truncated)
    const line = JSON.stringify({ type: "transition", ts: "t", step: "init", status: "started", message: "m" });
    await fs.writeFile(eventsPath, line + "\n");

    // State has 6 entries so fast path is not taken (5 < 6)
    const history = Array.from({ length: 6 }, (_, i) => ({
      ts: `2026-01-01T00:0${i}:00Z`,
      step: i === 0 ? "init" : "design",
      status: "started" as const,
      message: `msg ${i}`,
    }));
    const state: NormalizedJobState = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature" },
      repository: { owner: "u", name: "r" },
      session: null,
      step: "design",
      status: "running",
      branch: null,
      error: null,
      history,
      steps: {},
    };
    await expect(store.persist(state)).rejects.toMatchObject({
      code: ERROR_CODES.JOURNAL_CORRUPTED,
    });
  });

  it("succeeds and appends only the true delta when fold is ahead of stored (crash recovery)", async () => {
    const jobId = "t04-persist-fold-ahead";
    const { store, eventsPath } = await makeChangeDirStore(jobId, {
      historyCount: 0, // state.json says 0, events.jsonl has 1 record
    });

    // Write 1 transition record to events.jsonl (fold > stored)
    const line1 = JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" });
    await fs.writeFile(eventsPath, line1 + "\n");

    // State has 2 history entries (1 existing + 1 new)
    const state: NormalizedJobState = {
      version: 1,
      jobId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      request: { path: "/req.md", title: "Test", type: "new-feature" },
      repository: { owner: "u", name: "r" },
      session: null,
      step: "design",
      status: "running",
      branch: null,
      error: null,
      history: [
        { ts: "2026-01-01T00:00:00Z", step: "init", status: "started", message: "m" },
        { ts: "2026-01-01T00:05:00Z", step: "design", status: "started", message: "m2" },
      ],
      steps: {},
    };

    // Count lines before persist
    const beforeContent = await fs.readFile(eventsPath, "utf-8");
    const beforeLines = beforeContent.split("\n").filter((l) => l.trim().length > 0).length;
    expect(beforeLines).toBe(1);

    await store.persist(state);

    // Only 1 delta record should be appended (not 2 — no double-append)
    const afterContent = await fs.readFile(eventsPath, "utf-8");
    const afterLines = afterContent.split("\n").filter((l) => l.trim().length > 0).length;
    expect(afterLines).toBe(2); // 1 original + 1 new
  });
});

describe("T-04: list() tolerant — returns corrupt-journal jobs, still skips invalid state.json", () => {
  it("list() includes a job whose events.jsonl is corrupt (journal corruption ≠ skip)", async () => {
    const slug = "t04-list-corrupt-journal";
    const jobId = "t04-list-cj-00000000-0000-0000-0000-000000000001";

    const dir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(dir, { recursive: true });

    // Write valid state.json
    await fs.writeFile(
      path.join(dir, "state.json"),
      JSON.stringify({
        version: 1,
        jobId,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        request: { path: "/req.md", title: "T", type: "new-feature" },
        repository: { owner: "u", name: "r" },
        session: null,
        step: "init",
        status: "running",
        branch: null,
        error: null,
        _journal: { historyCount: 0, stepCounts: {} },
      }),
    );

    // Write corrupt events.jsonl (mid-journal bad line)
    const good = JSON.stringify({ type: "transition", ts: "t", step: "init", status: "started", message: "m" });
    const bad = "CORRUPT LINE IN JOURNAL";
    await fs.writeFile(path.join(dir, "events.jsonl"), [good, bad].join("\n") + "\n");

    const states = await JobStateStore.list(tempDir);
    const found = states.find((s) => s.jobId === jobId);
    expect(found).toBeDefined(); // corrupt-journal job IS included in list()
    expect(found!.status).toBe("running");
  });

  it("list() still skips a job whose state.json is invalid (unchanged behavior)", async () => {
    const slug = "t04-list-bad-statejson";
    const dir = path.join(tempDir, "specrunner", "changes", slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), "NOT VALID JSON {{{");
    await fs.writeFile(path.join(dir, "events.jsonl"), "");

    const states = await JobStateStore.list(tempDir);
    const found = states.find((s) => s.jobId === slug);
    expect(found).toBeUndefined();
  });
});

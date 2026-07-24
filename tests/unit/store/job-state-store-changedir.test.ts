/**
 * Unit tests for JobStateStore changeDir seam (T-03).
 *
 * TC-CD-001: changeDir store load() reads from that dir
 * TC-CD-002: changeDir store persist() writes to that dir
 * TC-CD-003: changeDir store persist() appends delta to events.jsonl
 * TC-CD-004: no changeDir → conventional slug-mode path (regression)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../../../src/store/job-state-store.js";
import type { JobState } from "../../../src/state/schema.js";
import type { FindingRecencyRecord } from "../../../src/store/event-journal.js";
import { fold } from "../../../src/store/event-journal.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-cd-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

const JOB_ID = "00000000-0000-0000-0000-000000000001";
const SLUG = "test-slug";

function makeInitialState(overrides: Partial<JobState> = {}): JobState {
  const now = new Date().toISOString();
  return {
    version: 1,
    jobId: JOB_ID,
    createdAt: now,
    updatedAt: now,
    request: { path: "/tmp/request.md", title: "Test", type: "spec-change" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    pid: null,
    branch: "change/test-slug-abc",
    history: [],
    error: null,
    pipelineId: "standard",
    ...overrides,
  };
}

// TC-CD-001
describe("TC-CD-001: changeDir store load() reads from that dir", () => {
  it("loads state from specified changeDir", async () => {
    const customDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-" + SLUG);
    await fs.mkdir(customDir, { recursive: true });

    // Write state directly to customDir
    const state = makeInitialState({ status: "awaiting-archive" });
    const stateForFile = { ...state, _journal: { historyCount: 0, stepCounts: {} } };
    await fs.writeFile(path.join(customDir, "state.json"), JSON.stringify(stateForFile), "utf-8");
    await fs.writeFile(path.join(customDir, "events.jsonl"), "", "utf-8");

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir, changeDir: customDir });
    const loaded = await store.load();

    expect(loaded.status).toBe("awaiting-archive");
    expect(loaded.jobId).toBe(JOB_ID);
  });
});

// TC-CD-002
describe("TC-CD-002: changeDir store persist() writes to that dir", () => {
  it("persist() overwrites state.json in changeDir", async () => {
    const customDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-" + SLUG);
    await fs.mkdir(customDir, { recursive: true });

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir, changeDir: customDir });
    const state = makeInitialState({ status: "awaiting-archive" });
    await store.persist(state);

    // Verify state.json written to customDir
    const raw = JSON.parse(await fs.readFile(path.join(customDir, "state.json"), "utf-8")) as Record<string, unknown>;
    expect(raw["status"]).toBe("awaiting-archive");
    expect(raw["jobId"]).toBe(JOB_ID);

    // Verify conventional slug dir was NOT written
    const slugDir = path.join(tempDir, "specrunner", "changes", SLUG, "state.json");
    await expect(fs.access(slugDir)).rejects.toThrow();
  });
});

// TC-CD-003
describe("TC-CD-003: changeDir store persist() appends delta to events.jsonl", () => {
  it("appends new history entries to events.jsonl in changeDir", async () => {
    const customDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-" + SLUG);
    await fs.mkdir(customDir, { recursive: true });

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir, changeDir: customDir });

    // Initial persist
    const state = makeInitialState({ status: "awaiting-archive" });
    await store.persist(state);

    // Add a history entry and persist again
    const updatedState: JobState = {
      ...state,
      status: "archived",
      updatedAt: new Date().toISOString(),
      history: [
        ...state.history,
        { ts: new Date().toISOString(), step: "archive", status: "ok", message: "archived" },
      ],
    };
    await store.persist(updatedState);

    // Verify events.jsonl in customDir has the history entry
    const eventsContent = await fs.readFile(path.join(customDir, "events.jsonl"), "utf-8");
    expect(eventsContent).toContain("archive");
  });
});

// TC-CD-004
describe("TC-CD-004: no changeDir → conventional slug-mode path (regression)", () => {
  it("without changeDir, writes to conventional specrunner/changes/<slug>/ dir", async () => {
    const slugDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(slugDir, { recursive: true });

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir });
    const state = makeInitialState({ status: "awaiting-archive" });
    await store.persist(state);

    const raw = JSON.parse(await fs.readFile(path.join(slugDir, "state.json"), "utf-8")) as Record<string, unknown>;
    expect(raw["status"]).toBe("awaiting-archive");
  });
});

// TC-CD-005: appendFindingRecency delegates to journal, does not mutate state.json
describe("TC-CD-005: appendFindingRecency writes to events.jsonl without touching state.json", () => {
  it("appends finding-recency record to events.jsonl; state.json is not written", async () => {
    const customDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-" + SLUG);
    await fs.mkdir(customDir, { recursive: true });

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir, changeDir: customDir });

    // Write an initial state.json so we can verify it is not modified
    const state = makeInitialState();
    await store.persist(state);
    const stateBefore = await fs.stat(path.join(customDir, "state.json"));

    const record: FindingRecencyRecord = {
      type: "finding-recency",
      step: "spec-review",
      ts: new Date().toISOString(),
      iteration: 2,
      priorOid: "abc123deadbeef0000000000000000000000000000",
      findings: [
        {
          file: "src/foo.ts",
          line: 10,
          title: "Late finding",
          severity: "high",
          recency: "late",
        },
      ],
    };

    await store.appendFindingRecency(record);

    // events.jsonl must contain the finding-recency record
    const eventsContent = await fs.readFile(path.join(customDir, "events.jsonl"), "utf-8");
    const foldResult = fold(eventsContent);
    const findingRecency = (foldResult as unknown as { findingRecency?: FindingRecencyRecord[] })
      .findingRecency;
    expect(findingRecency).toBeDefined();
    expect(findingRecency).toHaveLength(1);
    expect(findingRecency![0]!.iteration).toBe(2);
    expect(findingRecency![0]!.findings[0]!.recency).toBe("late");

    // state.json must not have been modified
    const stateAfter = await fs.stat(path.join(customDir, "state.json"));
    expect(stateAfter.mtimeMs).toBe(stateBefore.mtimeMs);
  });

  it("appendFindingRecency does not expose findingRecency in NormalizedJobState fields", async () => {
    const customDir = path.join(tempDir, "specrunner", "changes", "archive", "2026-01-01-" + SLUG + "-b");
    await fs.mkdir(customDir, { recursive: true });

    const store = new JobStateStore(JOB_ID, tempDir, { slug: SLUG, stateRoot: tempDir, changeDir: customDir });
    const state = makeInitialState();
    await store.persist(state);

    const record: FindingRecencyRecord = {
      type: "finding-recency",
      step: "spec-review",
      ts: new Date().toISOString(),
      iteration: 2,
      priorOid: null,
      findings: [],
    };

    await store.appendFindingRecency(record);

    // load() returns NormalizedJobState — findingRecency must not appear
    const loaded = await store.load();
    expect(loaded).not.toHaveProperty("findingRecency");
  });
});

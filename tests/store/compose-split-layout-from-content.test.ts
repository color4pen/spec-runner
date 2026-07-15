/**
 * Tests for composeSplitLayoutFromContent (T-02).
 *
 * TC-CSL-001: valid state.json + events.jsonl → state restored, corruption === null
 * TC-CSL-002: journal-corrupt events.jsonl → corruption !== null
 * TC-CSL-003: empty eventsJsonl → empty fold, state restored (no corruption)
 * TC-CSL-004: invalid JSON state.json → throws
 * TC-CSL-005: existing composeSplitLayout/loadSplitLayout behaviour unchanged (regression)
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { composeSplitLayoutFromContent, composeSplitLayout } from "../../src/store/job-state-projection.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_STATE_JSON = JSON.stringify({
  version: 2,
  jobId: "test-job-id-1234",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
  request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "new-feature", slug: "my-slug" },
  repository: { owner: "testowner", name: "testrepo" },
  session: null,
  step: "implementer",
  status: "awaiting-resume",
  branch: "feat/my-slug-1234abcd",
  history: [],
  error: null,
  pipelineId: "standard",
}, null, 2);

// A valid events.jsonl with one history entry
const VALID_EVENTS_JSONL = `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;

// Corrupted journal: valid line followed by a malformed line then another valid line
// The fold implementation detects records after a corruption marker
const CORRUPT_EVENTS_JSONL = `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\nNOT_VALID_JSON\n{"type":"interruption","ts":"2026-01-01T02:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":2}\n`;

// ---------------------------------------------------------------------------
// TC-CSL-001: valid state + events
// ---------------------------------------------------------------------------
describe("TC-CSL-001: valid state.json + events.jsonl → state restored, corruption null", () => {
  it("returns state with no corruption on valid inputs", async () => {
    const { state, corruption } = await composeSplitLayoutFromContent(VALID_STATE_JSON, VALID_EVENTS_JSONL);
    expect(corruption).toBeNull();
    expect(state.jobId).toBe("test-job-id-1234");
    expect(state.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-CSL-002: corrupted journal → corruption !== null
// ---------------------------------------------------------------------------
describe("TC-CSL-002: corrupted events.jsonl → corruption !== null", () => {
  it("returns non-null corruption when journal has invalid records after valid records", async () => {
    const { corruption } = await composeSplitLayoutFromContent(VALID_STATE_JSON, CORRUPT_EVENTS_JSONL);
    // Corruption should be non-null (the fold detected the broken line)
    expect(corruption).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CSL-003: empty eventsJsonl → empty fold, state restored
// ---------------------------------------------------------------------------
describe("TC-CSL-003: empty eventsJsonl → empty fold, state restored", () => {
  it("returns state with no corruption when eventsJsonl is empty", async () => {
    const { state, corruption } = await composeSplitLayoutFromContent(VALID_STATE_JSON, "");
    expect(corruption).toBeNull();
    expect(state.jobId).toBe("test-job-id-1234");
    expect(state.history).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-CSL-004: invalid JSON state → throws
// ---------------------------------------------------------------------------
describe("TC-CSL-004: invalid JSON state.json → throws", () => {
  it("throws on invalid JSON in stateJson", async () => {
    await expect(
      composeSplitLayoutFromContent("NOT_VALID_JSON", ""),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-CSL-005: composeSplitLayout delegates to composeSplitLayoutFromContent (regression)
// ---------------------------------------------------------------------------
describe("TC-CSL-005: composeSplitLayout file-path wrapper regression", () => {
  it("composeSplitLayout reads files and returns same result as composeSplitLayoutFromContent", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-test-"));
    try {
      const stateJsonPath = path.join(tmpDir, "state.json");
      const eventsPath = path.join(tmpDir, "events.jsonl");
      await fs.writeFile(stateJsonPath, VALID_STATE_JSON, "utf-8");
      await fs.writeFile(eventsPath, VALID_EVENTS_JSONL, "utf-8");

      const fromContent = await composeSplitLayoutFromContent(VALID_STATE_JSON, VALID_EVENTS_JSONL);
      const fromPaths = await composeSplitLayout(stateJsonPath, eventsPath);

      expect(fromPaths.state.jobId).toBe(fromContent.state.jobId);
      expect(fromPaths.state.status).toBe(fromContent.state.status);
      expect(fromPaths.corruption).toBe(fromContent.corruption);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("composeSplitLayout handles missing events.jsonl (ENOENT) as empty fold", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-test-enoent-"));
    try {
      const stateJsonPath = path.join(tmpDir, "state.json");
      const eventsPath = path.join(tmpDir, "events.jsonl"); // does not exist
      await fs.writeFile(stateJsonPath, VALID_STATE_JSON, "utf-8");
      // No events.jsonl written

      const { state, corruption } = await composeSplitLayout(stateJsonPath, eventsPath);
      expect(corruption).toBeNull();
      expect(state.jobId).toBe("test-job-id-1234");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

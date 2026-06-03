/**
 * Unit tests for src/core/usage/store.ts
 *
 * TC-USG-01: readUsageFile — 不在ファイルに対して空構造を返す
 * TC-USG-02: appendInvocation — 既存 entries を維持しつつ新 entry を追加
 * TC-USG-03: appendInvocation — 2 回 append で 2 entry 蓄積
 * TC-USG-04: deriveFromJobState — steps ありの state → entries 生成
 * TC-USG-05: deriveFromJobState — modelUsage undefined の step で modelUsage: null を設定
 * TC-USG-06: deriveFromJobState — entries が timestamp 昇順でソートされる
 */
import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { readUsageFile, appendInvocation, deriveFromJobState } from "../../../src/core/usage/store.js";
import type { CommandInvocation } from "../../../src/core/usage/types.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// TC-USG-01: readUsageFile — 不在ファイル → 空構造
// ---------------------------------------------------------------------------

describe("TC-USG-01: readUsageFile returns empty structure for missing file", () => {
  it("returns { commandInvocations: [] } when file does not exist", async () => {
    const filePath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.json`);
    const result = await readUsageFile(filePath);
    expect(result).toEqual({ commandInvocations: [] });
  });
});

// ---------------------------------------------------------------------------
// TC-USG-02: appendInvocation — 既存 entries を維持しつつ新 entry を追加
// ---------------------------------------------------------------------------

describe("TC-USG-02: appendInvocation preserves existing entries", () => {
  it("keeps existing entries when appending a new one", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    const entry1: CommandInvocation = {
      command: "request-review",
      timestamp: "2026-05-25T10:00:00.000Z",
      modelUsage: null,
    };
    const entry2: CommandInvocation = {
      command: "request-generate",
      timestamp: "2026-05-25T11:00:00.000Z",
      modelUsage: null,
    };

    await appendInvocation(filePath, entry1);
    await appendInvocation(filePath, entry2);

    const result = await readUsageFile(filePath);
    expect(result.commandInvocations).toHaveLength(2);
    expect(result.commandInvocations[0]).toMatchObject(entry1);
    expect(result.commandInvocations[1]).toMatchObject(entry2);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// TC-USG-03: appendInvocation — 2 回 append で 2 entry 蓄積
// ---------------------------------------------------------------------------

describe("TC-USG-03: appendInvocation accumulates 2 entries on 2 calls", () => {
  it("accumulates 2 entries when called twice", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    const entry: CommandInvocation = {
      command: "request-review",
      timestamp: new Date().toISOString(),
      modelUsage: { "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    };

    await appendInvocation(filePath, entry);
    await appendInvocation(filePath, { ...entry, timestamp: new Date().toISOString() });

    const result = await readUsageFile(filePath);
    expect(result.commandInvocations).toHaveLength(2);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// TC-USG-04: deriveFromJobState — steps ありの state → entries 生成
// ---------------------------------------------------------------------------

describe("TC-USG-04: deriveFromJobState generates entries from job state steps", () => {
  it("creates one entry per StepRun", async () => {
    const state: JobState = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T01:00:00.000Z",
      request: { path: "/some/path", title: "Test", type: "new-feature" },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "design",
      status: "awaiting-archive",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        design: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-05-25T00:30:00.000Z",
            endedAt: "2026-05-25T00:45:00.000Z",
            modelUsage: { "claude-opus-4-5": { inputTokens: 500, outputTokens: 200, cacheReadInputTokens: 100, cacheCreationInputTokens: 50 } },
          },
        ],
        implementer: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-05-25T00:50:00.000Z",
            endedAt: "2026-05-25T01:00:00.000Z",
            modelUsage: { "claude-opus-4-5": { inputTokens: 1000, outputTokens: 400, cacheReadInputTokens: 200, cacheCreationInputTokens: 100 } },
          },
        ],
      },
    };

    const entries = await deriveFromJobState(state);
    expect(entries).toHaveLength(2);

    // All entries should have command: "job"
    for (const entry of entries) {
      expect(entry.command).toBe("job");
      expect(entry.jobId).toBe("test-job-id");
    }

    // Should be sorted by timestamp
    expect(entries[0]!.timestamp).toBe("2026-05-25T00:45:00.000Z");
    expect(entries[1]!.timestamp).toBe("2026-05-25T01:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// TC-USG-05: deriveFromJobState — modelUsage undefined → modelUsage: null
// ---------------------------------------------------------------------------

describe("TC-USG-05: deriveFromJobState records null modelUsage for undefined usage", () => {
  it("sets modelUsage: null for StepRun without modelUsage", async () => {
    const state: JobState = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T01:00:00.000Z",
      request: { path: "/some/path", title: "Test", type: "new-feature" },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "design",
      status: "awaiting-archive",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        design: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-05-25T00:30:00.000Z",
            endedAt: "2026-05-25T00:45:00.000Z",
            // modelUsage deliberately absent
          },
        ],
      },
    };

    const entries = await deriveFromJobState(state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.modelUsage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-USG-06: deriveFromJobState — timestamp 昇順ソート
// ---------------------------------------------------------------------------

describe("TC-USG-06: deriveFromJobState sorts entries ascending by timestamp", () => {
  it("sorts entries in ascending timestamp order", async () => {
    const state: JobState = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T02:00:00.000Z",
      request: { path: "/some/path", title: "Test", type: "new-feature" },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "implementer",
      status: "awaiting-archive",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {
        // Note: Object.entries order may vary, but sort should normalize
        implementer: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-05-25T01:50:00.000Z",
            endedAt: "2026-05-25T02:00:00.000Z",
          },
        ],
        design: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-05-25T00:30:00.000Z",
            endedAt: "2026-05-25T01:00:00.000Z",
          },
        ],
      },
    };

    const entries = await deriveFromJobState(state);
    expect(entries).toHaveLength(2);
    // Earliest timestamp first
    expect(entries[0]!.timestamp).toBe("2026-05-25T01:00:00.000Z");
    expect(entries[0]!.stepName).toBe("design");
    expect(entries[1]!.timestamp).toBe("2026-05-25T02:00:00.000Z");
    expect(entries[1]!.stepName).toBe("implementer");
  });
});

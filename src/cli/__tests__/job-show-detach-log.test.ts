/**
 * Tests for detach log display in job show (src/cli/job-show.ts)
 *
 * TC-007: job show が detach log の所在を表示する
 * TC-025: detach log が存在しない場合 job show に Detach log 行は出ない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../core/job-access/load-by-job-id.js", () => ({
  loadStateByJobId: vi.fn(),
}));

vi.mock("../../store/event-journal.js", () => ({
  fold: vi.fn().mockReturnValue({ lineage: [] }),
}));

vi.mock("../../core/job-access/resolve-change-dir.js", () => ({
  resolveChangeDir: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../store/journal-integrity.js", () => ({
  inspectJournalDir: vi.fn().mockResolvedValue(null),
  describeJournalIssue: vi.fn().mockReturnValue(""),
}));

vi.mock("../../core/usage/store.js", () => ({
  readUsageFile: vi.fn().mockResolvedValue({ commandInvocations: [] }),
}));

vi.mock("../../core/usage/pricing.js", () => ({
  computeCostUsd: vi.fn().mockReturnValue(0),
  formatUsd: vi.fn().mockReturnValue("$0.00"),
}));

// ---------------------------------------------------------------------------
// Capture logResult calls
// ---------------------------------------------------------------------------

const logResultCalls: string[] = [];

vi.mock("../../logger/stdout.js", () => ({
  logResult: vi.fn((msg: string) => logResultCalls.push(msg)),
  stderrWrite: vi.fn(),
  stdoutWrite: vi.fn(),
  logError: vi.fn(),
  setLogLevel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { printJobState } from "../job-show.js";
import type { JobState } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-test-0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "init",
    status: "awaiting-archive",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

let tempDir: string;

beforeEach(async () => {
  logResultCalls.length = 0;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-job-show-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-007: job show が detach log の所在を表示する
// ---------------------------------------------------------------------------

describe("TC-007: job show が detach log の所在を表示する", () => {
  it("TC-007: shows Detach log line when detach log file exists", async () => {
    // Create the .specrunner/logs dir and the slug detach log
    const logsDir = path.join(tempDir, ".specrunner", "logs");
    await fs.mkdir(logsDir, { recursive: true });

    // Create detach log file for slug "test-slug"
    // Expected naming convention: <slug>.detach.log
    const detachLogFile = path.join(logsDir, "test-slug.detach.log");
    await fs.writeFile(detachLogFile, "detach log content", "utf-8");

    const state = makeJobState();
    await printJobState(state, tempDir);

    const output = logResultCalls.join("\n");
    expect(output).toContain("Detach log:");
  });

  it("TC-007: detach log path is shown relative to repoRoot", async () => {
    const logsDir = path.join(tempDir, ".specrunner", "logs");
    await fs.mkdir(logsDir, { recursive: true });
    const detachLogFile = path.join(logsDir, "test-slug.detach.log");
    await fs.writeFile(detachLogFile, "content", "utf-8");

    const state = makeJobState();
    await printJobState(state, tempDir);

    const detachLine = logResultCalls.find((line) => line.includes("Detach log:"));
    expect(detachLine).toBeDefined();
    // Path should be relative (not absolute)
    const relPath = detachLine!.split("Detach log:")[1]!.trim();
    expect(path.isAbsolute(relPath)).toBe(false);
    expect(relPath).toContain(".specrunner");
    expect(relPath).toContain("test-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-025: detach log が存在しない場合 job show に Detach log 行は出ない
// ---------------------------------------------------------------------------

describe("TC-025: detach log が存在しない場合 job show に Detach log 行は出ない", () => {
  it("TC-025: no Detach log line when detach log does not exist", async () => {
    // Do NOT create the detach log file
    const state = makeJobState();
    await printJobState(state, tempDir);

    const output = logResultCalls.join("\n");
    expect(output).not.toContain("Detach log:");
  });

  it("TC-025: existing Log: line is still present even when no detach log", async () => {
    // The regular job verbose log should still show (or show (none))
    const state = makeJobState();
    await printJobState(state, tempDir);

    const output = logResultCalls.join("\n");
    // Log: line must exist
    expect(output).toContain("Log:");
  });
});

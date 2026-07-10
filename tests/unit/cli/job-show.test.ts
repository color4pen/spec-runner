/**
 * Tests for src/cli/job-show.ts
 *
 * TC-JSHOW-001: UUID input loads by jobId and prints 7 fields (incl. Log)
 * TC-JSHOW-002: slug input resolves by slug and prints 7 fields
 * TC-JSHOW-003: unknown slug → exit 1
 * TC-JSHOW-004: multiple jobs with same slug → latest updatedAt wins
 * T-047: Log: shows relative path when log file exists
 * T-048: Log: shows (none) when log file does not exist
 * TC-005: job show prints lineage section when events.jsonl has lineage records
 * TC-006: job show prints cost section when usage.json has invocation data
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

// Patch git spawn for resolveRepoRoot — must be declared before imports
vi.mock("../../../src/util/spawn.js", () => ({
  spawnCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "/fake/repo\n", stderr: "" }),
}));

const { mockLoad, mockList } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock("../../../src/store/job-state-store.js", () => {
  class MockJobStateStore {
    load() { return mockLoad(); }
    persist() { return Promise.resolve(); }
    static list(...args: unknown[]) { return mockList(...args); }
  }
  return { JobStateStore: MockJobStateStore };
});

vi.mock("../../../src/core/job-access/load-by-job-id.js", () => ({
  loadStateByJobId: vi.fn().mockImplementation(() => mockLoad()),
}));

import { SpecRunnerError, ERROR_CODES } from "../../../src/errors.js";

const VALID_UUID = "abcd1234-ef56-7890-abcd-ef1234567890";

function makeJob(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: VALID_UUID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: { path: "/repo/specrunner/drafts/my-feature.md", title: "My Feature", type: "new-feature", slug: "my-feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/my-feature-abcd1234",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let _exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockLoad.mockReset();
  mockList.mockReset();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  _exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function invokeRunJobShow(input: string) {
  const { runJobShow } = await import("../../../src/cli/job-show.js");
  return runJobShow(input);
}

// TC-JSHOW-001: UUID input → load by jobId, print 7 fields
describe("TC-JSHOW-001: UUID input loads job by jobId and prints 7 fields", () => {
  it("prints Job ID, Status, Branch, Step, Created, Updated, Log", async () => {
    const job = makeJob();
    mockLoad.mockResolvedValue(job);

    await invokeRunJobShow(VALID_UUID);

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain(`Job ID:  ${VALID_UUID}`);
    expect(output).toContain("Status:  running");
    expect(output).toContain("Branch:  feat/my-feature-abcd1234");
    expect(output).toContain("Step:    design");
    expect(output).toContain("Created: 2026-01-01T00:00:00.000Z");
    expect(output).toContain("Updated: 2026-01-01T01:00:00.000Z");
    // T-048: Log shows (none) when log file does not exist (fake repo path in tests)
    expect(output).toContain("Log:");
    expect(mockLoad).toHaveBeenCalled();
  });
});

// TC-JSHOW-002: slug input → resolve by slug, print 6 fields
describe("TC-JSHOW-002: slug input resolves job by slug", () => {
  it("searches all jobs and prints the matching one", async () => {
    const job = makeJob({ request: { path: "/repo/req.md", title: "My Feature", type: "new-feature", slug: "my-feature" } });
    mockList.mockResolvedValue([job]);

    await invokeRunJobShow("my-feature");

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain(`Job ID:  ${VALID_UUID}`);
    expect(output).toContain("Status:  running");
    expect(mockList).toHaveBeenCalled();
    // mockLoad should NOT be called for slug resolution
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

// TC-JSHOW-003: unknown slug → returns 1 (no longer calls process.exit directly)
describe("TC-JSHOW-003: unknown slug returns exit code 1", () => {
  it("prints error to stderr and returns 1", async () => {
    mockList.mockResolvedValue([]);

    const result = await invokeRunJobShow("ghost-slug");

    expect(result).toBe(1);
    const stderrOutput = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("ghost-slug");
  });
});

// TC-JSHOW-004: UUID not found → returns 1 (no longer calls process.exit directly)
describe("TC-JSHOW-004: valid UUID not found returns exit code 1", () => {
  it("prints error to stderr and returns 1", async () => {
    mockLoad.mockRejectedValue(new Error("Job not found: " + VALID_UUID));

    const result = await invokeRunJobShow(VALID_UUID);

    expect(result).toBe(1);
    const stderrOutput = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("Job not found");
  });
});

// TC-JSHOW-005: multiple jobs with same slug → latest updatedAt wins
describe("TC-JSHOW-005: multiple jobs with same slug picks latest updatedAt", () => {
  it("returns the most recently updated job", async () => {
    const older = makeJob({
      jobId: "aaaabbbb-0000-0000-0000-000000000001",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Feature", type: "new-feature", slug: "my-feature" },
    });
    const newer = makeJob({
      jobId: "ccccdddd-0000-0000-0000-000000000002",
      updatedAt: "2026-02-01T00:00:00.000Z",
      status: "awaiting-archive",
      request: { path: "/req.md", title: "Feature", type: "new-feature", slug: "my-feature" },
    });
    mockList.mockResolvedValue([older, newer]);

    await invokeRunJobShow("my-feature");

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("ccccdddd");
    expect(output).toContain("awaiting-archive");
  });
});

// TC-JSHOW-006: null branch renders as "(none)"
describe("TC-JSHOW-006: null branch displays as (none)", () => {
  it("shows (none) when branch is null", async () => {
    const job = makeJob({ branch: null });
    mockLoad.mockResolvedValue(job);

    await invokeRunJobShow(VALID_UUID);

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("Branch:  (none)");
  });
});

// T-048: Log: shows (none) when log file does not exist
describe("T-048: Log field shows (none) when log file does not exist", () => {
  it("shows 'Log:     (none)' when no log file exists", async () => {
    const job = makeJob();
    mockLoad.mockResolvedValue(job);

    await invokeRunJobShow(VALID_UUID);

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("Log:     (none)");
  });
});

// TC-005: lineage section is printed when events.jsonl has lineage records
describe("TC-005: job show prints lineage section from events.jsonl", () => {
  it("prints Lineage: section with step/output/input when lineage records exist", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-lineage-test-"));
    try {
      // Create change folder with events.jsonl containing a lineage record
      const changeDir = pathMod.join(tmpDir, "specrunner", "changes", "my-feature");
      await fsMod.mkdir(changeDir, { recursive: true });

      const lineageRecord = JSON.stringify({
        type: "lineage",
        step: "design",
        ts: "2026-01-01T00:01:00Z",
        outputs: [{ path: "specrunner/changes/my-feature/design.md", hash: "sha256:abc123" }],
        inputs: [{ path: "specrunner/changes/my-feature/request.md", hash: "sha256:def456", required: true }],
      });
      await fsMod.writeFile(pathMod.join(changeDir, "events.jsonl"), lineageRecord + "\n");

      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("Lineage:");
      expect(output).toContain("design");
      expect(output).toContain("specrunner/changes/my-feature/design.md");
      expect(output).toContain("sha256:abc123");
      expect(output).toContain("specrunner/changes/my-feature/request.md");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not print Lineage: section when no lineage records exist", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-no-lineage-test-"));
    try {
      // Change folder with events.jsonl but no lineage records
      const changeDir = pathMod.join(tmpDir, "specrunner", "changes", "my-feature");
      await fsMod.mkdir(changeDir, { recursive: true });
      const stepRecord = JSON.stringify({
        type: "transition",
        ts: "2026-01-01T00:00:00Z",
        step: "init",
        status: "started",
        message: "started",
      });
      await fsMod.writeFile(pathMod.join(changeDir, "events.jsonl"), stepRecord + "\n");

      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).not.toContain("Lineage:");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-006: cost section is printed when usage.json has step invocation data
describe("TC-006: job show prints cost section from usage.json", () => {
  it("prints Cost by step: section when usage.json has invocation data", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-cost-test-"));
    try {
      const changeDir = pathMod.join(tmpDir, "specrunner", "changes", "my-feature");
      await fsMod.mkdir(changeDir, { recursive: true });

      // Write usage.json with a design step invocation
      const usageData = {
        commandInvocations: [
          {
            command: "job",
            timestamp: "2026-01-01T00:01:00Z",
            modelUsage: {
              "claude-sonnet-4-6": {
                inputTokens: 500,
                outputTokens: 200,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
              },
            },
            jobId: VALID_UUID,
            stepName: "design",
          },
        ],
      };
      await fsMod.writeFile(
        pathMod.join(changeDir, "usage.json"),
        JSON.stringify(usageData),
      );

      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("Cost by step:");
      expect(output).toContain("design:");
      expect(output).toContain("in=500");
      expect(output).toContain("out=200");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not print Cost by step: section when usage.json has no step invocations", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-no-cost-test-"));
    try {
      const changeDir = pathMod.join(tmpDir, "specrunner", "changes", "my-feature");
      await fsMod.mkdir(changeDir, { recursive: true });

      // usage.json exists but no step invocations with stepName
      const usageData = { commandInvocations: [] };
      await fsMod.writeFile(
        pathMod.join(changeDir, "usage.json"),
        JSON.stringify(usageData),
      );

      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).not.toContain("Cost by step:");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// T-047: Log: shows relative path when log file exists
// This test directly tests printJobState with a real file system
describe("T-047: Log field shows relative path when log file exists", () => {
  it("shows relative log path when log file exists", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    // Create a temporary dir to simulate the log file existing
    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-log-test-"));
    try {
      // Create the log file at the expected path
      const logsDir = pathMod.join(tmpDir, ".specrunner", "logs");
      await fsMod.mkdir(logsDir, { recursive: true });
      await fsMod.writeFile(pathMod.join(logsDir, `${VALID_UUID}.log`), "{}");

      printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("Log:");
      // Should contain a relative path, not "(none)"
      expect(output).not.toContain("Log:     (none)");
      expect(output).toContain(".specrunner");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// T-05 tests: job show handles corrupt journal without crashing
// ---------------------------------------------------------------------------

describe("T-05: job show — corrupt journal via UUID path does not crash", () => {
  it("UUID path: JOURNAL_CORRUPTED error prints corruption banner and returns 0", async () => {
    const corruptError = new SpecRunnerError(
      ERROR_CODES.JOURNAL_CORRUPTED,
      "Restore events.jsonl from git history before re-running.",
      `Event journal integrity check failed at /path/to/events.jsonl: corrupt record at line 1 (invalid-json): BAD`,
    );
    mockLoad.mockRejectedValue(corruptError);

    const result = await invokeRunJobShow(VALID_UUID);

    expect(result).toBe(0); // does not crash
    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("CORRUPTED");
    expect(output).toContain("integrity");
  });

  it("UUID path: JOURNAL_CORRUPTED error does not call process.exit(1)", async () => {
    const corruptError = new SpecRunnerError(
      ERROR_CODES.JOURNAL_CORRUPTED,
      "Restore hint",
      "Event journal integrity check failed at /path/events.jsonl: corrupt record",
    );
    mockLoad.mockRejectedValue(corruptError);

    let exitCalled = false;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      exitCalled = true;
      throw new Error("process.exit called");
    });

    try {
      const result = await invokeRunJobShow(VALID_UUID);
      expect(result).toBe(0);
      expect(exitCalled).toBe(false);
    } finally {
      exitSpy.mockRestore();
    }
  });
});

describe("T-05: job show — corrupt journal via slug/printJobState path does not crash", () => {
  it("printJobState: corrupt events.jsonl shows corruption banner, skips lineage and cost", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-corrupt-test-"));
    try {
      // Create change folder with a corrupt events.jsonl (mid-journal bad line)
      const changeDir = pathMod.join(tmpDir, "specrunner", "changes", "my-feature");
      await fsMod.mkdir(changeDir, { recursive: true });

      const goodLine = JSON.stringify({ type: "transition", ts: "t", step: "init", status: "started", message: "m" });
      const badLine = "CORRUPT LINE";
      const anotherGood = JSON.stringify({ type: "lineage", step: "design", ts: "t2", outputs: [], inputs: [] });
      await fsMod.writeFile(
        pathMod.join(changeDir, "events.jsonl"),
        [goodLine, badLine, anotherGood].join("\n") + "\n",
      );

      // Also write a valid state.json with high counters (so counter check would also fail, but corruption check runs first)
      await fsMod.writeFile(
        pathMod.join(changeDir, "state.json"),
        JSON.stringify({ _journal: { historyCount: 0, stepCounts: {} } }),
      );

      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("CORRUPTED");
      // Lineage and cost sections should be suppressed
      expect(output).not.toContain("Lineage:");
      expect(output).not.toContain("Cost by step:");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("printJobState: intact events.jsonl (no corruption) prints existing header normally", async () => {
    const { printJobState } = await import("../../../src/cli/job-show.js");
    const job = makeJob();

    const os = await import("node:os");
    const pathMod = await import("node:path");
    const fsMod = await import("node:fs/promises");

    const tmpDir = await fsMod.mkdtemp(pathMod.join(os.tmpdir(), "job-show-intact-test-"));
    try {
      // No change folder at all — resolveChangeDir returns null → inspectJournalDir not called → no banner
      await printJobState(job, tmpDir);

      const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("Job ID:");
      expect(output).not.toContain("CORRUPTED");
    } finally {
      await fsMod.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

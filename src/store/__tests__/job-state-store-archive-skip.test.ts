/**
 * Tests for JobStateStore.list archive-skip optimization.
 *
 * TC-ARC-01: default list() does not call readdir on the archive path
 * TC-ARC-02: list({ includeArchived: true }) calls readdir on the archive path
 *            and returns the archived states
 *
 * Uses vi.mock to intercept node:fs/promises.readdir calls from job-state-store.ts.
 * (vi.spyOn cannot mutate ESM module namespace bindings.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mock node:fs/promises so we can track readdir call arguments.
// vi.mock is hoisted — the spy is in place before any module loads.
// ---------------------------------------------------------------------------
vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readdir: vi.fn((...args: any[]) => (actual.readdir as (...a: any[]) => any)(...args)),
  };
});

// Import after mock is registered (vitest hoists vi.mock, so ordering is safe)
import * as fsPromises from "node:fs/promises";
import { JobStateStore } from "../job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalStateJson(jobId: string): string {
  return JSON.stringify({
    version: 2,
    jobId,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status: "archived",
    pid: null,
    branch: "fix/test",
    history: [],
    error: null,
    pipelineId: "standard-v1",
    _journal: { historyCount: 0, stepCounts: {} },
  });
}

const ARCHIVE_JOB_IDS = [
  "aaaaaaaa-0000-0000-0000-000000000001",
  "bbbbbbbb-0000-0000-0000-000000000002",
  "cccccccc-0000-0000-0000-000000000003",
];

async function setupFixture(): Promise<string> {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "spec-skip-test-"));

  const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive");
  const stubs = [
    { dir: "2024-01-01-slug-a", jobId: ARCHIVE_JOB_IDS[0]! },
    { dir: "2024-01-02-slug-b", jobId: ARCHIVE_JOB_IDS[1]! },
    { dir: "2024-01-03-slug-c", jobId: ARCHIVE_JOB_IDS[2]! },
  ];

  for (const stub of stubs) {
    const stubDir = path.join(archiveDir, stub.dir);
    await fsPromises.mkdir(stubDir, { recursive: true });
    await fsPromises.writeFile(path.join(stubDir, "state.json"), makeMinimalStateJson(stub.jobId));
  }

  return tmpDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobStateStore.list archive-skip", () => {
  let tmpDir: string | undefined;
  const readdirSpy = vi.mocked(fsPromises.readdir);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (tmpDir) {
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("TC-ARC-01: default list() never calls readdir on the archive path", async () => {
    tmpDir = await setupFixture();
    const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive");

    await JobStateStore.list(tmpDir);

    // The archive subdirectory must not have been scanned at all
    const archiveCalls = readdirSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && (args[0] as string).startsWith(archiveDir),
    );
    expect(archiveCalls).toHaveLength(0);
  });

  it("TC-ARC-02: list({ includeArchived: true }) calls readdir on the archive path and returns archived states", async () => {
    tmpDir = await setupFixture();
    const archiveDir = path.join(tmpDir, "specrunner", "changes", "archive");

    const states = await JobStateStore.list(tmpDir, { includeArchived: true });

    // Archive directory was scanned
    const archiveCalls = readdirSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && (args[0] as string).startsWith(archiveDir),
    );
    expect(archiveCalls.length).toBeGreaterThanOrEqual(1);

    // All archived states are present in the result
    const resultIds = states.map((s) => s.jobId);
    for (const jobId of ARCHIVE_JOB_IDS) {
      expect(resultIds).toContain(jobId);
    }
  });
});

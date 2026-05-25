/**
 * Tests for src/cli/job-show.ts
 *
 * TC-JSHOW-001: UUID input loads by jobId and prints 6 fields
 * TC-JSHOW-002: slug input resolves by slug and prints 6 fields
 * TC-JSHOW-003: unknown slug → exit 1
 * TC-JSHOW-004: multiple jobs with same slug → latest updatedAt wins
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
let exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockLoad.mockReset();
  mockList.mockReset();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
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

// TC-JSHOW-001: UUID input → load by jobId, print 6 fields
describe("TC-JSHOW-001: UUID input loads job by jobId and prints 6 fields", () => {
  it("prints Job ID, Status, Branch, Step, Created, Updated", async () => {
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

// TC-JSHOW-003: unknown slug → exit 1
describe("TC-JSHOW-003: unknown slug exits with code 1", () => {
  it("prints error and exits with 1", async () => {
    mockList.mockResolvedValue([]);

    await expect(invokeRunJobShow("ghost-slug")).rejects.toThrow("process.exit(1)");

    const stderrOutput = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("ghost-slug");
  });
});

// TC-JSHOW-004: UUID not found → exit 1
describe("TC-JSHOW-004: valid UUID not found exits with 1", () => {
  it("prints error and exits with 1", async () => {
    mockLoad.mockRejectedValue(new Error("Job not found: " + VALID_UUID));

    await expect(invokeRunJobShow(VALID_UUID)).rejects.toThrow("process.exit(1)");

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
      status: "awaiting-merge",
      request: { path: "/req.md", title: "Feature", type: "new-feature", slug: "my-feature" },
    });
    mockList.mockResolvedValue([older, newer]);

    await invokeRunJobShow("my-feature");

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("ccccdddd");
    expect(output).toContain("awaiting-merge");
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

/**
 * Dispatch-level regression tests for the T-11 GitHub-integration gate with job-specific flags.
 *
 * Scenario (PR #1126 review): a job started with GitHub enabled reaches awaiting-archive, then the
 * project config is switched to github.enabled: false. `job archive <slug> --with-merge` must still
 * be dispatched based on the job's saved contract — including after archive-record moved the change
 * folder to changes/archive/ (status still awaiting-archive) and the merge failed, i.e. when the job
 * is ONLY visible to JobStateStore.list with includeArchived === true.
 *
 * TC-DISPATCH-WM-01: config=false, job=enabled visible only with includeArchived → handler is dispatched
 * TC-DISPATCH-WM-02: list is queried with the archive search scope ({ includeArchived: true })
 * TC-DISPATCH-WM-03: config=false, job=disabled (archived scope) → still rejected with exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../src/state/schema.js";

const mockList = vi.hoisted(() => vi.fn());
const mockHandleJobArchive = vi.hoisted(() => vi.fn());

vi.mock("../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn().mockResolvedValue("/fake/repo"),
}));
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, github: { enabled: false } }),
}));
vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: { list: mockList },
}));
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../../src/cli/run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn(),
}));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/cli/resume.js")>();
  return { ...actual, runResumeCore: vi.fn().mockResolvedValue(0) };
});
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0), handleJobLs: vi.fn(), handleJobStats: vi.fn() }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0), handleDoctor: vi.fn(), handleDoctorRepair: vi.fn(), buildExecFile: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0), handleJobCancel: vi.fn(), VALID_JOB_ID_CHARS: /^[a-zA-Z0-9_-]+$/ }));
vi.mock("../../../src/cli/archive.js", () => ({
  runArchive: vi.fn().mockResolvedValue(0),
  handleJobArchive: vi.fn(),
  ARCHIVE_USAGE: "Archive the completed change folder",
}));
// The registry wires `job archive` to job-archive-handler.js (not archive.js).
vi.mock("../../../src/cli/job-archive-handler.js", () => ({
  handleJobArchive: mockHandleJobArchive,
}));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0), handleJobShow: vi.fn() }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn().mockResolvedValue(0),
  runManagedStatus: vi.fn().mockResolvedValue(0),
  runManagedReset: vi.fn().mockResolvedValue(0),
  handleRuntimeSetup: vi.fn(),
  handleRuntimeStatus: vi.fn(),
  handleRuntimeReset: vi.fn(),
}));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn().mockReturnValue(0),
  executeValidate: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-create.js", () => ({ executeCreate: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/request-list.js", () => ({ executeList: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/usage-show.js", () => ({ showUsage: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/usage-summary.js", () => ({ showUsageSummary: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/rules-new.js", () => ({ executeRulesNew: vi.fn().mockResolvedValue(0) }));

const SLUG = "recovered-job";

function makeAwaitingArchiveState(githubEnabled: boolean): JobState {
  return {
    version: 1,
    jobId: "job-id-recovered-0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: { path: `/fake/repo/specrunner/changes/${SLUG}/request.md`, title: "T", type: "new-feature", slug: SLUG },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: `feat/${SLUG}`,
    error: null,
    history: [],
    steps: {},
    repository: githubEnabled ? { owner: "test-owner", name: "test-repo" } : {},
    githubIntegration: { enabled: githubEnabled },
  } as unknown as JobState;
}

let originalArgv: string[];
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  // NOTE: a real process.exit never returns. The mock throws instead, and the T-11 gate's
  // try/catch swallows that throw and falls through to the handler — so assertions below use
  // the FIRST process.exit call (the gate's verdict), not the eventual thrown value.
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
  mockHandleJobArchive.mockReset();
  mockHandleJobArchive.mockResolvedValue(0);
  mockList.mockReset();
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runMain(args: string[]): Promise<void> {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
  } catch {
    // thrown by the process.exit mock
  }
}

function firstExitCode(): unknown {
  return exitSpy.mock.calls[0]?.[0];
}

function stderrContains(substring: string): boolean {
  return stderrSpy.mock.calls.some(
    (call: unknown[]) => typeof call[0] === "string" && call[0].includes(substring),
  );
}

/** The job is visible ONLY through the archive search scope (post archive-record recovery). */
function listVisibleOnlyWhenArchivedScope(state: JobState): void {
  mockList.mockImplementation(async (_root: string, listOpts?: { includeArchived?: boolean }) =>
    listOpts?.includeArchived === true ? [state] : [],
  );
}

describe("TC-DISPATCH-WM-01: config=false, enabled job only in archive scope → --with-merge is dispatched", () => {
  it("dispatches handleJobArchive instead of rejecting on the current config", async () => {
    listVisibleOnlyWhenArchivedScope(makeAwaitingArchiveState(true));

    await runMain(["job", "archive", SLUG, "--with-merge"]);

    expect(stderrContains("requires GitHub integration, which is disabled in this project")).toBe(false);
    expect(mockHandleJobArchive).toHaveBeenCalledTimes(1);
    expect(firstExitCode()).toBe(0);
  });
});

describe("TC-DISPATCH-WM-02: job contract lookup uses the archive search scope", () => {
  it("queries JobStateStore.list with { includeArchived: true }", async () => {
    listVisibleOnlyWhenArchivedScope(makeAwaitingArchiveState(true));

    await runMain(["job", "archive", SLUG, "--with-merge"]);

    expect(mockList).toHaveBeenCalledWith("/fake/repo", { includeArchived: true });
  });
});

describe("TC-DISPATCH-WM-03: config=false, disabled job in archive scope → --with-merge is still rejected", () => {
  it("exits 2 with the config-level rejection", async () => {
    listVisibleOnlyWhenArchivedScope(makeAwaitingArchiveState(false));

    await runMain(["job", "archive", SLUG, "--with-merge"]);

    expect(firstExitCode()).toBe(2);
    expect(stderrContains("--with-merge requires GitHub integration, which is disabled in this project")).toBe(true);
  });
});

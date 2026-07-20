/**
 * Integration tests for job stats repo-root resolution
 *
 * TC-006: job stats from a subdirectory equals job stats from the root
 *         (spec.md > Requirement: job stats returns the same run set from any directory in the repo > Scenario: job stats from a subdirectory equals job stats from the root)
 * TC-016: Mutation check — reverting job stats to process.cwd() reports 0 runs from subdir
 *         (tasks.md > T-03: Convert job stats to repo-root base)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn(),
  resolveRepoRootOrFail: vi.fn(),
}));

// Mock heavy CLI modules not under test
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn().mockResolvedValue(0) }));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpRepoRoot: string;
let subdir: string;

/** Create an archived run fixture inside the given repo root. */
async function createArchivedRun(repoRoot: string, slug: string, date: string): Promise<void> {
  const archiveDir = path.join(
    repoRoot,
    "specrunner",
    "changes",
    "archive",
    `${date}-${slug}`,
  );
  await fs.mkdir(archiveDir, { recursive: true });

  const state = {
    version: 2,
    jobId: `aaaabbbb-0000-0000-0000-${slug.replace(/-/g, "").slice(0, 12).padEnd(12, "0")}`,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T11:00:00.000Z`,
    request: {
      path: `${repoRoot}/specrunner/changes/${slug}/request.md`,
      title: "Fixture Feature",
      type: "new-feature",
      slug,
    },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "pr-create",
    status: "archived",
    branch: `feat/${slug}`,
    history: [],
    error: null,
    steps: {},
  };
  await fs.writeFile(path.join(archiveDir, "state.json"), JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let originalArgv: string[];
let exitSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let _cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  originalArgv = process.argv;
  tmpRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-jobstats-root-test-"));
  subdir = path.join(tmpRepoRoot, "src");
  await fs.mkdir(subdir, { recursive: true });

  // Ensure the archive directory structure exists
  await fs.mkdir(
    path.join(tmpRepoRoot, "specrunner", "changes", "archive"),
    { recursive: true },
  );

  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(async () => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
  await fs.rm(tmpRepoRoot, { recursive: true, force: true });
});

async function setRepoRoot(root: string | null): Promise<void> {
  const { resolveRepoRoot } = await import("../../../src/util/repo-root.js");
  (resolveRepoRoot as ReturnType<typeof vi.fn>).mockResolvedValue(root);
}

async function runMain(args: string[]): Promise<string | undefined> {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

/** Parse JSON output from stdout spy calls. */
function captureStdoutJson(): unknown {
  const output = (stdoutSpy.mock.calls as unknown[][])
    .map((c) => String(c[0]))
    .join("");
  return JSON.parse(output);
}

// ---------------------------------------------------------------------------
// TC-006: job stats from a subdirectory equals job stats from the root
// ---------------------------------------------------------------------------

describe("TC-006: job stats from a subdirectory equals job stats from the root", () => {
  it("reports the same run count when invoked from subdir vs repo root", async () => {
    await createArchivedRun(tmpRepoRoot, "feature-a", "2026-01-10");
    await createArchivedRun(tmpRepoRoot, "feature-b", "2026-01-11");

    // --- Run from repo root ---
    await setRepoRoot(tmpRepoRoot);
    _cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpRepoRoot);

    await runMain(["job", "stats", "--json"]).catch(() => {});

    const rootOutput = captureStdoutJson() as { runs: unknown[]; summary: { runCount: number } };
    const rootRunCount = rootOutput.summary.runCount;

    // Reset spies for second call
    stdoutSpy.mockClear();
    stderrSpy.mockClear();
    exitSpy.mockClear();
    vi.resetModules();

    // --- Run from subdir ---
    await setRepoRoot(tmpRepoRoot); // resolver still returns the same root
    _cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(subdir);

    await runMain(["job", "stats", "--json"]).catch(() => {});

    const subdirOutput = captureStdoutJson() as { runs: unknown[]; summary: { runCount: number } };
    const subdirRunCount = subdirOutput.summary.runCount;

    // After T-03 implementation: both report the same count (2 runs)
    // Before T-03 implementation: subdir run reports 0 (process.cwd() = subdir has no archive)
    // This assertion is RED before implementation.
    expect(subdirRunCount).toBe(rootRunCount);
    expect(rootRunCount).toBeGreaterThan(0);
  });

  it("run slugs are identical between repo-root and subdir invocations", async () => {
    await createArchivedRun(tmpRepoRoot, "slug-x", "2026-02-01");

    // --- Run from repo root ---
    await setRepoRoot(tmpRepoRoot);
    _cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpRepoRoot);
    await runMain(["job", "stats", "--json"]).catch(() => {});
    const rootRuns = (captureStdoutJson() as { runs: Array<{ slug: string }> }).runs;

    stdoutSpy.mockClear();
    vi.resetModules();

    // --- Run from subdir ---
    await setRepoRoot(tmpRepoRoot);
    _cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(subdir);
    await runMain(["job", "stats", "--json"]).catch(() => {});
    const subdirRuns = (captureStdoutJson() as { runs: Array<{ slug: string }> }).runs;

    // After T-03 implementation: same slugs
    // Before T-03 implementation: subdir returns empty slugs → RED ✓
    expect(subdirRuns.map((r) => r.slug).sort()).toEqual(rootRuns.map((r) => r.slug).sort());
  });
});

// ---------------------------------------------------------------------------
// TC-016: Mutation check — reverting to process.cwd() reports 0 runs from subdir
// ---------------------------------------------------------------------------

describe("TC-016: mutation check — runJobStats with subdir as cwd reports 0 runs", () => {
  /**
   * This test verifies the DETECTION MECHANISM of TC-006.
   * It calls runJobStats directly with the SUBDIR as cwd — simulating the bug
   * that would exist if command-registry.ts:683 were reverted to pass process.cwd().
   *
   * When the base is the subdir (not the repo root), no archive runs are found,
   * and the report shows 0 runs — confirming TC-006 would catch this regression.
   */
  it("runJobStats with subdir as cwd returns a report with 0 runs (no archive there)", async () => {
    await createArchivedRun(tmpRepoRoot, "feature-z", "2026-03-01");

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { runJobStats } = await import("../../../src/core/command/job-stats.js");

    // Simulate the BUG: passing subdir (process.cwd()) instead of repoRoot
    await runJobStats({ cwd: subdir, json: true });

    const output = (stdoutSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    const report = JSON.parse(output) as { summary: { runCount: number } };

    // Archive only exists under tmpRepoRoot, not under subdir → 0 runs
    // This confirms that if command-registry.ts:683 passes process.cwd() (= subdir),
    // TC-006 would catch it (subdir run count ≠ root run count).
    expect(report.summary.runCount).toBe(0);
  });
});

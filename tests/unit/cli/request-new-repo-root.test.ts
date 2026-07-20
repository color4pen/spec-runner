/**
 * Integration tests for request new / request validate repo-root resolution
 *
 * TC-003: request new outside a repository exits non-zero
 *         (spec.md > Requirement: Repo-required commands stop with a unified error outside a repository > Scenario: request new outside a repository)
 * TC-007: request new from a subdirectory targets the root drafts
 *         (spec.md > Requirement: request new writes to the repository-root drafts directory > Scenario: request new from a subdirectory targets the root drafts)
 * TC-008: request validate resolves a relative path against invoker cwd
 *         (spec.md > Requirement: user-supplied relative paths resolve against the invoker cwd > Scenario: request validate resolves a relative path against invoker cwd)
 * TC-015: Mutation check — reverting request new to process.cwd() nests output under subdir
 *         (tasks.md > T-02: Convert request new to repo-root base)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as nodeFsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Hoist mocks — must be declared before imports per vitest rules
// ---------------------------------------------------------------------------

// Mock detectWorktree to always report not-in-worktree (so the worktree guard
// does not interfere with our dispatch-level tests).
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

// We intentionally do NOT mock executeNew so we can observe where it writes.
// We DO mock resolveRepoRoot so we can control whether we're in a repo or not.
vi.mock("../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn(),
  resolveRepoRootOrFail: vi.fn(),
}));

// Mock doctor and other heavy CLI modules that are not under test
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/job-stats.js", () => ({ runJobStats: vi.fn().mockResolvedValue(0) }));

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let tmpRepoRoot: string;
let subdir: string;
let originalArgv: string[];
let exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  originalArgv = process.argv;
  tmpRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-req-root-test-"));
  subdir = path.join(tmpRepoRoot, "src");
  await fs.mkdir(subdir, { recursive: true });

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

/**
 * Drive bin/specrunner.ts main() with the given args.
 * Returns the thrown process.exit error message if exit was called,
 * or undefined if main() returned normally.
 */
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

async function setRepoRoot(root: string | null): Promise<void> {
  const { resolveRepoRoot } = await import("../../../src/util/repo-root.js");
  (resolveRepoRoot as ReturnType<typeof vi.fn>).mockResolvedValue(root);
}

// ---------------------------------------------------------------------------
// TC-003: request new outside a repository exits non-zero
// ---------------------------------------------------------------------------

describe("TC-003: request new outside a git repository exits non-zero with unified error", () => {
  it("exits with code 2 when there is no git repository (repoRoot is null)", async () => {
    // Simulate invoker cwd is NOT inside a git repository
    await setRepoRoot(null);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");

    const result = await runMain(["request", "new", "my-slug"]);

    // After T-01/T-02 implementation:
    // - dispatch detects requiresRepo: true and repoRoot: null → exits 2
    // Before implementation:
    // - executeNew runs with process.cwd() → tries to write → exits 0 (or 1/2 for other reasons)
    // This assertion fails RED before implementation.
    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);

    const stderrOutput = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    // Should mention the error (git init or repo requirement)
    expect(stderrOutput.toLowerCase()).toMatch(/git init|git repository|not a git repo/i);
  });

  it("does NOT create any specrunner/drafts/ directory when outside a repo", async () => {
    await setRepoRoot(null);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");

    await runMain(["request", "new", "my-slug"]).catch(() => {});

    // No drafts directory should be created under the (non-existent) "repo"
    const draftPath = path.join("/tmp/not-a-repo", "specrunner", "drafts", "my-slug", "request.md");
    expect(nodeFsSync.existsSync(draftPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-007: request new from a subdirectory targets the root drafts
// ---------------------------------------------------------------------------

describe("TC-007: request new from a subdirectory creates file at repo root", () => {
  it("creates specrunner/drafts/<slug>/request.md at the repo root, not under the subdir", async () => {
    // Simulate: cwd = subdir, repoRoot = tmpRepoRoot
    await setRepoRoot(tmpRepoRoot);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(subdir);

    await runMain(["request", "new", "my-slug"]).catch(() => {});

    // After T-02 implementation:
    // - dispatch passes ctx.repoRoot (= tmpRepoRoot) to executeNew
    // - file appears at tmpRepoRoot/specrunner/drafts/my-slug/request.md
    const rootDraftPath = path.join(tmpRepoRoot, "specrunner", "drafts", "my-slug", "request.md");
    expect(nodeFsSync.existsSync(rootDraftPath)).toBe(true);

    // Must NOT create the nested structure under the subdir
    const subdirDraftPath = path.join(subdir, "specrunner", "drafts", "my-slug", "request.md");
    expect(nodeFsSync.existsSync(subdirDraftPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015: Mutation check — reverting to process.cwd() nests output under subdir
// ---------------------------------------------------------------------------

describe("TC-015: mutation check — invoking executeNew with subdir as cwd creates nested structure", () => {
  /**
   * This test documents that passing the INVOKER CWD (not the repo root) to
   * executeNew creates the nested/wrong directory structure — confirming that
   * TC-007 would catch the regression if the call site were reverted.
   *
   * We test executeNew directly (not via dispatch) to simulate the reverted
   * command-registry.ts:334 state.
   */
  it("executeNew with subdir as cwd creates <subdir>/specrunner/drafts/<slug>/request.md", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { executeNew } = await import("../../../src/core/command/request-new.js");
    // Simulate the BUG: passing subdir (process.cwd()) instead of repoRoot
    await executeNew("mutation-slug", "new-feature", subdir);

    // File is created inside the subdir (the wrong location)
    const nestedPath = path.join(subdir, "specrunner", "drafts", "mutation-slug", "request.md");
    expect(nodeFsSync.existsSync(nestedPath)).toBe(true);

    // The correct root location should NOT have the file
    const rootPath = path.join(tmpRepoRoot, "specrunner", "drafts", "mutation-slug", "request.md");
    expect(nodeFsSync.existsSync(rootPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-008: request validate resolves a relative path against invoker cwd
// ---------------------------------------------------------------------------

describe("TC-008: request validate resolves relative path against invoker cwd", () => {
  /**
   * Role (b): user-supplied relative paths are resolved against the INVOKER cwd,
   * not the repo root. This behavior must NOT change with this PR.
   */
  it("validates a file relative to invoker cwd (subdir) and exits 0", async () => {
    // Put a valid minimal request.md in the subdir (where the invoker cwd is)
    const validRequestContent = `# Test Request

## Meta

- **type**: new-feature
- **slug**: test-slug
- **base-branch**: main
- **adr**: false

## 背景

test background

## 要件

1. test requirement

## 受け入れ基準

- [ ] T1: test passes
`;
    await fs.writeFile(path.join(subdir, "foo.md"), validRequestContent);

    // Repo root is the parent (repoRoot = tmpRepoRoot, cwd = subdir)
    await setRepoRoot(tmpRepoRoot);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(subdir);

    // Run validate with a relative path "foo.md" — should resolve to subdir/foo.md
    await runMain(["request", "validate", "foo.md"]).catch(() => undefined);

    // Key assertion: the file was FOUND (path resolved against invoker cwd = subdir).
    // If the path were resolved against repo root instead, "is neither a file path"
    // would appear in stderr because subdir/foo.md doesn't exist at tmpRepoRoot/foo.md.
    const stderrOutput = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(stderrOutput).not.toMatch(/is neither a file path/i);

    // The FIRST exit code should be 0 (validate found and parsed the file successfully).
    // Note: due to the process.exit mock throwing, the outer catch in main() may emit
    // a second process.exit(1) — we check only the first call, which is the true result.
    const firstExitCode = (exitSpy.mock.calls as unknown[][])[0]?.[0];
    expect(firstExitCode).toBe(0);
  });
});

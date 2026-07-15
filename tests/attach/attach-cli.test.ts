/**
 * Tests for src/cli/attach.ts (T-08).
 *
 * TC-CLI-001: --branch flag missing → exit 2 (arg error via command-registry)
 * TC-CLI-002: worktree guard triggered → non-zero exit with hint
 * TC-CLI-003: managed runtime → ATTACH_RUNTIME_UNSUPPORTED exit code
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("../../src/core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({
    isSpecrunnerWorktree: false,
    mainCheckoutPath: null,
  }),
}));

vi.mock("../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    runtime: "local",
    github: {},
    workspace: {},
  }),
}));

vi.mock("../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({
    token: "ghp_test_token",
    source: "env",
  }),
}));

vi.mock("../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({
    owner: "acme",
    name: "repo",
  }),
}));

vi.mock("../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn().mockResolvedValue("/fake/repo"),
}));

vi.mock("../../src/core/attach/orchestrator.js", () => ({
  runAttachVerification: vi.fn().mockResolvedValue({
    slug: "my-feature",
    jobId: "test-job-id-12345678",
    branch: "feat/my-feature-1234abcd",
    state: {
      status: "awaiting-resume",
      request: { baseBranch: "main" },
    },
  }),
}));

vi.mock("../../src/core/runtime/local.js", () => ({
  LocalRuntime: vi.fn().mockImplementation(() => ({
    setupWorkspace: vi.fn().mockResolvedValue({
      cwd: "/fake/repo/.git/specrunner-worktrees/my-feature-12345678",
      worktreePath: "/fake/repo/.git/specrunner-worktrees/my-feature-12345678",
      branch: "feat/my-feature-1234abcd",
    }),
  })),
}));

vi.mock("../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/git/transport-auth.js", () => ({
  createTransportAuth: vi.fn().mockReturnValue({
    wrapSpawn: vi.fn().mockReturnValue(vi.fn()),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-cli-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// TC-CLI-001: --branch missing in command-registry → exit 2
// ---------------------------------------------------------------------------
describe("TC-CLI-001: --branch flag missing → arg error (exit 2)", () => {
  it("command-registry exits 2 when --branch is omitted", async () => {
    // We test that the registry handler calls process.exit(2) when --branch is absent.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { COMMANDS } = await import("../../src/cli/command-registry.js");
    const jobCmd = COMMANDS["job"] as import("../../src/cli/command-registry.js").ParentCommandDef;
    const attachCmd = jobCmd.subcommands["attach"] as import("../../src/cli/command-registry.js").CommandDef;

    // Call handler with no --branch flag (branch = undefined)
    await expect(
      attachCmd.handler({
        flags: {},
        positionals: [],
      }),
    ).rejects.toThrow("process.exit called");

    // Should have been called with EXIT_CODE.ARG_ERROR = 2
    expect(exitSpy).toHaveBeenCalledWith(2);
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TC-CLI-002: worktree guard triggered → non-zero exit
// ---------------------------------------------------------------------------
describe("TC-CLI-002: worktree guard triggered → non-zero exit", () => {
  it("runAttach returns non-zero exit code when called from inside a specrunner worktree", async () => {
    const { detectSpecrunnerWorktree } = await import("../../src/core/worktree/detection.js");
    vi.mocked(detectSpecrunnerWorktree).mockResolvedValueOnce({
      isSpecrunnerWorktree: true,
      mainCheckoutPath: "/fake/repo",
    });

    const { runAttach } = await import("../../src/cli/attach.js");
    const exitCode = await runAttach({
      branch: "feat/my-feature-1234abcd",
      cwd: tempDir,
    });

    // worktreeGuardError has exitCode = 2 (ARG_ERROR)
    expect(exitCode).toBe(2);

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStderr = stderrCalls.map((args) => String(args[0])).join("\n");
    expect(allStderr).toMatch(/Hint:/);
  });
});

// ---------------------------------------------------------------------------
// TC-CLI-003: managed runtime → ATTACH_RUNTIME_UNSUPPORTED
// ---------------------------------------------------------------------------
describe("TC-CLI-003: managed runtime → ATTACH_RUNTIME_UNSUPPORTED exit code", () => {
  it("runAttach returns non-zero exit code when config.runtime is not local", async () => {
    const { loadConfig } = await import("../../src/config/store.js");
    vi.mocked(loadConfig).mockResolvedValueOnce({
      runtime: "managed" as "local",
      github: {},
      workspace: {},
    } as import("../../src/config/schema.js").SpecRunnerConfig);

    const { runAttach } = await import("../../src/cli/attach.js");
    const exitCode = await runAttach({
      branch: "feat/my-feature-1234abcd",
      cwd: tempDir,
    });

    expect(exitCode).not.toBe(0);

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const allStderr = stderrCalls.map((args) => String(args[0])).join("\n");
    expect(allStderr).toMatch(/Hint:/);
  });
});

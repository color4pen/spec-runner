/**
 * Unit tests for CLI wiring: runArchive (withMerge:false) → runPlainArchive.
 * Verifies that token / origin resolution feeds githubClient to runPlainArchive,
 * and that failures in token/origin are non-fatal.
 *
 * TC-027: withMerge:false → runPlainArchive called, runMergeThenArchive NOT called
 * TC-028: GitHub token resolution fails → runPlainArchive called with githubClient: undefined, exit 0
 * TC-029: token + origin succeed → githubClient / owner / repo passed to runPlainArchive
 * TC-030: withMerge:true → runMergeThenArchive called, runPlainArchive NOT called
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("../../../src/core/archive/plain-archive.js", () => ({
  runPlainArchive: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

vi.mock("../../../src/core/archive/merge-then-archive.js", () => ({
  runMergeThenArchive: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    agents: {},
    archive: {},
  }),
}));

vi.mock("../../../src/core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "ghp_test_token", source: "env" }),
}));

vi.mock("../../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", name: "test-repo" }),
}));

vi.mock("../../../src/adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({ __isMockClient: true }),
}));

vi.mock("../../../src/core/lifecycle/exit-guard.js", () => ({
  registerExitGuard: vi.fn(),
}));

vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
    listWithSourceDirs: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockRejectedValue(new Error("not found")),
}));

vi.mock("../../../src/logger/pipeline-logger.js", () => ({
  initPipelineLog: vi.fn(),
  logPipelineEvent: vi.fn(),
  closePipelineLog: vi.fn(),
}));

vi.mock("../../../src/logger/stdout.js", () => ({
  logResult: vi.fn(),
  logError: vi.fn(),
  stderrWrite: vi.fn(),
}));

vi.mock("../../../src/config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

vi.mock("../../../src/config/schema.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/config/schema.js")>();
  return {
    ...original,
    resolveDesignLayerConfig: vi.fn().mockReturnValue({
      enabled: false,
      command: "aozu",
      requireCitationTypes: [],
      topicEmission: false,
    }),
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug-plain-detection";
const TEST_CWD = "/tmp/test-cwd-plain";

// Lazily resolved imports shared across all tests (mocked versions).
// We import once and reuse — the module cache keeps these consistent.
let runPlainArchive: ReturnType<typeof vi.fn>;
let runMergeThenArchive: ReturnType<typeof vi.fn>;
let runArchive: (opts: {
  slug: string;
  cwd: string;
  withMerge?: boolean;
  mergeWaitMs?: number;
}) => Promise<number>;
let resolveGitHubToken: ReturnType<typeof vi.fn>;
let getOriginInfo: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Import mocked modules once per test lifecycle.
  const plainArchiveMod = await import("../../../src/core/archive/plain-archive.js");
  runPlainArchive = plainArchiveMod.runPlainArchive as ReturnType<typeof vi.fn>;

  const mergeThenArchiveMod = await import("../../../src/core/archive/merge-then-archive.js");
  runMergeThenArchive = mergeThenArchiveMod.runMergeThenArchive as ReturnType<typeof vi.fn>;

  const archiveMod = await import("../../../src/cli/archive.js");
  runArchive = archiveMod.runArchive;

  const credMod = await import("../../../src/core/credentials/github.js");
  resolveGitHubToken = credMod.resolveGitHubToken as ReturnType<typeof vi.fn>;

  const remoteMod = await import("../../../src/git/remote.js");
  getOriginInfo = remoteMod.getOriginInfo as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-027: withMerge:false → runPlainArchive called, runMergeThenArchive NOT called
// ---------------------------------------------------------------------------
describe("TC-027: withMerge:false → runPlainArchive called, runMergeThenArchive NOT called", () => {
  it("delegates to runPlainArchive when withMerge is false", async () => {
    await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    expect(runPlainArchive).toHaveBeenCalled();
    expect(runMergeThenArchive).not.toHaveBeenCalled();
  });

  it("withMerge defaulting to undefined also delegates to runPlainArchive", async () => {
    await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD });

    expect(runPlainArchive).toHaveBeenCalled();
    expect(runMergeThenArchive).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-028: GitHub token resolution fails → runPlainArchive called with githubClient: undefined, exit 0
// ---------------------------------------------------------------------------
describe("TC-028: token resolution fails → runPlainArchive with githubClient: undefined, exit 0", () => {
  it("when resolveGitHubToken throws, runPlainArchive is called with githubClient: undefined", async () => {
    // Use mockRejectedValueOnce to limit override to a single call.
    resolveGitHubToken.mockRejectedValueOnce(new Error("no token available"));

    const exitCode = await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    expect(exitCode).toBe(0);
    expect(runPlainArchive).toHaveBeenCalled();
    const callArgs = runPlainArchive.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.githubClient).toBeUndefined();
  });

  it("when getOriginInfo throws, runPlainArchive is called with githubClient: undefined", async () => {
    // Use mockRejectedValueOnce to limit override to a single call.
    getOriginInfo.mockRejectedValueOnce(new Error("no remote origin"));

    const exitCode = await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    expect(exitCode).toBe(0);
    expect(runPlainArchive).toHaveBeenCalled();
    const callArgs = runPlainArchive.mock.calls[0]?.[0];
    expect(callArgs.githubClient).toBeUndefined();
    // owner and repo also undefined when origin resolution fails
    expect(callArgs.owner).toBeUndefined();
    expect(callArgs.repo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-029: token + origin succeed → githubClient / owner / repo passed to runPlainArchive
// ---------------------------------------------------------------------------
describe("TC-029: token + origin succeed → githubClient / owner / repo passed to runPlainArchive", () => {
  it("passes githubClient, owner, and repo to runPlainArchive when all succeed", async () => {
    // Default mocks already make token + origin succeed.
    await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    expect(runPlainArchive).toHaveBeenCalled();
    const callArgs = runPlainArchive.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    // githubClient is the mock object returned by createGitHubClient
    expect(callArgs.githubClient).toBeDefined();
    expect(callArgs.owner).toBe("test-owner");
    expect(callArgs.repo).toBe("test-repo");
  });

  it("also passes slug and cwd to runPlainArchive", async () => {
    await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    const callArgs = runPlainArchive.mock.calls[0]?.[0];
    expect(callArgs.slug).toBe(TEST_SLUG);
    expect(callArgs.cwd).toBe(TEST_CWD);
  });

  it("returns exit code from runPlainArchive", async () => {
    runPlainArchive.mockResolvedValueOnce({ exitCode: 0, headSha: "abc123" });

    const exitCode = await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: false });

    expect(exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-030: withMerge:true → runMergeThenArchive called, runPlainArchive NOT called
// ---------------------------------------------------------------------------
describe("TC-030: withMerge:true → runMergeThenArchive called, runPlainArchive NOT called", () => {
  it("delegates to runMergeThenArchive when withMerge is true", async () => {
    await runArchive({ slug: TEST_SLUG, cwd: TEST_CWD, withMerge: true });

    expect(runMergeThenArchive).toHaveBeenCalled();
    expect(runPlainArchive).not.toHaveBeenCalled();
  });
});

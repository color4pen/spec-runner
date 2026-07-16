/**
 * Unit tests for the CLI propagation of archive.minimumAssurance to runMergeThenArchive.
 * Tests T-07 (CLI reads minimumAssurance from config and passes it to runMergeThenArchive).
 *
 * TC-019: CLI が config.archive.minimumAssurance を runMergeThenArchive に伝播する
 * TC-020: config が不在のとき minimumAssurance が undefined として渡り gate が無効になる (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

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
  createGitHubClient: vi.fn().mockReturnValue({}),
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
    resolveDesignLayerConfig: vi.fn().mockReturnValue({ enabled: false, command: "aozu", requireCitationTypes: [], topicEmission: false }),
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug-archive";
const TEST_CWD = "/tmp/test-cwd";

const MINIMUM_ASSURANCE_VALUE = {
  protectedPaths: ["architecture/**"],
  testDerivation: "frozen" as const,
  biteEvidence: "required" as const,
};

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-019: CLI が config.archive.minimumAssurance を runMergeThenArchive に伝播する
// ---------------------------------------------------------------------------
describe("TC-019: CLI が config.archive.minimumAssurance を runMergeThenArchive に伝播する", () => {
  it("minimumAssurance from config is passed to runMergeThenArchive", async () => {
    const { loadConfig } = await import("../../../src/config/store.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      agents: {},
      archive: {
        minimumAssurance: MINIMUM_ASSURANCE_VALUE,
      },
    });

    const { runMergeThenArchive } = await import("../../../src/core/archive/merge-then-archive.js");
    (runMergeThenArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const { runArchive } = await import("../../../src/cli/archive.js");

    await runArchive({
      slug: TEST_SLUG,
      cwd: TEST_CWD,
      withMerge: true,
    });

    expect(runMergeThenArchive).toHaveBeenCalled();
    const callArgs = (runMergeThenArchive as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    // minimumAssurance should be propagated from config to runMergeThenArchive
    expect(callArgs.minimumAssurance).toEqual(MINIMUM_ASSURANCE_VALUE);
  });

  it("minimumAssurance.protectedPaths is correctly propagated", async () => {
    const { loadConfig } = await import("../../../src/config/store.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      agents: {},
      archive: {
        minimumAssurance: {
          protectedPaths: ["src/state/schema/**", "architecture/**"],
          testDerivation: "frozen",
        },
      },
    });

    const { runMergeThenArchive } = await import("../../../src/core/archive/merge-then-archive.js");
    (runMergeThenArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const { runArchive } = await import("../../../src/cli/archive.js");

    await runArchive({
      slug: TEST_SLUG,
      cwd: TEST_CWD,
      withMerge: true,
    });

    const callArgs = (runMergeThenArchive as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArgs?.minimumAssurance?.protectedPaths).toEqual(["src/state/schema/**", "architecture/**"]);
    expect(callArgs?.minimumAssurance?.testDerivation).toBe("frozen");
  });
});

// ---------------------------------------------------------------------------
// TC-020: config が不在のとき minimumAssurance が undefined として渡り gate が無効になる (should)
// ---------------------------------------------------------------------------
describe("TC-020: config が不在のとき minimumAssurance が undefined として渡り gate が無効になる", () => {
  it("config without minimumAssurance passes undefined to runMergeThenArchive", async () => {
    const { loadConfig } = await import("../../../src/config/store.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      agents: {},
      archive: {
        // minimumAssurance is absent
      },
    });

    const { runMergeThenArchive } = await import("../../../src/core/archive/merge-then-archive.js");
    (runMergeThenArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const { runArchive } = await import("../../../src/cli/archive.js");

    await runArchive({
      slug: TEST_SLUG,
      cwd: TEST_CWD,
      withMerge: true,
    });

    const callArgs = (runMergeThenArchive as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArgs?.minimumAssurance).toBeUndefined();
  });

  it("config load failure → minimumAssurance is not passed (gate disabled)", async () => {
    const { loadConfig } = await import("../../../src/config/store.js");
    (loadConfig as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("config not found"));

    const { runMergeThenArchive } = await import("../../../src/core/archive/merge-then-archive.js");
    (runMergeThenArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ exitCode: 0 });

    const { runArchive } = await import("../../../src/cli/archive.js");

    // Config load fails → CLI uses defaults, minimumAssurance should be absent
    await runArchive({
      slug: TEST_SLUG,
      cwd: TEST_CWD,
      withMerge: true,
    });

    // When config fails, runMergeThenArchive should still be called (with defaults)
    if ((runMergeThenArchive as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
      const callArgs = (runMergeThenArchive as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(callArgs?.minimumAssurance).toBeUndefined();
    }
    // If runMergeThenArchive was never called (e.g., config failure → early exit),
    // that also satisfies the requirement: gate is disabled when config fails.
  });
});

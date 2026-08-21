/**
 * Tests for job attach (CLI attach.ts)
 *
 * TC-005: awaiting-archive checkpoint の attach が成功し archive hint が出力される
 * TC-006: awaiting-resume checkpoint の attach が成功し resume hint が出力される
 * TC-007: non-quiescent checkpoint の attach が not-quiescent で reject される
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  logResult: vi.fn(),
  stdoutWrite: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    github: {},
    runtime: "local",
    workspace: undefined,
  }),
}));

vi.mock("../../core/credentials/github.js", () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue({ token: "test-token" }),
}));

vi.mock("../../config/github-host.js", () => ({
  resolveGitHubHost: vi.fn().mockReturnValue("github.com"),
  resolveGitHubApiBaseUrl: vi.fn().mockReturnValue("https://api.github.com"),
}));

vi.mock("../../git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", name: "test-repo" }),
}));

vi.mock("../../git/transport-auth.js", () => ({
  createTransportAuth: vi.fn().mockReturnValue({
    wrapSpawn: vi.fn((base: unknown) => base),
  }),
}));

vi.mock("../../util/spawn.js", () => ({
  spawnCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
}));

vi.mock("../../adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../../core/attach/orchestrator.js", () => ({
  runAttachVerification: vi.fn(),
}));

vi.mock("../../core/runtime/local.js", () => ({
  LocalRuntime: vi.fn(function () {
    return { setupWorkspace: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runAttach } from "../attach.js";
import { runAttachVerification } from "../../core/attach/orchestrator.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpts(branch = "feat/test-branch") {
  return { branch, cwd: "/fake/repo", repoRoot: "/fake/repo" };
}

function makeVerified(status: "awaiting-resume" | "awaiting-archive") {
  return {
    slug: "test-slug",
    jobId: "test-job-id",
    branch: "feat/test-branch",
    checkpointOid: "abc123oid",
    state: {
      status,
      request: { baseBranch: "main", slug: "test-slug" },
      repository: { owner: "test-owner", name: "test-repo" },
    },
  };
}

// ---------------------------------------------------------------------------
// TC-005: awaiting-archive attach succeeds with archive hint
// ---------------------------------------------------------------------------

describe("TC-005: awaiting-archive checkpoint attach succeeds with archive hint", () => {
  beforeEach(() => {
    vi.mocked(runAttachVerification).mockResolvedValue(
      makeVerified("awaiting-archive") as Awaited<ReturnType<typeof runAttachVerification>>,
    );
    vi.mocked(stderrWrite).mockClear();
    vi.mocked(logResult).mockClear();
  });

  it("TC-005: returns exit code 0", async () => {
    const code = await runAttach(makeOpts());
    expect(code).toBe(0);
  });

  it("TC-005: hint contains 'job archive' and '--with-merge'", async () => {
    await runAttach(makeOpts());
    const hints = vi.mocked(stderrWrite).mock.calls.map((c) => String(c[0]));
    expect(hints.some((h) => h.includes("job archive") && h.includes("--with-merge"))).toBe(true);
  });

  it("TC-005: hint does NOT contain 'job resume'", async () => {
    await runAttach(makeOpts());
    const hints = vi.mocked(stderrWrite).mock.calls.map((c) => String(c[0]));
    expect(hints.some((h) => h.includes("job resume"))).toBe(false);
  });

  it("TC-005: runAttachVerification is called with attachQuiescentPolicy", async () => {
    await runAttach(makeOpts());
    expect(vi.mocked(runAttachVerification)).toHaveBeenCalledWith(
      expect.objectContaining({ policy: expect.objectContaining({ verify: expect.any(Function) }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-006: awaiting-resume attach succeeds with resume hint
// ---------------------------------------------------------------------------

describe("TC-006: awaiting-resume checkpoint attach succeeds with resume hint", () => {
  beforeEach(() => {
    vi.mocked(runAttachVerification).mockResolvedValue(
      makeVerified("awaiting-resume") as Awaited<ReturnType<typeof runAttachVerification>>,
    );
    vi.mocked(stderrWrite).mockClear();
  });

  it("TC-006: returns exit code 0", async () => {
    const code = await runAttach(makeOpts());
    expect(code).toBe(0);
  });

  it("TC-006: hint contains 'job resume'", async () => {
    await runAttach(makeOpts());
    const hints = vi.mocked(stderrWrite).mock.calls.map((c) => String(c[0]));
    expect(hints.some((h) => h.includes("job resume"))).toBe(true);
  });

  it("TC-006: hint does NOT contain 'job archive'", async () => {
    await runAttach(makeOpts());
    const hints = vi.mocked(stderrWrite).mock.calls.map((c) => String(c[0]));
    expect(hints.some((h) => h.includes("job archive"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-007: non-quiescent checkpoint attach is rejected
// ---------------------------------------------------------------------------

describe("TC-007: non-quiescent checkpoint attach is rejected", () => {
  beforeEach(() => {
    vi.mocked(runAttachVerification).mockRejectedValue(
      new SpecRunnerError(
        ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE,
        "hint",
        "Checkpoint is not attachable: not-quiescent",
      ),
    );
    vi.mocked(stderrWrite).mockClear();
  });

  it("TC-007: returns non-zero exit code", async () => {
    const code = await runAttach(makeOpts());
    expect(code).not.toBe(0);
  });
});

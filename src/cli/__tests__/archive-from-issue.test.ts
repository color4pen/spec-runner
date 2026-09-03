/**
 * Tests for job archive --from-issue CLI handler
 *
 * TC-015: slug と --from-issue 同時指定で exit 2
 * TC-016: slug も --from-issue も指定なしで exit 2
 * TC-017: --with-merge が from-issue 経路を通じて archive 実行に引き継がれる
 * TC-018: local state 存在時に locator / rebind を経ずに archive へ直行する
 * TC-019: rebind 後に awaiting-archive policy で検証され --with-merge 付き archive が実行される
 * TC-025: 非 local runtime で attachRuntimeUnsupportedError を返す
 * TC-026: ARCHIVE_USAGE に --from-issue の記述が含まれる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("../load-config-with-overlay.js", () => ({
  loadConfigWithOverlay: vi.fn().mockResolvedValue({
    github: {},
    runtime: "local",
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

vi.mock("../../adapter/github/github-client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({
    listIssueComments: vi.fn().mockResolvedValue([]),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("../../git/transport-auth.js", () => ({
  createTransportAuth: vi.fn().mockReturnValue({
    wrapSpawn: vi.fn((base: unknown) => base),
  }),
}));

vi.mock("../../util/spawn.js", () => ({
  spawnCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
}));

vi.mock("../../core/issue-target/archive.js", () => ({
  resolveCompletedJobId: vi.fn().mockResolvedValue("test-job-id"),
  resolveArchiveBranchFromIssue: vi.fn().mockResolvedValue({
    branch: "feat/test-branch",
    slug: "test-slug",
    checkpointOid: "abc123oid",
  }),
}));

vi.mock("../../core/job-access/load-by-job-id.js", () => ({
  loadStateByJobId: vi.fn().mockRejectedValue(
    Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
  ),
}));

vi.mock("../../state/job-slug.js", () => ({
  getJobSlug: vi.fn().mockReturnValue("local-slug"),
}));

vi.mock("../../core/attach/orchestrator.js", () => ({
  runAttachVerification: vi.fn().mockResolvedValue({
    slug: "test-slug",
    jobId: "test-job-id",
    branch: "feat/test-branch",
    checkpointOid: "abc123oid",
    state: {
      status: "awaiting-archive",
      request: { baseBranch: "main", slug: "test-slug" },
      repository: { owner: "test-owner", name: "test-repo" },
    },
  }),
}));

vi.mock("../../core/runtime/local.js", () => ({
  LocalRuntime: vi.fn(function () {
    return { setupWorkspace: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// importOriginal for archive.js: ARCHIVE_USAGE (re-exported via command-registry.ts) must be real.
// handleJobArchive is the real handler; runArchive is mocked to prevent real archive operations.
vi.mock("../archive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../archive.js")>();
  return {
    ...actual,
    runArchive: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../../core/archive/job-context.js", () => ({
  resolveArchivedSlugByJobId: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runArchiveFromIssue } from "../archive-from-issue.js";
import { COMMANDS, ARCHIVE_USAGE } from "../command-registry.js";
import { logError } from "../../logger/stdout.js";
import { runArchive } from "../archive.js";
import { loadStateByJobId } from "../../core/job-access/load-by-job-id.js";
import { runAttachVerification } from "../../core/attach/orchestrator.js";
import { resolveCompletedJobId, resolveArchiveBranchFromIssue } from "../../core/issue-target/archive.js";
import { loadConfigWithOverlay } from "../load-config-with-overlay.js";
import { findTopic } from "../../core/command/guide.js";
import { resolveArchivedSlugByJobId } from "../../core/archive/job-context.js";
import { archiveFromIssueUnconfirmedError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx() {
  return { repoRoot: "/fake/repo", invokerCwd: "/fake/repo" };
}

function getArchiveHandler() {
  return COMMANDS["job"]!.children!["archive"]!.handler!;
}

function _exitSpy() {
  let capturedCode: number | undefined;
  const spy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    capturedCode = code as number;
    throw new Error(`process.exit(${code})`);
  });
  return Object.assign(spy, { capturedCode: () => capturedCode });
}

// ---------------------------------------------------------------------------
// TC-018: local state exists → skip locator/rebind, go direct to archive
// ---------------------------------------------------------------------------

describe("TC-018: local state exists → locator and rebind are skipped", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockResolvedValue({
      jobId: "test-job-id",
      request: { slug: "local-slug", baseBranch: "main", path: "" },
      branch: "feat/local",
      status: "awaiting-archive",
    } as unknown as Awaited<ReturnType<typeof loadStateByJobId>>);
    vi.mocked(resolveArchiveBranchFromIssue).mockClear();
    vi.mocked(runAttachVerification).mockClear();
    vi.mocked(resolveArchivedSlugByJobId).mockClear();
    vi.mocked(runArchive).mockResolvedValue(0);
  });

  it("TC-018: resolveArchiveBranchFromIssue is NOT called when local state found", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveArchiveBranchFromIssue)).not.toHaveBeenCalled();
  });

  it("TC-018: runAttachVerification is NOT called when local state found", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled();
  });

  it("TC-018: resolveArchivedSlugByJobId is NOT called when local state found", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveArchivedSlugByJobId)).not.toHaveBeenCalled();
  });

  it("TC-018: runArchive is called with slug from local state", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runArchive)).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "local-slug" }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-019: no local state → rebind (awaiting-archive policy) → runArchive
// ---------------------------------------------------------------------------

describe("TC-019: no local state → rebind with awaiting-archive policy → archive", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    // archive record fallback returns null → falls through to closing PR path
    vi.mocked(resolveArchivedSlugByJobId).mockResolvedValue(null);
    vi.mocked(resolveCompletedJobId).mockResolvedValue("test-job-id");
    vi.mocked(resolveArchiveBranchFromIssue).mockResolvedValue({
      branch: "feat/test-branch",
      slug: "test-slug",
      checkpointOid: "abc123oid",
    });
    vi.mocked(runAttachVerification).mockResolvedValue({
      slug: "test-slug",
      jobId: "test-job-id",
      branch: "feat/test-branch",
      checkpointOid: "abc123oid",
      state: {
        status: "awaiting-archive",
        request: { baseBranch: "main", slug: "test-slug" },
        repository: { owner: "test-owner", name: "test-repo" },
      },
    } as Awaited<ReturnType<typeof runAttachVerification>>);
    vi.mocked(runArchive).mockResolvedValue(0);
  });

  it("TC-019: resolveCompletedJobId is called with issueNumber", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveCompletedJobId)).toHaveBeenCalledWith(
      expect.objectContaining({ issueNumber: 42 }),
    );
  });

  it("TC-019: resolveArchiveBranchFromIssue is called with resolved jobId", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveArchiveBranchFromIssue)).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "test-job-id", issueNumber: 42 }),
    );
  });

  it("TC-019: runAttachVerification is called with awaiting-archive policy", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runAttachVerification)).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "feat/test-branch",
        policy: expect.objectContaining({ verify: expect.any(Function) }),
      }),
    );
  });

  it("TC-019: runArchive is called with verified slug", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runArchive)).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "test-slug" }),
    );
  });

  it("TC-019: returns 0 on happy path", async () => {
    const code = await runArchiveFromIssue(42, {}, makeCtx());
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-017: --with-merge is carried through to runArchive
// ---------------------------------------------------------------------------

describe("TC-017: --with-merge is carried through the from-issue path", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockResolvedValue({
      jobId: "test-job-id",
      request: { slug: "local-slug", baseBranch: "main", path: "" },
      branch: "feat/local",
      status: "awaiting-archive",
    } as unknown as Awaited<ReturnType<typeof loadStateByJobId>>);
    vi.mocked(runArchive).mockResolvedValue(0);
  });

  it("TC-017: runArchive receives withMerge=true when --with-merge is set", async () => {
    await runArchiveFromIssue(42, { withMerge: true }, makeCtx());
    expect(vi.mocked(runArchive)).toHaveBeenCalledWith(
      expect.objectContaining({ withMerge: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// New: post-merge / head branch deleted → archive record fallback hits
// ---------------------------------------------------------------------------

describe("post-merge: archive record fallback resolves slug, skips branch fetch and rebind", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(resolveArchivedSlugByJobId).mockResolvedValue("archived-slug");
    vi.mocked(resolveArchiveBranchFromIssue).mockClear();
    vi.mocked(runAttachVerification).mockClear();
    vi.mocked(runArchive).mockResolvedValue(0);
  });

  it("resolveArchiveBranchFromIssue is NOT called (no branch fetch)", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveArchiveBranchFromIssue)).not.toHaveBeenCalled();
  });

  it("runAttachVerification is NOT called (no rebind)", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled();
  });

  it("runArchive is called with the archive record slug", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runArchive)).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "archived-slug" }),
    );
  });

  it("returns 0 (runArchive exits successfully)", async () => {
    const code = await runArchiveFromIssue(42, {}, makeCtx());
    expect(code).toBe(0);
  });
});

describe("TC-013: resolveArchivedSlugByJobId receives exact jobId and issueNumber", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(resolveCompletedJobId).mockResolvedValue("test-job-id");
    vi.mocked(resolveArchivedSlugByJobId).mockResolvedValue(null);
  });

  it("TC-013: called with { jobId: 'test-job-id', issueNumber: 42 }", async () => {
    await runArchiveFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveArchivedSlugByJobId)).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "test-job-id", issueNumber: 42 }),
    );
  });
});

describe("fallback miss + closing PR also fails → ARCHIVE_FROM_ISSUE_UNCONFIRMED", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(resolveArchivedSlugByJobId).mockResolvedValue(null);
    vi.mocked(resolveArchiveBranchFromIssue).mockRejectedValue(
      archiveFromIssueUnconfirmedError("no confirmed PR"),
    );
  });

  it("returns ARCHIVE_FROM_ISSUE_UNCONFIRMED exit code (2)", async () => {
    const code = await runArchiveFromIssue(42, {}, makeCtx());
    expect(code).toBe(2); // EXIT_CODE.ARG_ERROR
  });
});

// ---------------------------------------------------------------------------
// TC-025: non-local runtime → attachRuntimeUnsupportedError
// ---------------------------------------------------------------------------

describe("TC-025: non-local runtime returns attachRuntimeUnsupportedError", () => {
  beforeEach(() => {
    vi.mocked(loadConfigWithOverlay).mockResolvedValue({
      github: {},
      runtime: "managed",
    } as unknown as Awaited<ReturnType<typeof loadConfigWithOverlay>>);
  });

  afterEach(() => {
    vi.mocked(loadConfigWithOverlay).mockResolvedValue({
      github: {},
      runtime: "local",
    } as unknown as Awaited<ReturnType<typeof loadConfigWithOverlay>>);
  });

  it("TC-025: returns non-zero exit code for managed runtime", async () => {
    const code = await runArchiveFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-015: slug + --from-issue together → exit 2
// ---------------------------------------------------------------------------

describe("TC-015: slug and --from-issue together exits 2", () => {
  it("TC-015: handler exits with 2 when both slug and --from-issue are provided", async () => {
    const handler = getArchiveHandler();
    vi.mocked(logError).mockClear();
    const result = await handler(
      { flags: { "from-issue": 5 }, positional: "my-slug", positionals: ["my-slug"] },
      makeCtx(),
    );
    expect(result).toBe(2);
  });

  it("TC-015: error message includes 'mutually exclusive'", async () => {
    const handler = getArchiveHandler();
    vi.mocked(logError).mockClear();
    await handler(
      { flags: { "from-issue": 5 }, positional: "my-slug", positionals: ["my-slug"] },
      makeCtx(),
    );
    const calls = vi.mocked(logError).mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes("mutually exclusive"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016: neither slug nor --from-issue → exit 2
// ---------------------------------------------------------------------------

describe("TC-016: neither slug nor --from-issue exits 2", () => {
  it("TC-016: handler exits with 2 when no slug and no --from-issue", async () => {
    const handler = getArchiveHandler();
    const result = await handler(
      { flags: {}, positional: undefined, positionals: [] },
      makeCtx(),
    );
    expect(result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-026: ARCHIVE_USAGE contains --from-issue and slug exclusivity
// ---------------------------------------------------------------------------

describe("TC-026: ARCHIVE_USAGE contains --from-issue and slug exclusivity description", () => {
  it("TC-026: ARCHIVE_USAGE includes --from-issue", () => {
    expect(ARCHIVE_USAGE).toContain("--from-issue");
  });

  it("TC-026: ARCHIVE_USAGE mentions exclusivity with slug", () => {
    // The usage text explains that <slug> and --from-issue are mutually exclusive
    expect(ARCHIVE_USAGE).toMatch(/mutually exclusive|exactly one/i);
  });
});

// ---------------------------------------------------------------------------
// TC-027: guide jobs topic contains "archive --from-issue"
// ---------------------------------------------------------------------------

describe("TC-027: guide jobs topic includes archive --from-issue", () => {
  it("TC-027: jobs topic body contains 'archive --from-issue'", () => {
    const topic = findTopic("jobs");
    expect(topic).toBeDefined();
    expect(topic!.body).toContain("archive --from-issue");
  });
});

// ---------------------------------------------------------------------------
// TC-028: guide merge topic includes issue-origin archive and job attach --branch
// ---------------------------------------------------------------------------

describe("TC-028: guide merge topic includes issue-origin archive and job attach --branch", () => {
  it("TC-028: merge topic body contains issue-origin archive description", () => {
    const topic = findTopic("merge");
    expect(topic).toBeDefined();
    expect(topic!.body).toMatch(/from-issue|issue 起点|issue.*取り込み/i);
  });

  it("TC-028: merge topic body contains 'job attach --branch' manual path", () => {
    const topic = findTopic("merge");
    expect(topic).toBeDefined();
    expect(topic!.body).toContain("job attach --branch");
  });
});


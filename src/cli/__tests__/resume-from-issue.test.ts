/**
 * Tests for job resume --from-issue
 *
 * TC-001: linked branch form resolves through the full chain
 * TC-002: linked PR head form resolves through the full chain
 * TC-010: existing local state short-circuits to resume (no rebind)
 * TC-011: rebind verification failure propagates unchanged
 * TC-012: positional slug and --from-issue together is a usage error
 * TC-013: --from-issue combines with --detach
 * TC-014: usage text documents --from-issue
 * TC-020: RESUME_FROM_ISSUE_* error codes exist and factories return matching codes
 * TC-021: resumeFromIssueNoLinkError hint references job attach --branch
 * TC-022: resolver does not call getIssue in the CLI orchestrator path
 * TC-023: guide escalation topic includes --from-issue and job attach --branch guidance
 * TC-027: runResumeCore receives slug from runAttachVerification even when resolver slug diverges
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/command/detach.js", () => ({
  DETACH_MARKER_ENV: "SPECRUNNER_DETACHED",
  isDetachedChild: vi.fn().mockReturnValue(false),
  stripDetachFlag: vi.fn((args: string[]) => args.filter((a) => a !== "--detach")),
  detachSelf: vi.fn().mockResolvedValue(0),
}));

// T-20: Mock resume.js with only primitives.
// The real handleJobResume is in job-resume-handler.ts and imported by command-registry.ts.
// TC-012 (--from-issue + positional guard) is now tested through the real handler.
vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
    runResume: vi.fn().mockResolvedValue(undefined),
  };
});

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
    listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
    getIssue: vi.fn().mockRejectedValue(new Error("getIssue must not be called")),
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

vi.mock("../../core/issue-target/resume.js", () => ({
  resolveEscalationJobId: vi.fn().mockResolvedValue("test-job-id"),
  resolveResumeBranchFromIssue: vi.fn().mockResolvedValue({
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runResumeFromIssue } from "../resume-from-issue.js";
import { COMMANDS, JOB_RESUME_USAGE } from "../command-registry.js";
import { logError } from "../../logger/stdout.js";
import { detachSelf, isDetachedChild } from "../../core/command/detach.js";
import { runResumeCore } from "../resume.js";
import { loadStateByJobId } from "../../core/job-access/load-by-job-id.js";
import { runAttachVerification } from "../../core/attach/orchestrator.js";
import { resolveEscalationJobId, resolveResumeBranchFromIssue } from "../../core/issue-target/resume.js";
import { createGitHubClient } from "../../adapter/github/github-client.js";
import {
  ERROR_CODES,
  resumeFromIssueNoMarkerError,
  resumeFromIssueNoLinkError,
  resumeFromIssueUnconfirmedError,
  SpecRunnerError,
} from "../../errors.js";
import { findTopic } from "../../core/command/guide.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx() {
  return { repoRoot: "/fake/repo", invokerCwd: "/fake/repo" };
}

function getResumeHandler() {
  return COMMANDS["job"]!.children!["resume"]!.handler!;
}

function exitSpy() {
  return vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
}

// ---------------------------------------------------------------------------
// TC-020: RESUME_FROM_ISSUE_* error codes exist and factories return matching codes
// ---------------------------------------------------------------------------

describe("TC-020: RESUME_FROM_ISSUE_* error codes exist and factories return matching codes", () => {
  it("TC-020: RESUME_FROM_ISSUE_NO_MARKER exists in ERROR_CODES", () => {
    expect(ERROR_CODES.RESUME_FROM_ISSUE_NO_MARKER).toBeDefined();
  });

  it("TC-020: RESUME_FROM_ISSUE_NO_LINK exists in ERROR_CODES", () => {
    expect(ERROR_CODES.RESUME_FROM_ISSUE_NO_LINK).toBeDefined();
  });

  it("TC-020: RESUME_FROM_ISSUE_UNCONFIRMED exists in ERROR_CODES", () => {
    expect(ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED).toBeDefined();
  });

  it("TC-020: resumeFromIssueNoMarkerError factory returns correct code", () => {
    const err = resumeFromIssueNoMarkerError(5);
    expect(err.code).toBe(ERROR_CODES.RESUME_FROM_ISSUE_NO_MARKER);
  });

  it("TC-020: resumeFromIssueNoLinkError factory returns correct code", () => {
    const err = resumeFromIssueNoLinkError(5);
    expect(err.code).toBe(ERROR_CODES.RESUME_FROM_ISSUE_NO_LINK);
  });

  it("TC-020: resumeFromIssueUnconfirmedError factory returns correct code", () => {
    const err = resumeFromIssueUnconfirmedError("detail");
    expect(err.code).toBe(ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED);
  });

  it("TC-020: all three codes have ARG_ERROR (2) exit code", () => {
    expect(resumeFromIssueNoMarkerError(1).exitCode).toBe(2);
    expect(resumeFromIssueNoLinkError(1).exitCode).toBe(2);
    expect(resumeFromIssueUnconfirmedError("x").exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-021: resumeFromIssueNoLinkError hint references job attach --branch
// ---------------------------------------------------------------------------

describe("TC-021: resumeFromIssueNoLinkError hint references job attach --branch", () => {
  it("TC-021: hint includes 'job attach --branch'", () => {
    const err = resumeFromIssueNoLinkError(5);
    expect(err.hint).toContain("job attach --branch");
  });
});

// ---------------------------------------------------------------------------
// TC-001/TC-002: full chain - no local state → branch resolution → rebind → resume
// ---------------------------------------------------------------------------

describe("TC-001/TC-002: linked branch/PR head form resolves through the full chain", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(resolveEscalationJobId).mockResolvedValue("test-job-id");
    vi.mocked(resolveResumeBranchFromIssue).mockResolvedValue({
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
        request: { baseBranch: "main", slug: "test-slug" },
        repository: { owner: "test-owner", name: "test-repo" },
      },
    } as Awaited<ReturnType<typeof runAttachVerification>>);
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-001: resolveEscalationJobId is called with correct issueNumber", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveEscalationJobId)).toHaveBeenCalledWith(
      expect.objectContaining({ issueNumber: 42 }),
    );
  });

  it("TC-001: resolveResumeBranchFromIssue is called with resolved jobId", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveResumeBranchFromIssue)).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "test-job-id", issueNumber: 42 }),
    );
  });

  it("TC-001: runAttachVerification is called with resolved branch", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runAttachVerification)).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "feat/test-branch" }),
    );
  });

  it("TC-001: runResumeCore is called with resolved slug", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runResumeCore)).toHaveBeenCalledWith(
      "test-slug",
      expect.any(Object),
    );
  });

  it("TC-001: returns 0 on happy path", async () => {
    const code = await runResumeFromIssue(42, {}, makeCtx());
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: existing local state short-circuits to resume (no rebind)
// ---------------------------------------------------------------------------

describe("TC-010: existing local state short-circuits to resume", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockResolvedValue({
      jobId: "test-job-id",
      request: { slug: "local-slug", baseBranch: "main", path: "" },
      branch: "feat/local",
      status: "awaiting-resume",
    } as unknown as Awaited<ReturnType<typeof loadStateByJobId>>);
    vi.mocked(resolveResumeBranchFromIssue).mockClear();
    vi.mocked(runAttachVerification).mockClear();
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-010: resolveResumeBranchFromIssue is NOT called when local state found", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(resolveResumeBranchFromIssue)).not.toHaveBeenCalled();
  });

  it("TC-010: runAttachVerification is NOT called when local state found", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled();
  });

  it("TC-010: runResumeCore is still called with slug derived from local state", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runResumeCore)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-011: rebind verification failure propagates unchanged
// ---------------------------------------------------------------------------

describe("TC-011: rebind verification failure propagates unchanged", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    const attachErr = Object.assign(
      new SpecRunnerError("ATTACH_FETCH_FAILED", "hint", "fetch failed"),
      {},
    );
    vi.mocked(runAttachVerification).mockRejectedValue(attachErr);
    vi.mocked(runResumeCore).mockClear();
  });

  it("TC-011: runResumeCore is NOT called when verification fails", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled();
  });

  it("TC-011: non-zero exit code when verification fails", async () => {
    const code = await runResumeFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-013: --from-issue combines with --detach
// ---------------------------------------------------------------------------

describe("TC-013: --from-issue combines with --detach", () => {
  beforeEach(() => {
    vi.mocked(isDetachedChild).mockReturnValue(false);
    vi.mocked(detachSelf).mockClear();
    vi.mocked(detachSelf).mockResolvedValue(0);
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(runResumeCore).mockClear();
    vi.mocked(runAttachVerification).mockClear();
  });

  it("TC-013: detachSelf is called when --detach is set and not a child", async () => {
    await runResumeFromIssue(42, { detach: true }, makeCtx());
    expect(vi.mocked(detachSelf)).toHaveBeenCalledOnce();
  });

  it("TC-013: runAttachVerification and runResumeCore are NOT called when parent detaches", async () => {
    await runResumeFromIssue(42, { detach: true }, makeCtx());
    expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled();
    expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-022: resolver does not call getIssue in the CLI orchestrator path
// ---------------------------------------------------------------------------

describe("TC-022: getIssue is never called during the CLI orchestrator path", () => {
  it("TC-022: getIssue spy is never called on happy path", async () => {
    const getIssueSpy = vi.fn();
    vi.mocked(createGitHubClient).mockReturnValueOnce({
      listIssueComments: vi.fn().mockResolvedValue([]),
      listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
      getIssue: getIssueSpy,
    } as unknown as ReturnType<typeof createGitHubClient>);

    await runResumeFromIssue(42, {}, makeCtx());
    expect(getIssueSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-012: positional slug and --from-issue together is a usage error
// ---------------------------------------------------------------------------

describe("TC-012: positional slug and --from-issue together is a usage error", () => {
  it("TC-012: exits with ARG_ERROR (2) when positional + --from-issue given", async () => {
    const handler = getResumeHandler();
    const spy = exitSpy();
    try {
      await expect(
        handler(
          { flags: { "from-issue": 5 }, positional: "my-slug", positionals: ["my-slug"] },
          makeCtx(),
        ),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      spy.mockRestore();
    }
  });

  it("TC-012: error message includes 'mutually exclusive'", async () => {
    const handler = getResumeHandler();
    const spy = exitSpy();
    vi.mocked(logError).mockClear();
    try {
      await handler(
        { flags: { "from-issue": 5 }, positional: "my-slug", positionals: ["my-slug"] },
        makeCtx(),
      ).catch(() => {});
    } finally {
      spy.mockRestore();
    }
    const calls = vi.mocked(logError).mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes("mutually exclusive"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-014: usage text documents --from-issue
// ---------------------------------------------------------------------------

describe("TC-014: usage text documents --from-issue", () => {
  it("TC-014: JOB_RESUME_USAGE contains --from-issue", () => {
    expect(JOB_RESUME_USAGE).toContain("--from-issue");
  });

  it("TC-014: JOB_RESUME_USAGE documents job attach --branch guidance for missing links", () => {
    expect(JOB_RESUME_USAGE).toContain("job attach --branch");
  });

  it("TC-014: JOB_RESUME_USAGE documents positional exclusivity", () => {
    expect(JOB_RESUME_USAGE).toContain("Mutually exclusive");
  });
});

// ---------------------------------------------------------------------------
// TC-027: runResumeCore receives slug from runAttachVerification (not resolver)
// ---------------------------------------------------------------------------

describe("TC-027: runResumeCore uses verified slug even when resolver slug diverges", () => {
  beforeEach(() => {
    vi.mocked(loadStateByJobId).mockRejectedValue(
      Object.assign(new Error("JOB_NOT_FOUND"), { code: "JOB_NOT_FOUND" }),
    );
    vi.mocked(resolveResumeBranchFromIssue).mockResolvedValue({
      branch: "feat/test-branch",
      slug: "stale-slug",
      checkpointOid: "abc123oid",
    });
    vi.mocked(runAttachVerification).mockResolvedValue({
      slug: "verified-slug",
      jobId: "test-job-id",
      branch: "feat/test-branch",
      checkpointOid: "abc123oid",
      state: {
        request: { baseBranch: "main", slug: "verified-slug" },
        repository: { owner: "test-owner", name: "test-repo" },
      },
    } as Awaited<ReturnType<typeof runAttachVerification>>);
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-027: runResumeCore is called with verified-slug, not stale-slug", async () => {
    await runResumeFromIssue(42, {}, makeCtx());
    expect(vi.mocked(runResumeCore)).toHaveBeenCalledWith(
      "verified-slug",
      expect.any(Object),
    );
  });

  it("wontfix / wontfixReason pass through to runResumeCore", async () => {
    await runResumeFromIssue(42, { wontfix: "1,3", wontfixReason: "operator ruling" }, makeCtx());
    expect(vi.mocked(runResumeCore)).toHaveBeenCalledWith(
      "verified-slug",
      expect.objectContaining({ wontfix: "1,3", wontfixReason: "operator ruling" }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-023: guide escalation topic includes --from-issue and job attach --branch
// ---------------------------------------------------------------------------

describe("TC-023: guide escalation topic includes --from-issue and job attach --branch guidance", () => {
  it("TC-023: escalation topic body contains 'resume --from-issue'", () => {
    const topic = findTopic("escalation");
    expect(topic).toBeDefined();
    expect(topic!.body).toContain("resume --from-issue");
  });

  it("TC-023: escalation topic body contains 'job attach --branch'", () => {
    const topic = findTopic("escalation");
    expect(topic).toBeDefined();
    expect(topic!.body).toContain("job attach --branch");
  });
});

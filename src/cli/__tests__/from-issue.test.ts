/**
 * Tests for job start --from-issue
 *
 * TC-002: fidelity gate が inboxOrigin により comparator を skip する
 * TC-003: 現在 branch が base-branch と不一致なら副作用ゼロで停止する
 * TC-004: detached HEAD は不一致として扱う
 * TC-005: --from-issue と positional の併用は usage エラー
 * TC-006: --from-issue と --issue の併用は usage エラー
 * TC-007: --from-issue と --detach は併用できる
 * TC-008: fetch 失敗時に draft も job state も生成されない
 * TC-009: parse 失敗時に draft も job state も生成されない
 * TC-010: 占有 slug は SlugOccupiedError 経路で拒否される
 * TC-011: inbox と --from-issue が同一の core 関数を経由する
 * TC-012: --from-issue も positional も指定なしで usage エラー
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
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/command/detach.js", () => ({
  DETACH_MARKER_ENV: "SPECRUNNER_DETACHED",
  isDetachedChild: vi.fn().mockReturnValue(false),
  stripDetachFlag: vi.fn((args: string[]) => args.filter((a) => a !== "--detach")),
  detachSelf: vi.fn().mockResolvedValue(0),
}));

vi.mock("../run.js", () => ({
  runRun: vi.fn().mockResolvedValue(undefined),
  runRunCore: vi.fn().mockResolvedValue(0),
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
    getIssue: vi.fn().mockResolvedValue({
      number: 42,
      title: "Test Issue",
      body: [
        "# Test Request",
        "",
        "## Meta",
        "",
        "- **type**: bug-fix",
        "- **slug**: test-slug",
        "- **base-branch**: main",
        "- **adr**: false",
        "",
        "## Background",
        "",
        "Test.",
      ].join("\n"),
    }),
  }),
}));

vi.mock("../../git/branch.js", () => ({
  getCurrentBranch: vi.fn().mockResolvedValue("main"),
}));

vi.mock("../../core/job/start-from-issue.js", () => ({
  materializeDraftAndStart: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../core/inbox/draft-writer.js", () => ({
  writeDraft: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { COMMANDS } from "../command-registry.js";
import { runFromIssue } from "../from-issue.js";
import { getCurrentBranch } from "../../git/branch.js";
import { materializeDraftAndStart } from "../../core/job/start-from-issue.js";
import { logError } from "../../logger/stdout.js";
import { createGitHubClient } from "../../adapter/github/github-client.js";
import { detachSelf } from "../../core/command/detach.js";
import { slugOccupiedError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJobStartHandler() {
  return COMMANDS["job"]!.children!["start"]!.handler!;
}

function makeCtx() {
  return { repoRoot: "/fake/repo", invokerCwd: "/fake/repo" };
}

function exitSpy() {
  return vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
}

// ---------------------------------------------------------------------------
// TC-005: --from-issue と positional の併用は usage エラー
// ---------------------------------------------------------------------------

describe("TC-005: --from-issue と positional の併用は usage エラー", () => {
  it("TC-005: exits with ARG_ERROR (2) when --from-issue and positional are both given", async () => {
    const handler = getJobStartHandler();
    const spy = exitSpy();
    try {
      await expect(
        handler(
          { flags: { "from-issue": 5 }, positional: "some-slug", positionals: ["some-slug"] },
          makeCtx(),
        ),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      spy.mockRestore();
    }
  });

  it("TC-005: --from-issue + positional logs a usage error", async () => {
    const handler = getJobStartHandler();
    const spy = exitSpy();
    vi.mocked(logError).mockClear();
    try {
      await handler(
        { flags: { "from-issue": 5 }, positional: "some-slug", positionals: ["some-slug"] },
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
// TC-006: --from-issue と --issue の併用は usage エラー
// ---------------------------------------------------------------------------

describe("TC-006: --from-issue と --issue の併用は usage エラー", () => {
  it("TC-006: exits with ARG_ERROR (2) when both --from-issue and --issue are given", async () => {
    const handler = getJobStartHandler();
    const spy = exitSpy();
    try {
      await expect(
        handler(
          { flags: { "from-issue": 5, issue: 6 }, positional: undefined, positionals: [] },
          makeCtx(),
        ),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      spy.mockRestore();
    }
  });

  it("TC-006: --from-issue + --issue logs a usage error mentioning both flags", async () => {
    const handler = getJobStartHandler();
    const spy = exitSpy();
    vi.mocked(logError).mockClear();
    try {
      await handler(
        { flags: { "from-issue": 5, issue: 6 }, positional: undefined, positionals: [] },
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
// TC-012: --from-issue も positional も指定なしで usage エラー
// ---------------------------------------------------------------------------

describe("TC-012: --from-issue も positional も指定なしで usage エラー", () => {
  it("TC-012: exits with ARG_ERROR (2) when neither --from-issue nor positional is given", async () => {
    const handler = getJobStartHandler();
    const spy = exitSpy();
    try {
      await expect(
        handler(
          { flags: {}, positional: undefined, positionals: [] },
          makeCtx(),
        ),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-003: 現在 branch が base-branch と不一致なら副作用ゼロで停止する
// ---------------------------------------------------------------------------

describe("TC-003: base-branch guard — 不一致で副作用ゼロ停止", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("develop");
    vi.mocked(materializeDraftAndStart).mockClear();
  });

  it("TC-003: returns non-zero exit when branch mismatches", async () => {
    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });

  it("TC-003: does not call materializeDraftAndStart on branch mismatch", async () => {
    await runFromIssue(42, {}, makeCtx());
    expect(vi.mocked(materializeDraftAndStart)).not.toHaveBeenCalled();
  });

  it("TC-003: error message contains current branch and base-branch", async () => {
    vi.mocked(logError).mockClear();
    await runFromIssue(42, {}, makeCtx());
    const calls = vi.mocked(logError).mock.calls.map((c) => String(c[0]));
    const msg = calls.join("\n");
    expect(msg).toContain("develop");
    expect(msg).toContain("main");
  });
});

// ---------------------------------------------------------------------------
// TC-004: detached HEAD は不一致として扱う
// ---------------------------------------------------------------------------

describe("TC-004: detached HEAD は不一致として扱う", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue(null);
    vi.mocked(materializeDraftAndStart).mockClear();
  });

  it("TC-004: returns non-zero exit when in detached HEAD", async () => {
    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });

  it("TC-004: does not call materializeDraftAndStart when in detached HEAD", async () => {
    await runFromIssue(42, {}, makeCtx());
    expect(vi.mocked(materializeDraftAndStart)).not.toHaveBeenCalled();
  });

  it("TC-004: error message mentions detached HEAD", async () => {
    vi.mocked(logError).mockClear();
    await runFromIssue(42, {}, makeCtx());
    const calls = vi.mocked(logError).mock.calls.map((c) => String(c[0]));
    const msg = calls.join("\n");
    expect(msg).toMatch(/detached/i);
  });
});

// ---------------------------------------------------------------------------
// TC-008: fetch 失敗時に draft も job state も生成されない
// ---------------------------------------------------------------------------

describe("TC-008: fetch 失敗時に副作用ゼロ停止", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("main");
    const client = vi.mocked(createGitHubClient).mock.results[0]?.value;
    if (client) {
      vi.mocked(client.getIssue).mockRejectedValueOnce(new Error("404 Not Found"));
    }
    vi.mocked(materializeDraftAndStart).mockClear();
  });

  it("TC-008: returns non-zero exit when getIssue throws", async () => {
    // Override the mock for this test
    vi.mocked(createGitHubClient).mockReturnValueOnce({
      getIssue: vi.fn().mockRejectedValue(new Error("404 Not Found")),
    } as unknown as ReturnType<typeof createGitHubClient>);

    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });

  it("TC-008: does not call materializeDraftAndStart when getIssue throws", async () => {
    vi.mocked(createGitHubClient).mockReturnValueOnce({
      getIssue: vi.fn().mockRejectedValue(new Error("404 Not Found")),
    } as unknown as ReturnType<typeof createGitHubClient>);

    await runFromIssue(42, {}, makeCtx());
    expect(vi.mocked(materializeDraftAndStart)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009: parse 失敗時に draft も job state も生成されない
// ---------------------------------------------------------------------------

describe("TC-009: parse 失敗時に副作用ゼロ停止", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("main");
    vi.mocked(materializeDraftAndStart).mockClear();
  });

  it("TC-009: returns non-zero exit when issue body is not valid request.md", async () => {
    vi.mocked(createGitHubClient).mockReturnValueOnce({
      getIssue: vi.fn().mockResolvedValue({
        number: 42,
        title: "Bad Issue",
        body: "This is not a valid request.md — no Meta section",
      }),
    } as unknown as ReturnType<typeof createGitHubClient>);

    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });

  it("TC-009: does not call materializeDraftAndStart when parse fails", async () => {
    vi.mocked(createGitHubClient).mockReturnValueOnce({
      getIssue: vi.fn().mockResolvedValue({
        number: 42,
        title: "Bad Issue",
        body: "no meta section",
      }),
    } as unknown as ReturnType<typeof createGitHubClient>);

    await runFromIssue(42, {}, makeCtx());
    expect(vi.mocked(materializeDraftAndStart)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-011: inbox と --from-issue が同一の core 関数を経由する
// ---------------------------------------------------------------------------

describe("TC-011: --from-issue が materializeDraftAndStart を経由する", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("main");
    vi.mocked(materializeDraftAndStart).mockClear();
    vi.mocked(materializeDraftAndStart).mockResolvedValue(0);
  });

  it("TC-011: runFromIssue calls materializeDraftAndStart on happy path", async () => {
    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).toBe(0);
    expect(vi.mocked(materializeDraftAndStart)).toHaveBeenCalledOnce();
  });

  it("TC-011: materializeDraftAndStart is called with correct slug and issueNumber", async () => {
    await runFromIssue(42, {}, makeCtx());
    const call = vi.mocked(materializeDraftAndStart).mock.calls[0]!;
    expect(call[0].issueNumber).toBe(42);
    expect(call[0].slug).toBe("test-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-002: fidelity gate inboxOrigin skip (unit-level pin via materializeDraftAndStart)
// ---------------------------------------------------------------------------

describe("TC-002: fidelity gate が inboxOrigin により comparator を skip する", () => {
  it("TC-002: evaluateIssueFidelityGate returns proceed with skip when inboxOrigin=true", async () => {
    const { evaluateIssueFidelityGate } = await import("../../core/gate/issue-fidelity-gate.js");
    const { STEP_NAMES } = await import("../../core/step/step-names.js");

    const logMessages: string[] = [];
    const result = await evaluateIssueFidelityGate({
      startStep: STEP_NAMES.REQUEST_REVIEW,
      issueNumber: 42,
      inboxOrigin: true,
      owner: "owner",
      repo: "repo",
      getIssue: vi.fn(),
      readRequestMd: vi.fn(),
      comparator: undefined,
      log: (msg) => logMessages.push(msg),
    });

    expect(result.kind).toBe("proceed");
    expect(result.kind === "proceed" && result.skipped).toBeDefined();
    // comparator must not have been called (it's undefined, and no error means it was skipped)
    expect(logMessages.some((m) => m.includes("skip"))).toBe(true);
  });

  it("TC-002: evaluateIssueFidelityGate does not call comparator when inboxOrigin=true", async () => {
    const { evaluateIssueFidelityGate } = await import("../../core/gate/issue-fidelity-gate.js");
    const { STEP_NAMES } = await import("../../core/step/step-names.js");

    const comparatorSpy = { compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] }) };
    const result = await evaluateIssueFidelityGate({
      startStep: STEP_NAMES.REQUEST_REVIEW,
      issueNumber: 42,
      inboxOrigin: true,
      owner: "owner",
      repo: "repo",
      getIssue: vi.fn(),
      readRequestMd: vi.fn(),
      comparator: comparatorSpy,
      log: vi.fn(),
    });

    expect(result.kind).toBe("proceed");
    expect(comparatorSpy.compare).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-007: --from-issue と --detach は併用できる
// ---------------------------------------------------------------------------

describe("TC-007: --from-issue と --detach は併用できる", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("main");
    vi.mocked(materializeDraftAndStart).mockClear();
    vi.mocked(detachSelf).mockClear();
    vi.mocked(detachSelf).mockResolvedValue(0);
  });

  it("TC-007: calls detachSelf (not materializeDraftAndStart) when detach=true and not a child", async () => {
    const code = await runFromIssue(42, { detach: true }, makeCtx());
    expect(code).toBe(0);
    expect(vi.mocked(detachSelf)).toHaveBeenCalledOnce();
    expect(vi.mocked(materializeDraftAndStart)).not.toHaveBeenCalled();
  });

  it("TC-007: parent succeeds after fetch/parse/guard succeed before detach", async () => {
    // guard passes (main == main), fetch succeeds, detachSelf is called
    const code = await runFromIssue(42, { detach: true }, makeCtx());
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: 占有 slug は SlugOccupiedError 経路で拒否される
// ---------------------------------------------------------------------------

describe("TC-010: 占有 slug は SlugOccupiedError 経路で拒否される", () => {
  beforeEach(() => {
    vi.mocked(getCurrentBranch).mockResolvedValue("main");
  });

  it("TC-010: returns non-zero exit when materializeDraftAndStart throws SlugOccupiedError", async () => {
    const err = slugOccupiedError("test-slug", { jobId: "job-1", status: "running" });
    vi.mocked(materializeDraftAndStart).mockRejectedValueOnce(err);
    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).not.toBe(0);
  });

  it("TC-010: SlugOccupiedError exit code is ARG_ERROR (2)", async () => {
    const err = slugOccupiedError("test-slug", { jobId: "job-1", status: "running" });
    vi.mocked(materializeDraftAndStart).mockRejectedValueOnce(err);
    const code = await runFromIssue(42, {}, makeCtx());
    expect(code).toBe(2); // EXIT_CODE.ARG_ERROR
  });
});

// TC-013/TC-014: getCurrentBranch の実装テストは src/git/__tests__/branch.test.ts が担保する。


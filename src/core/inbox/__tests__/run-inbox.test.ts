/**
 * Unit tests for inbox start re-check linkage (T-01 / T-02).
 *
 * Verifies that runInboxOrchestrator re-checks issue linkage immediately before
 * each start execution, skipping starts that became linked after the plan was built.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InboxEffects } from "../run-inbox.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted — vi.mock calls are hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logResult: vi.fn(),
}));

// Import after mocks are set up
import { runInboxOrchestrator } from "../run-inbox.js";
import { stderrWrite } from "../../../logger/stdout.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A valid request.md body that the planner can parse into a start action.
 * The slug must be unique per test to avoid slug-collision filtering.
 */
function makeIssueBody(slug: string): string {
  return [
    `# Test request: ${slug}`,
    "",
    "## Meta",
    "",
    `- **type**: bug-fix`,
    `- **slug**: ${slug}`,
    `- **base-branch**: main`,
    `- **adr**: false`,
    "",
    "## Background",
    "",
    "Test background.",
  ].join("\n");
}

/** Minimal mock GitHub client that returns approved issues for the given numbers. */
function makeGithubClient(issues: Array<{ number: number; slug: string }>) {
  return {
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue(
      issues.map(({ number, slug }) => ({
        number,
        title: `Issue ${number}`,
        body: makeIssueBody(slug),
      })),
    ),
    listIssueComments: vi.fn().mockResolvedValue([]),
    createIssueComment: vi.fn().mockResolvedValue(undefined),
  };
}

/** Build a complete InboxEffects stub with overrides for specific methods. */
function makeEffects(overrides: Partial<InboxEffects> = {}): Partial<InboxEffects> {
  return {
    startJob: vi.fn().mockResolvedValue(undefined),
    resumeJob: vi.fn().mockResolvedValue(undefined),
    postRejectComment: vi.fn().mockResolvedValue(undefined),
    removeApprovalLabel: vi.fn().mockResolvedValue(undefined),
    isStale: vi.fn().mockReturnValue(false),
    persistState: vi.fn().mockResolvedValue(undefined),
    notifyEscalation: vi.fn().mockResolvedValue(undefined),
    isIssueLinked: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runInboxOrchestrator — start re-check linkage", () => {
  beforeEach(() => {
    vi.mocked(stderrWrite).mockClear();
  });

  it("skips start when isIssueLinked returns true", async () => {
    const issues = [{ number: 615, slug: "fix-615" }];
    const effects = makeEffects({
      isIssueLinked: vi.fn().mockResolvedValue(true),
    });
    const startJob = effects.startJob as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeGithubClient(issues) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.started).toHaveLength(0);
    expect(startJob).not.toHaveBeenCalled();
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("issue#615") && m.includes("already linked"))).toBe(true);
  });

  it("proceeds with start when isIssueLinked returns false", async () => {
    const issues = [{ number: 616, slug: "fix-616" }];
    const effects = makeEffects({
      isIssueLinked: vi.fn().mockResolvedValue(false),
    });
    const startJob = effects.startJob as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeGithubClient(issues) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.started).toHaveLength(1);
    expect(summary.started[0]!.issueNumber).toBe(616);
    expect(startJob).toHaveBeenCalledOnce();
  });

  it("skips second start that became linked after first completed", async () => {
    const issues = [
      { number: 616, slug: "fix-616-b" },
      { number: 615, slug: "fix-615-b" },
    ];
    // isIssueLinked returns false for 616 (first) and true for 615 (second)
    const isIssueLinked = vi.fn().mockImplementation(async (n: number) => n === 615);
    const effects = makeEffects({ isIssueLinked });
    const startJob = effects.startJob as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeGithubClient(issues) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.started).toHaveLength(1);
    expect(summary.started[0]!.issueNumber).toBe(616);
    expect(startJob).toHaveBeenCalledOnce();
    expect(summary.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-L1 / TC-L2 / TC-L3: reject label removal
// ---------------------------------------------------------------------------

describe("runInboxOrchestrator — reject label removal", () => {
  beforeEach(() => {
    vi.mocked(stderrWrite).mockClear();
  });

  /** GitHub client that returns one invalid-body issue (triggers a reject). */
  function makeRejectClient(issueNumber: number) {
    return {
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([
        { number: issueNumber, title: `Issue ${issueNumber}`, body: "not a valid request.md body" },
      ]),
      listIssueComments: vi.fn().mockResolvedValue([]),
    };
  }

  it("TC-L1: removeApprovalLabel is called after successful reject", async () => {
    const effects = makeEffects();
    const removeApprovalLabel = effects.removeApprovalLabel as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeRejectClient(700) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(removeApprovalLabel).toHaveBeenCalledOnce();
    expect(removeApprovalLabel).toHaveBeenCalledWith(700);
    expect(summary.rejected).toHaveLength(1);
    expect(summary.rejected[0]!.issueNumber).toBe(700);
    expect(summary.errors).toHaveLength(0);
  });

  it("TC-L2: removeApprovalLabel failure is non-fatal", async () => {
    const effects = makeEffects({
      removeApprovalLabel: vi.fn().mockRejectedValue(new Error("network error")),
    });

    const summary = await runInboxOrchestrator({
      githubClient: makeRejectClient(701) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.rejected).toHaveLength(1);
    expect(summary.errors).toHaveLength(0);
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("warn") && m.includes("approval label"))).toBe(true);
  });

  it("TC-L3: removeApprovalLabel not called when postRejectComment fails", async () => {
    const effects = makeEffects({
      postRejectComment: vi.fn().mockRejectedValue(new Error("comment failed")),
      removeApprovalLabel: vi.fn().mockResolvedValue(undefined),
    });
    const removeApprovalLabel = effects.removeApprovalLabel as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeRejectClient(702) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(removeApprovalLabel).not.toHaveBeenCalled();
    expect(summary.errors).toHaveLength(1);
  });

  it("TC-011: listIssueComments is called for unlinked approved issues in collection phase", async () => {
    const client = makeRejectClient(710);
    const effects = makeEffects();

    await runInboxOrchestrator({
      githubClient: client as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(client.listIssueComments).toHaveBeenCalledWith("test", "repo", 710);
  });

  it("TC-012: listIssueComments failure for unlinked approved issue is non-fatal and logs warn", async () => {
    const client = makeRejectClient(711);
    (client.listIssueComments as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network failure"),
    );
    const effects = makeEffects();

    const summary = await runInboxOrchestrator({
      githubClient: client as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.errors).toHaveLength(0);
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("warn") && m.includes("711"))).toBe(true);
    expect(summary.rejected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-006 / TC-007: default isIssueLinked implementation (no override)
// ---------------------------------------------------------------------------

describe("runInboxOrchestrator — default isIssueLinked via JobStateStore", () => {
  beforeEach(() => {
    vi.mocked(stderrWrite).mockClear();
    vi.mocked(JobStateStore.list).mockReset().mockResolvedValue([]);
  });

  it("TC-006: skips start when default isIssueLinked finds a linked job in JobStateStore", async () => {
    const issues = [{ number: 617, slug: "fix-617" }];
    // Planning phase: no existing jobs → planner produces a start action for issue #617
    vi.mocked(JobStateStore.list).mockResolvedValueOnce([]);
    // isIssueLinked check: returns a job already linked to issue #617 → skip
    vi.mocked(JobStateStore.list).mockResolvedValueOnce([
      { issueNumber: 617, status: "running" } as unknown as JobState,
    ]);

    const effects: Partial<InboxEffects> = {
      startJob: vi.fn().mockResolvedValue(undefined),
      resumeJob: vi.fn().mockResolvedValue(undefined),
      postRejectComment: vi.fn().mockResolvedValue(undefined),
      isStale: vi.fn().mockReturnValue(false),
      persistState: vi.fn().mockResolvedValue(undefined),
      notifyEscalation: vi.fn().mockResolvedValue(undefined),
      // isIssueLinked intentionally omitted — exercises the default implementation
    };
    const startJob = effects.startJob as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeGithubClient(issues) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.started).toHaveLength(0);
    expect(startJob).not.toHaveBeenCalled();
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => m.includes("issue#617") && m.includes("already linked"))).toBe(true);
  });

  it("TC-007: proceeds with start when default isIssueLinked finds no linked job in JobStateStore", async () => {
    const issues = [{ number: 618, slug: "fix-618" }];
    // Both planning and isIssueLinked calls return [] (set by beforeEach default)

    const effects: Partial<InboxEffects> = {
      startJob: vi.fn().mockResolvedValue(undefined),
      resumeJob: vi.fn().mockResolvedValue(undefined),
      postRejectComment: vi.fn().mockResolvedValue(undefined),
      isStale: vi.fn().mockReturnValue(false),
      persistState: vi.fn().mockResolvedValue(undefined),
      notifyEscalation: vi.fn().mockResolvedValue(undefined),
      // isIssueLinked intentionally omitted — exercises the default implementation
    };
    const startJob = effects.startJob as ReturnType<typeof vi.fn>;

    const summary = await runInboxOrchestrator({
      githubClient: makeGithubClient(issues) as never,
      owner: "test",
      repo: "repo",
      repoRoot: "/repo",
      approveLabel: "specrunner:approve",
      maxStartsPerRun: 5,
      dryRun: false,
      effects,
    });

    expect(summary.started).toHaveLength(1);
    expect(summary.started[0]!.issueNumber).toBe(618);
    expect(startJob).toHaveBeenCalledOnce();
  });
});

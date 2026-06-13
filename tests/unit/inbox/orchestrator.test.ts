/**
 * T-05 / T-08 orchestrator tests.
 *
 * Uses:
 * - GitHubClient mock (searchOpenIssuesByLabel, listIssueComments, createIssueComment)
 * - Injected job states via JobStateStore mock
 * - Injected effects (startJob, resumeJob, postRejectComment)
 *
 * Covers:
 * - Start effect called for approved issue, not called on second run (idempotency)
 * - Reject comment posted for invalid issue, start not called
 * - Resume effect called with resumePrompt for awaiting-resume job
 * - Escalation-marker gating, permission gating, bot comment exclusion
 * - maxStartsPerRun limit
 * - Jobs without issue link are not touched
 * - Dry-run: effects not called
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubClient } from "../../../src/core/port/github-client.js";
import { runInboxOrchestrator } from "../../../src/core/inbox/run-inbox.js";
import { buildMarker } from "../../../src/core/notify/issue-notifier.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

import { JobStateStore } from "../../../src/store/job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REQUEST_MD = `# Fix login bug

## Meta

- **type**: bug-fix
- **slug**: fix-login-bug
- **base-branch**: main
- **adr**: false
`;

const INVALID_REQUEST_MD = "This is not a valid request.md";

const JOB_ID = "bbbbcccc-0000-0000-0000-000000000001";
const ESCALATION_MARKER = buildMarker("escalation", JOB_ID);
const CUTOFF_TS = "2024-01-05T12:00:00Z";
const AFTER_CUTOFF_TS = "2024-01-05T13:00:00Z";

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: JOB_ID,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    request: {
      path: "/specrunner/changes/fix-login-bug/request.md",
      title: "Fix login bug",
      type: "bug-fix",
      slug: "fix-login-bug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "fix/fix-login-bug",
    history: [],
    error: null,
    ...overrides,
  } as JobState;
}

function makeGitHubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://..." }),
    verifyBranch: vi.fn(),
    getRawFile: vi.fn(),
    verifyPath: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn(),
    createPullRequest: vi.fn(),
    getPullRequest: vi.fn(),
    getCheckStatus: vi.fn(),
    mergePullRequest: vi.fn(),
    listPullRequestFiles: vi.fn(),
    ...overrides,
  } as GitHubClient;
}

function makeEffects(overrides: { isStale?: (state: unknown) => boolean } = {}) {
  return {
    startJob: vi.fn().mockResolvedValue(undefined),
    resumeJob: vi.fn().mockResolvedValue(undefined),
    postRejectComment: vi.fn().mockResolvedValue(undefined),
    isStale: vi.fn().mockImplementation(overrides.isStale ?? (() => false)),
    persistState: vi.fn().mockResolvedValue(undefined),
    notifyEscalation: vi.fn().mockResolvedValue(undefined),
  };
}

function makeOpts(
  githubClient: GitHubClient,
  effects: ReturnType<typeof makeEffects>,
  partial: Partial<Parameters<typeof runInboxOrchestrator>[0]> = {},
) {
  return {
    githubClient,
    owner: "testowner",
    repo: "testrepo",
    repoRoot: "/repo",
    approveLabel: "specrunner-approved",
    maxStartsPerRun: 3,
    effects,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runInboxOrchestrator — start", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([]);
  });

  it("calls startJob for approved, unlinked issue", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.startJob).toHaveBeenCalledOnce();
    expect(effects.startJob).toHaveBeenCalledWith("fix-login-bug", expect.any(String), 1);
  });

  it("does NOT call startJob on 2nd run when issue is already linked (idempotency)", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
    });
    const effects = makeEffects();

    // First run: issue linked to a job
    vi.mocked(JobStateStore.list).mockResolvedValue([
      makeJobState({ issueNumber: 1, status: "running" }),
    ]);

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.startJob).not.toHaveBeenCalled();
  });

  it("calls postRejectComment for invalid issue, does not call startJob", async () => {
    const issues = [{ number: 2, title: "Bad issue", body: INVALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.startJob).not.toHaveBeenCalled();
    expect(effects.postRejectComment).toHaveBeenCalledOnce();
    expect(effects.postRejectComment).toHaveBeenCalledWith(2, expect.stringContaining("specrunner:notification"));
  });

  it("respects maxStartsPerRun limit", async () => {
    const issues = [
      { number: 1, title: "Issue 1", body: VALID_REQUEST_MD },
      { number: 2, title: "Issue 2", body: VALID_REQUEST_MD.replace("fix-login-bug", "fix-signup-bug") },
      { number: 3, title: "Issue 3", body: VALID_REQUEST_MD.replace("fix-login-bug", "fix-logout-bug") },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects, { maxStartsPerRun: 1 }));
    expect(effects.startJob).toHaveBeenCalledTimes(1);
  });
});

describe("runInboxOrchestrator — resume", () => {
  it("calls resumeJob with resumePrompt when awaiting-resume job has valid /resume comment", async () => {
    const awaitingJob = makeJobState({
      status: "awaiting-resume",
      issueNumber: 10,
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([awaitingJob]);

    const comments = [
      { id: 1, body: ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: CUTOFF_TS },
      { id: 2, body: "/resume fix the authentication", authorAssociation: "OWNER", createdAt: AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(effects.resumeJob).toHaveBeenCalledWith("fix-login-bug", "fix the authentication");
  });

  it("does NOT call resumeJob when /resume is before escalation marker", async () => {
    const awaitingJob = makeJobState({ status: "awaiting-resume", issueNumber: 10 });
    vi.mocked(JobStateStore.list).mockResolvedValue([awaitingJob]);

    const comments = [
      { id: 1, body: "/resume too early", authorAssociation: "OWNER", createdAt: "2024-01-04T00:00:00Z" },
      { id: 2, body: ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.resumeJob).not.toHaveBeenCalled();
  });

  it("does NOT call resumeJob for unauthorized author", async () => {
    const awaitingJob = makeJobState({ status: "awaiting-resume", issueNumber: 10 });
    vi.mocked(JobStateStore.list).mockResolvedValue([awaitingJob]);

    const comments = [
      { id: 1, body: ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: CUTOFF_TS },
      { id: 2, body: "/resume from contributor", authorAssociation: "CONTRIBUTOR", createdAt: AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.resumeJob).not.toHaveBeenCalled();
  });

  it("does NOT call resumeJob when bot marker comment contains /resume", async () => {
    const awaitingJob = makeJobState({ status: "awaiting-resume", issueNumber: 10 });
    vi.mocked(JobStateStore.list).mockResolvedValue([awaitingJob]);

    const botComment = `<!-- specrunner:notification kind="completed" jobId="xyz" version="1" -->\n/resume please resume`;
    const comments = [
      { id: 1, body: ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: CUTOFF_TS },
      { id: 2, body: botComment, authorAssociation: "OWNER", createdAt: AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.resumeJob).not.toHaveBeenCalled();
  });

  it("does NOT fetch comments for jobs without issueNumber", async () => {
    const noIssueJob = makeJobState({ status: "awaiting-resume", issueNumber: undefined });
    vi.mocked(JobStateStore.list).mockResolvedValue([noIssueJob]);

    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));
    expect(client.listIssueComments).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
  });
});

describe("runInboxOrchestrator — dry-run", () => {
  it("does not call any effects in dry-run mode", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const awaitingJob = makeJobState({ status: "awaiting-resume", issueNumber: 10 });
    vi.mocked(JobStateStore.list).mockResolvedValue([awaitingJob]);

    const comments = [
      { id: 1, body: ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: CUTOFF_TS },
      { id: 2, body: "/resume go", authorAssociation: "OWNER", createdAt: AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue(comments),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects, { dryRun: true }));

    expect(effects.startJob).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(effects.postRejectComment).not.toHaveBeenCalled();
    // But the summary should reflect what would happen
    expect(summary.started).toHaveLength(1);
    expect(summary.resumed).toHaveLength(1);
  });
});

describe("runInboxOrchestrator — unrelated jobs unaffected", () => {
  it("does not touch jobs without issue links", async () => {
    const noIssueJob = makeJobState({ issueNumber: undefined });
    const awaitingNoIssueJob = makeJobState({
      jobId: "ccccdddd-0000-0000-0000-000000000001",
      status: "awaiting-resume",
      issueNumber: undefined,
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([noIssueJob, awaitingNoIssueJob]);

    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects));
    expect(effects.startJob).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(client.listIssueComments).not.toHaveBeenCalled();
    expect(summary.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// stale-running recovery tests
// ---------------------------------------------------------------------------

function makeRunningJobState(overrides: Partial<JobState> = {}): JobState {
  return makeJobState({
    jobId: "ddddeeee-0000-0000-0000-000000000001",
    status: "running",
    step: "design",
    pid: 99999,
    request: {
      path: "/specrunner/changes/my-feature/request.md",
      title: "My feature",
      type: "new-feature",
      slug: "my-feature",
    },
    branch: "feat/my-feature",
    ...overrides,
  });
}

describe("runInboxOrchestrator — stale-running recovery", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([]);
  });

  it("calls persistState then resumeJob for stale-running job (isStale=true, low attempts)", async () => {
    const staleJob = makeRunningJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([staleJob]);

    const client = makeGitHubClient({ searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]) });
    const effects = makeEffects({ isStale: () => true });

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(effects.persistState).toHaveBeenCalledOnce();
    const persistedState = vi.mocked(effects.persistState).mock.calls[0]![1] as JobState;
    expect(persistedState.staleRecovery).toEqual({ attempts: 1, stepCount: 0 });

    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(effects.resumeJob).toHaveBeenCalledWith("my-feature", undefined);

    expect(summary.recovered).toHaveLength(1);
    expect(summary.recovered[0]!.slug).toBe("my-feature");
    expect(summary.errors).toHaveLength(0);
  });

  it("does NOT recover/escalate a running job when isStale=false", async () => {
    const runningJob = makeRunningJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([runningJob]);

    const client = makeGitHubClient({ searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]) });
    const effects = makeEffects({ isStale: () => false });

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(effects.persistState).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(effects.notifyEscalation).not.toHaveBeenCalled();
    expect(summary.recovered).toHaveLength(0);
    expect(summary.escalated).toHaveLength(0);
  });

  it("escalates when attempts >= MAX_STALE_RECOVERY_ATTEMPTS (no resumeJob, persistState + notifyEscalation)", async () => {
    const { MAX_STALE_RECOVERY_ATTEMPTS } = await import("../../../src/core/inbox/planner.js");
    const staleJob = makeRunningJobState({
      issueNumber: 42,
      staleRecovery: { attempts: MAX_STALE_RECOVERY_ATTEMPTS, stepCount: 0 },
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([staleJob]);

    const client = makeGitHubClient({ searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]) });
    const effects = makeEffects({ isStale: () => true });

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(effects.persistState).toHaveBeenCalledOnce();
    const persistedState = vi.mocked(effects.persistState).mock.calls[0]![1] as JobState;
    expect(persistedState.status).toBe("awaiting-resume");
    expect(persistedState.staleRecovery).toBeNull();

    expect(effects.notifyEscalation).toHaveBeenCalledOnce();
    const notifiedState = vi.mocked(effects.notifyEscalation).mock.calls[0]![0] as JobState;
    expect(notifiedState.status).toBe("awaiting-resume");

    expect(summary.escalated).toHaveLength(1);
    expect(summary.escalated[0]!.issueNumber).toBe(42);
    expect(summary.errors).toHaveLength(0);
  });

  it("dry-run: recover/escalate effects not called but summary reflects counts", async () => {
    const { MAX_STALE_RECOVERY_ATTEMPTS } = await import("../../../src/core/inbox/planner.js");
    const staleJob = makeRunningJobState({ staleRecovery: null });
    const staleEscJob = makeRunningJobState({
      jobId: "ddddeeee-0000-0000-0000-000000000002",
      request: { path: "/specrunner/changes/other-feat/request.md", title: "O", type: "bug-fix", slug: "other-feat" },
      staleRecovery: { attempts: MAX_STALE_RECOVERY_ATTEMPTS, stepCount: 0 },
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([staleJob, staleEscJob]);

    const client = makeGitHubClient({ searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]) });
    const effects = makeEffects({ isStale: () => true });

    const summary = await runInboxOrchestrator(makeOpts(client, effects, { dryRun: true }));

    expect(effects.persistState).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(effects.notifyEscalation).not.toHaveBeenCalled();
    expect(summary.recovered).toHaveLength(1);
    expect(summary.escalated).toHaveLength(1);
  });

  it("recover persistState failure adds to errors but does not stop other actions", async () => {
    const staleJob = makeRunningJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([staleJob]);

    const client = makeGitHubClient({ searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]) });
    const effects = makeEffects({ isStale: () => true });
    vi.mocked(effects.persistState).mockRejectedValue(new Error("disk full"));

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]!.action).toBe("recover:my-feature");
    expect(summary.recovered).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Decision ledger integration: /resume with N=M selections (T-09)
// ---------------------------------------------------------------------------

const DECISION_JOB_ID = "eeeeffffaaaa-0000-0000-0000-000000000001";
const DECISION_ESCALATION_MARKER = buildMarker("escalation", DECISION_JOB_ID);
const DECISION_CUTOFF_TS = "2026-01-01T12:00:00Z";
const DECISION_AFTER_CUTOFF_TS = "2026-01-01T13:00:00Z";

function makeDecisionJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: DECISION_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/specrunner/changes/my-feature/request.md",
      title: "My feature",
      type: "new-feature",
      slug: "my-feature",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "spec-review",
    status: "awaiting-resume",
    branch: "feat/my-feature",
    history: [],
    error: null,
    issueNumber: 30,
    resumePoint: {
      step: "spec-review",
      reason: "decision required",
      iterationsExhausted: 0,
    },
    steps: {
      "spec-review": [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:01.000Z",
          outcome: {
            verdict: "escalation",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "low",
                  resolution: "decision-needed",
                  file: "src/design.ts",
                  title: "Human decision required",
                  rationale: "Product owner must choose approach",
                  options: [
                    { label: "Option A: approach A", consequence: "Consequence A" },
                    { label: "Option B: approach B", consequence: "Consequence B" },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    ...overrides,
  } as JobState;
}

describe("runInboxOrchestrator — decision ledger (T-09)", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([]);
  });

  it("/resume 1=1 → persistState called with decision record, then resumeJob called", async () => {
    const job = makeDecisionJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([job]);

    const comments = [
      { id: 1, body: DECISION_ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume 1=1", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    // persistState called first with the decision record
    expect(effects.persistState).toHaveBeenCalledOnce();
    const [_jobId, persistedState] = vi.mocked(effects.persistState).mock.calls[0] as [string, JobState];
    expect(persistedState.decisions).toHaveLength(1);
    expect(persistedState.decisions![0]!.selectedOption.number).toBe(1);
    expect(persistedState.decisions![0]!.selectedOption.label).toBe("Option A: approach A");
    expect(persistedState.decisions![0]!.source).toBe("issue-comment");

    // resumeJob called after
    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(summary.resumed).toHaveLength(1);
  });

  it("/resume 1=2 → selects second option in decision record", async () => {
    const job = makeDecisionJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([job]);

    const comments = [
      { id: 1, body: DECISION_ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume 1=2", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    await runInboxOrchestrator(makeOpts(client, effects));

    const [_jobId, persistedState] = vi.mocked(effects.persistState).mock.calls[0] as [string, JobState];
    expect(persistedState.decisions![0]!.selectedOption.number).toBe(2);
    expect(persistedState.decisions![0]!.selectedOption.label).toBe("Option B: approach B");
  });

  it("/resume 1=9 (option out of range) → resumeJob NOT called, job stays awaiting-resume", async () => {
    const job = makeDecisionJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([job]);

    const comments = [
      { id: 1, body: DECISION_ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume 1=9", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(effects.persistState).not.toHaveBeenCalled();
    expect(effects.resumeJob).not.toHaveBeenCalled();
    expect(summary.resumed).toHaveLength(0);
  });

  it("/resume prose (no selections) → resumeJob called without decisions (prose-only)", async () => {
    const job = makeDecisionJobState();
    vi.mocked(JobStateStore.list).mockResolvedValue([job]);

    const comments = [
      { id: 1, body: DECISION_ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume please try approach A instead", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    // Prose-only resume → no decisions persisted, but resume proceeds
    expect(effects.persistState).not.toHaveBeenCalled();
    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(summary.resumed).toHaveLength(1);
  });

  it("already-decided finding → job still resumes (finding suppressed in next run via executor)", async () => {
    // Pre-populate decisions so the finding is already decided
    const { computeFindingKey } = await import("../../../src/core/decision/decision-ledger.js");
    const finding = {
      severity: "low" as const,
      resolution: "decision-needed" as const,
      file: "src/design.ts",
      title: "Human decision required",
      rationale: "Product owner must choose approach",
      options: [
        { label: "Option A: approach A", consequence: "Consequence A" },
        { label: "Option B: approach B", consequence: "Consequence B" },
      ],
    };
    const job = makeDecisionJobState({
      decisions: [
        {
          id: "decision-pre",
          step: "spec-review",
          findingKey: computeFindingKey("spec-review", finding),
          finding: { title: finding.title, file: finding.file, rationale: finding.rationale, severity: finding.severity },
          selectedOption: { number: 1, label: "Option A: approach A", consequence: "Consequence A" },
          decidedAt: "2026-01-01T00:00:00.000Z",
          source: "issue-comment",
        },
      ],
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([job]);

    // No open decisions (all decided) → prose-only resume is fine
    const comments = [
      { id: 1, body: DECISION_ESCALATION_MARKER, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume proceed", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    // Prose resume succeeds since all decisions are already recorded
    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(summary.resumed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: old-format tool results without options (T-09)
// ---------------------------------------------------------------------------

describe("backward compat — old decision-needed findings without options", () => {
  it("job with legacy decision-needed finding (no options) does not crash orchestrator", async () => {
    const legacyJob: JobState = {
      version: 1,
      jobId: "legacy-job-id-001",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      request: { path: "/specrunner/changes/old-feature/request.md", title: "Old feature", type: "new-feature", slug: "old-feature" },
      repository: { owner: "test", name: "repo" },
      session: null,
      step: "spec-review",
      status: "awaiting-resume",
      branch: "feat/old-feature",
      history: [],
      error: null,
      issueNumber: 50,
      resumePoint: {
        step: "spec-review",
        reason: "decision required",
        iterationsExhausted: 0,
      },
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:01.000Z",
            outcome: {
              verdict: "escalation",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [
                  {
                    // Legacy: decision-needed without options field
                    severity: "low",
                    resolution: "decision-needed",
                    file: "src/legacy.ts",
                    title: "Legacy decision",
                    rationale: "Old format without options",
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const legacyEscalationMarker = buildMarker("escalation", "legacy-job-id-001");
    vi.mocked(JobStateStore.list).mockResolvedValue([legacyJob]);

    const comments = [
      { id: 1, body: legacyEscalationMarker, authorAssociation: "OWNER", createdAt: DECISION_CUTOFF_TS },
      { id: 2, body: "/resume please proceed", authorAssociation: "OWNER", createdAt: DECISION_AFTER_CUTOFF_TS },
    ];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue(comments),
    });
    const effects = makeEffects();

    // Should not throw; legacy finding has no options → treated as no-options, prose-only resume allowed
    const summary = await runInboxOrchestrator(makeOpts(client, effects));

    expect(effects.resumeJob).toHaveBeenCalledOnce();
    expect(summary.errors).toHaveLength(0);
  });
});

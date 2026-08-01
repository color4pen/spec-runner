/**
 * Unit tests for inbox occupancy rejection propagation to GitHub issues.
 *
 * TC-048: occupancy rejection is commented once on the issue
 *   (spec.md > Requirement: inbox propagates an occupancy rejection to the issue, idempotently >
 *    Scenario: occupancy rejection is commented once)
 * TC-049: repeated inbox polling does not post a duplicate comment
 *   (spec.md > Requirement: inbox propagates an occupancy rejection to the issue, idempotently >
 *    Scenario: repeated polling does not repeat the comment)
 * TC-050: reject comment body names prior jobId, status, and recommended exit (tasks.md > T-10, should)
 *
 * Source: spec.md, tasks.md > T-10
 *
 * These tests will be RED until runInboxOrchestrator is updated to:
 *   1. Catch SLUG_OCCUPIED errors from startJob and call postRejectComment
 *   2. Check existing comments for an occupancy marker before posting (dedup)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubClient } from "../../../src/core/port/github-client.js";
import { runInboxOrchestrator } from "../../../src/core/inbox/run-inbox.js";
import { SpecRunnerError, ERROR_CODES } from "../../../src/errors.js";

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
- **slug**: my-change
- **base-branch**: main
- **adr**: false
`;

const PRIOR_JOB_ID = "abc-1234-5678-90ab-cdef";
const PRIOR_JOB_STATUS = "awaiting-resume";

/**
 * Build a SLUG_OCCUPIED SpecRunnerError carrying priorJobId and priorStatus.
 * This mirrors what slugOccupiedError() from src/errors.ts will produce once implemented.
 */
function makeSlugOccupiedError(priorJobId: string, priorStatus: string): SpecRunnerError {
  const err = new SpecRunnerError(
    ERROR_CODES.SLUG_OCCUPIED ?? "SLUG_OCCUPIED",
    `Cancel or archive the prior job (${priorJobId}) before starting a new one.`,
    `Slug 'my-change' is already occupied by a non-terminal job (${priorJobId}, status: ${priorStatus}).`,
  );
  // Attach structured fields so the orchestrator can build the reject comment
  Object.assign(err, { priorJobId, priorStatus });
  return err;
}

/**
 * Build the marker string that would be embedded in an occupancy reject comment.
 * Format matches what the implementation should produce.
 */
function buildOccupancyMarker(priorJobId: string): string {
  return `<!-- specrunner:notification kind="slug-occupied" priorJobId="${priorJobId}" version="1" -->`;
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

function makeEffects(overrides: Partial<{
  startJob: (...args: unknown[]) => Promise<void>;
  resumeJob: (...args: unknown[]) => Promise<void>;
  postRejectComment: (...args: unknown[]) => Promise<void>;
  removeApprovalLabel: (...args: unknown[]) => Promise<void>;
  isStale: (state: unknown) => boolean;
  persistState: (...args: unknown[]) => Promise<void>;
  notifyEscalation: (...args: unknown[]) => Promise<void>;
  isIssueLinked: (issueNumber: number) => Promise<boolean>;
}> = {}) {
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

function makeOpts(
  githubClient: GitHubClient,
  effects: ReturnType<typeof makeEffects>,
  partial: Partial<Parameters<typeof runInboxOrchestrator>[0]> = {},
) {
  return {
    githubClient,
    owner: "testowner",
    repo: "testrepo",
    repoRoot: "/fake/repo",
    approveLabel: "specrunner-approved",
    maxStartsPerRun: 3,
    effects,
    ...partial,
  };
}

beforeEach(() => {
  vi.mocked(JobStateStore.list).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// TC-048: occupancy rejection is commented once on the issue
// ---------------------------------------------------------------------------

describe("TC-048: occupancy rejection is commented once on the issue", () => {
  it("calls postRejectComment when startJob throws SLUG_OCCUPIED", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([]),
    });

    const slugOccupiedErr = makeSlugOccupiedError(PRIOR_JOB_ID, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    // Should call postRejectComment (not just log a warning)
    expect(effects.postRejectComment).toHaveBeenCalledOnce();
  });

  it("postRejectComment is called with the correct issue number when SLUG_OCCUPIED", async () => {
    const issues = [{ number: 42, title: "Feature X", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([]),
    });

    const slugOccupiedErr = makeSlugOccupiedError(PRIOR_JOB_ID, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    const [issueNum] = vi.mocked(effects.postRejectComment).mock.calls[0];
    expect(issueNum).toBe(42);
  });

  it("does NOT call startJob more than once for a single occupied issue", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([]),
    });

    const slugOccupiedErr = makeSlugOccupiedError(PRIOR_JOB_ID, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    // startJob was attempted once, and the error caused one reject comment
    expect(vi.mocked(effects.startJob)).toHaveBeenCalledOnce();
    expect(effects.postRejectComment).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-049: repeated inbox polling does not post a duplicate comment
// ---------------------------------------------------------------------------

describe("TC-049: repeated inbox polling does not post a duplicate occupancy comment", () => {
  it("does NOT call postRejectComment when an occupancy comment for the same priorJobId already exists", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];

    // An existing comment already contains the occupancy marker for the same priorJobId
    const existingOccupancyComment = {
      id: 100,
      body: `${buildOccupancyMarker(PRIOR_JOB_ID)}\n\nSlug is occupied.`,
      authorAssociation: "NONE",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([existingOccupancyComment]),
    });

    const slugOccupiedErr = makeSlugOccupiedError(PRIOR_JOB_ID, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    // Should NOT post another reject comment (dedup)
    expect(effects.postRejectComment).not.toHaveBeenCalled();
  });

  it("DOES call postRejectComment if the existing comment is for a DIFFERENT priorJobId", async () => {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];

    // Existing comment is for a different priorJobId (different occupation event)
    const differentPriorJobId = "different-job-id-0001";
    const existingOccupancyComment = {
      id: 100,
      body: `${buildOccupancyMarker(differentPriorJobId)}\n\nSlug is occupied.`,
      authorAssociation: "NONE",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([existingOccupancyComment]),
    });

    // The new error is for a NEW priorJobId (different occupant)
    const newPriorJobId = "new-occupant-job-id-0002";
    const slugOccupiedErr = makeSlugOccupiedError(newPriorJobId, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    // Different priorJobId → new comment should be posted
    expect(effects.postRejectComment).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-050: reject comment body names prior jobId, status, and recommended exit (should)
// ---------------------------------------------------------------------------

describe("TC-050: occupancy reject comment body names prior jobId, status, and recommended exit", () => {
  async function getPostedCommentBody(): Promise<string> {
    const issues = [{ number: 1, title: "Fix login", body: VALID_REQUEST_MD }];
    const client = makeGitHubClient({
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue(issues),
      listIssueComments: vi.fn().mockResolvedValue([]),
    });

    const slugOccupiedErr = makeSlugOccupiedError(PRIOR_JOB_ID, PRIOR_JOB_STATUS);
    const effects = makeEffects({
      startJob: vi.fn().mockRejectedValue(slugOccupiedErr),
    });

    await runInboxOrchestrator(makeOpts(client, effects));

    const calls = vi.mocked(effects.postRejectComment).mock.calls;
    if (calls.length === 0) return "";
    return String(calls[0][1]);
  }

  it("comment body contains the prior job's jobId", async () => {
    const body = await getPostedCommentBody();
    expect(body).toContain(PRIOR_JOB_ID);
  });

  it("comment body contains the prior job's status", async () => {
    const body = await getPostedCommentBody();
    expect(body).toContain(PRIOR_JOB_STATUS);
  });

  it("comment body contains a recommended exit instruction (resume or cancel)", async () => {
    const body = await getPostedCommentBody();
    // Should advise the user on how to unblock: resume the halted job or cancel it
    expect(body).toMatch(/specrunner job (resume|cancel)/i);
  });

  it("comment body contains the occupancy machine-readable marker", async () => {
    const body = await getPostedCommentBody();
    // The comment must have a machine-readable marker so repeated polls can dedup
    expect(body).toContain("specrunner:notification");
    expect(body).toContain("slug-occupied");
    expect(body).toContain(PRIOR_JOB_ID);
  });
});

/**
 * Unit tests for planStarts dedup logic, planInbox wiring (T-04),
 * and planResumes stale-comment re-consumption guard (reopen sequence).
 */
import { describe, it, expect, vi } from "vitest";
import { planStarts, planInbox, planResumes } from "../planner.js";
import type { IssueRef, IssueComment } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import { NOTIFICATION_COMMENT_PREFIX } from "../../notify/issue-notifier.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

vi.mock("../../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
}));

/** A valid request.md body that planStarts can parse into a start action. */
function makeValidIssueBody(slug: string): string {
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

/** An invalid issue body that fails parseRequestMdContent. */
const INVALID_BODY = "not a request.md body";

/** Build a reject notification comment body for an issue. */
function makeRejectNotificationComment(issueNumber: number): IssueComment {
  return {
    id: 1001,
    body: `${NOTIFICATION_COMMENT_PREFIX} kind="reject" issue="${issueNumber}" version="1" -->\n\nCould not start job.`,
    authorAssociation: "NONE",
    createdAt: "2026-06-12T01:00:00Z",
  };
}

/** Build an escalation notification comment body for a job. */
function makeEscalationNotificationComment(jobId: string): IssueComment {
  return {
    id: 1002,
    body: `${NOTIFICATION_COMMENT_PREFIX} kind="escalation" jobId="${jobId}" version="1" -->\n\nJob stopped.`,
    authorAssociation: "NONE",
    createdAt: "2026-06-12T00:50:00Z",
  };
}

/** Make a minimal IssueRef. */
function makeIssue(number: number, body: string): IssueRef {
  return { number, title: `Issue ${number}`, body };
}

// ---------------------------------------------------------------------------
// TC-P1: no comments map — reject is produced
// ---------------------------------------------------------------------------

describe("planStarts — TC-P1: no commentsByIssue", () => {
  it("produces a RejectAction when issue body is invalid and no commentsByIssue", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const { starts, rejects } = planStarts([issue], [], 5, undefined);
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.issue.number).toBe(644);
    expect(starts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-P2: dedup suppresses reject when latest notification is kind="reject"
// ---------------------------------------------------------------------------

describe("planStarts — TC-P2: dedup suppresses reject", () => {
  it("skips RejectAction when latest notification is already kind=reject for this issue", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const comments = new Map<number, IssueComment[]>([
      [644, [makeRejectNotificationComment(644)]],
    ]);
    const { starts, rejects } = planStarts([issue], [], 5, comments);
    expect(rejects).toHaveLength(0);
    expect(starts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-P3: dedup does not fire for valid body (start is produced)
// ---------------------------------------------------------------------------

describe("planStarts — TC-P3: valid body produces StartAction regardless of reject notification", () => {
  it("produces a StartAction even when a prior reject notification exists, because body is now valid", () => {
    const issue = makeIssue(644, makeValidIssueBody("fix-dedup-valid"));
    const comments = new Map<number, IssueComment[]>([
      [644, [makeRejectNotificationComment(644)]],
    ]);
    const { starts, rejects } = planStarts([issue], [], 5, comments);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.issue.number).toBe(644);
    expect(rejects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-P4: wrong kind (escalation) does not suppress reject
// ---------------------------------------------------------------------------

describe("planStarts — TC-P4: escalation notification does not dedup reject", () => {
  it("produces a RejectAction when latest notification is kind=escalation (not reject)", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const comments = new Map<number, IssueComment[]>([
      [644, [makeEscalationNotificationComment("job-abc-123")]],
    ]);
    const { starts, rejects } = planStarts([issue], [], 5, comments);
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.issue.number).toBe(644);
    expect(starts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-P5: re-apply label → valid body → start is planned
// ---------------------------------------------------------------------------

describe("planStarts — TC-P5: start after rejection fixed (label re-applied)", () => {
  it("produces a StartAction when issue previously rejected but body is now valid", () => {
    const issue = makeIssue(644, makeValidIssueBody("fix-reapply"));
    // Prior reject notification exists, but body is now valid
    const comments = new Map<number, IssueComment[]>([
      [644, [makeRejectNotificationComment(644)]],
    ]);
    const { starts, rejects } = planStarts([issue], [], 5, comments);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.slug).toBe("fix-reapply");
    expect(rejects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-P6: planInbox passes commentsByIssue to planStarts (integration)
// ---------------------------------------------------------------------------

describe("planInbox — TC-P6: commentsByIssue wiring suppresses duplicate reject", () => {
  it("produces no rejects when unlinked approved issue already has kind=reject notification", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const comments = new Map<number, IssueComment[]>([
      [644, [makeRejectNotificationComment(644)]],
    ]);
    const plan = planInbox({
      approvedIssues: [issue],
      jobStates: [],
      maxStarts: 5,
      commentsByIssue: comments,
    });
    expect(plan.rejects).toHaveLength(0);
    expect(plan.starts).toHaveLength(0);
  });

  it("produces a reject when no prior reject notification exists", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const plan = planInbox({
      approvedIssues: [issue],
      jobStates: [],
      maxStarts: 5,
      commentsByIssue: new Map(),
    });
    expect(plan.rejects).toHaveLength(1);
    expect(plan.rejects[0]!.issue.number).toBe(644);
  });
});

// ---------------------------------------------------------------------------
// Edge: dedup uses latest notification comment (not just any notification)
// ---------------------------------------------------------------------------

describe("planStarts — dedup uses latest notification (not earliest)", () => {
  it("does not dedup when latest notification is escalation but an earlier one was reject", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const rejectComment = makeRejectNotificationComment(644);
    const escalationComment: IssueComment = {
      ...makeEscalationNotificationComment("job-abc"),
      // escalation is newer
      createdAt: "2026-06-12T02:00:00Z",
    };
    const comments = new Map<number, IssueComment[]>([
      [644, [rejectComment, escalationComment]],
    ]);
    const { rejects } = planStarts([issue], [], 5, comments);
    // Latest notification is escalation → not deduped → reject produced
    expect(rejects).toHaveLength(1);
  });

  it("dedups when latest notification is reject (escalation is older)", () => {
    const issue = makeIssue(644, INVALID_BODY);
    const escalationComment: IssueComment = {
      ...makeEscalationNotificationComment("job-abc"),
      createdAt: "2026-06-12T00:50:00Z",
    };
    const rejectComment: IssueComment = {
      ...makeRejectNotificationComment(644),
      // reject is newer
      createdAt: "2026-06-12T01:00:00Z",
    };
    const comments = new Map<number, IssueComment[]>([
      [644, [escalationComment, rejectComment]],
    ]);
    const { rejects } = planStarts([issue], [], 5, comments);
    // Latest notification is reject → deduped
    expect(rejects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// planResumes — stale /resume comment re-consumption after job reopen
//
// Regression guard for the sequence:
//   job escalates → awaiting-resume
//   operator posts /resume comment (consumed by inbox, pipeline runs)
//   pipeline reaches awaiting-archive
//   operator runs `job reopen` → awaiting-resume (no new escalation notification)
//   next inbox poll must NOT re-consume the old /resume comment
// ---------------------------------------------------------------------------

/** Build a minimal awaiting-resume JobState for planResumes tests. */
function makeAwaitingResumeJob(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-reopen-test",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    request: { path: "specrunner/changes/test/request.md", title: "Test", type: "bug-fix", slug: "test-slug" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "code-fixer",
    status: "awaiting-resume",
    branch: "fix/test-slug",
    history: [],
    error: null,
    issueNumber: 42,
    ...overrides,
  } as JobState;
}

describe("planResumes — stale /resume comment re-consumption after job reopen", () => {
  it("does NOT re-consume a /resume comment posted before the reopen transition", () => {
    // Timeline:
    //   T1 (10:00): escalation notification posted (the cutoff marker)
    //   T2 (11:00): operator posts /resume comment — consumed by inbox, pipeline runs
    //   T3 (12:00): job reopen transitions job to awaiting-resume (updatedAt = T3)
    //   T_poll    : next inbox poll — should NOT re-consume the T2 /resume comment

    const escalationComment: IssueComment = {
      id: 101,
      body: `${NOTIFICATION_COMMENT_PREFIX} kind="escalation" jobId="job-reopen-test" version="1" -->\nJob stopped.`,
      authorAssociation: "NONE",
      createdAt: "2026-06-10T10:00:00Z",  // T1: escalation marker
    };
    const staleResumeComment: IssueComment = {
      id: 102,
      body: "/resume apply feedback from review",
      authorAssociation: "OWNER",
      createdAt: "2026-06-10T11:00:00Z",  // T2: previously consumed /resume
    };

    // After reopen, job.updatedAt = T3 (12:00) — later than the stale /resume at T2 (11:00)
    const jobAfterReopen = makeAwaitingResumeJob({
      updatedAt: "2026-06-10T12:00:00Z",  // T3: reopen timestamp
    });

    const commentsByIssue = new Map<number, IssueComment[]>([
      [42, [escalationComment, staleResumeComment]],
    ]);

    const resumes = planResumes([jobAfterReopen], commentsByIssue);

    // THEN: the stale /resume comment must NOT trigger a resume action
    expect(resumes).toHaveLength(0);
  });

  it("DOES include a fresh /resume comment posted after the reopen transition", () => {
    // Same timeline as above, but the operator posts a NEW /resume after reopen.
    //   T1 (10:00): escalation notification
    //   T2 (11:00): stale /resume comment (already consumed by inbox before reopen)
    //   T3 (12:00): job reopen (updatedAt = T3)
    //   T4 (13:00): NEW /resume comment posted after reopen — should be consumed

    const escalationComment: IssueComment = {
      id: 101,
      body: `${NOTIFICATION_COMMENT_PREFIX} kind="escalation" jobId="job-reopen-test" version="1" -->\nJob stopped.`,
      authorAssociation: "NONE",
      createdAt: "2026-06-10T10:00:00Z",
    };
    const staleResumeComment: IssueComment = {
      id: 102,
      body: "/resume old instruction",
      authorAssociation: "OWNER",
      createdAt: "2026-06-10T11:00:00Z",
    };
    const freshResumeComment: IssueComment = {
      id: 103,
      body: "/resume post-reopen instruction",
      authorAssociation: "OWNER",
      createdAt: "2026-06-10T13:00:00Z",  // T4: after reopen at T3 (12:00)
    };

    const jobAfterReopen = makeAwaitingResumeJob({
      updatedAt: "2026-06-10T12:00:00Z",
    });

    const commentsByIssue = new Map<number, IssueComment[]>([
      [42, [escalationComment, staleResumeComment, freshResumeComment]],
    ]);

    const resumes = planResumes([jobAfterReopen], commentsByIssue);

    // THEN: only the fresh /resume comment triggers a resume action
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.resumePrompt).toBe("post-reopen instruction");
    expect(resumes[0]!.slug).toBe("test-slug");
  });

  it("normal first-escalation path: /resume after notification is still consumed", () => {
    // Baseline: normal flow where job first escalates.
    //   job.updatedAt (10:00) is set when state transitions to awaiting-resume
    //   escalation notification posted at T1 (10:05) — after state transition
    //   operator posts /resume at T2 (11:00) > T1
    // effectiveCutoff = max(T1, job.updatedAt) = T1 (notification is later)
    // /resume at T2 > T1 → must be consumed

    const escalationComment: IssueComment = {
      id: 201,
      body: `${NOTIFICATION_COMMENT_PREFIX} kind="escalation" jobId="job-reopen-test" version="1" -->\nJob stopped.`,
      authorAssociation: "NONE",
      createdAt: "2026-06-10T10:05:00Z",  // T1: notification (after state transition)
    };
    const resumeComment: IssueComment = {
      id: 202,
      body: "/resume fix the issue",
      authorAssociation: "MEMBER",
      createdAt: "2026-06-10T11:00:00Z",  // T2: /resume after notification
    };

    // job.updatedAt = 10:00 (state transition before notification)
    const job = makeAwaitingResumeJob({
      updatedAt: "2026-06-10T10:00:00Z",
    });

    const commentsByIssue = new Map<number, IssueComment[]>([
      [42, [escalationComment, resumeComment]],
    ]);

    const resumes = planResumes([job], commentsByIssue);

    // THEN: the /resume comment qualifies — effective cutoff is notification timestamp
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.resumePrompt).toBe("fix the issue");
  });
});

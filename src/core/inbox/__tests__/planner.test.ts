/**
 * Unit tests for planStarts dedup logic and planInbox wiring (T-04).
 */
import { describe, it, expect, vi } from "vitest";
import { planStarts, planInbox } from "../planner.js";
import type { IssueRef, IssueComment } from "../types.js";
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

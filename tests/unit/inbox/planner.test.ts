/**
 * T-04 / T-08 planner unit tests.
 *
 * Covers:
 * - planStarts: idempotency, validate-reject, maxStarts cap
 * - planResumes: cutoff gate, permission gate, bot exclusion, resume command parsing
 * - parseResumePrompt: various forms
 * - planInbox: composition
 */
import { describe, it, expect } from "vitest";
import { planStarts, planResumes, parseResumePrompt, planInbox } from "../../../src/core/inbox/planner.js";
import type { IssueRef, IssueComment } from "../../../src/core/inbox/types.js";
import type { JobState } from "../../../src/state/schema.js";
import { buildMarker } from "../../../src/core/notify/issue-notifier.js";

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

function makeIssue(number: number, body: string = VALID_REQUEST_MD): IssueRef {
  return { number, title: `Issue ${number}`, body };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: overrides.jobId ?? "aaaabbbb-0000-0000-0000-000000000001",
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

function makeComment(
  id: number,
  body: string,
  authorAssociation: string,
  createdAt: string,
): IssueComment {
  return { id, body, authorAssociation, createdAt };
}

// ---------------------------------------------------------------------------
// planStarts
// ---------------------------------------------------------------------------

describe("planStarts", () => {
  it("approves valid issue and creates StartAction", () => {
    const issue = makeIssue(1, VALID_REQUEST_MD);
    const { starts, rejects } = planStarts([issue], [], 5);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.issue.number).toBe(1);
    expect(starts[0]!.slug).toBe("fix-login-bug");
    expect(rejects).toHaveLength(0);
  });

  it("rejects invalid issue body with error reason", () => {
    const issue = makeIssue(2, "not a valid request.md at all");
    const { starts, rejects } = planStarts([issue], [], 5);
    expect(starts).toHaveLength(0);
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.issue.number).toBe(2);
    expect(rejects[0]!.reason).toBeTruthy();
  });

  it("excludes issues already linked to a job (idempotency)", () => {
    const issue = makeIssue(1, VALID_REQUEST_MD);
    const existingJob = makeJobState({ issueNumber: 1 });
    const { starts, rejects } = planStarts([issue], [existingJob], 5);
    expect(starts).toHaveLength(0);
    expect(rejects).toHaveLength(0);
  });

  it("excludes linked issues regardless of job status", () => {
    const issue = makeIssue(1, VALID_REQUEST_MD);
    const runningJob = makeJobState({ issueNumber: 1, status: "running" });
    const { starts } = planStarts([issue], [runningJob], 5);
    expect(starts).toHaveLength(0);
  });

  it("respects maxStarts cap (only starts up to maxStarts)", () => {
    const issues = [makeIssue(1), makeIssue(2), makeIssue(3)];
    const { starts, rejects } = planStarts(issues, [], 2);
    expect(starts).toHaveLength(2);
    expect(rejects).toHaveLength(0);
  });

  it("rejects are not counted against maxStarts", () => {
    const issues = [
      makeIssue(1, "bad content"),
      makeIssue(2, VALID_REQUEST_MD),
    ];
    const { starts, rejects } = planStarts(issues, [], 1);
    expect(starts).toHaveLength(1);
    expect(rejects).toHaveLength(1);
  });

  it("maxStarts: 0 produces no starts (resume-only mode)", () => {
    const issue = makeIssue(1, VALID_REQUEST_MD);
    const { starts } = planStarts([issue], [], 0);
    expect(starts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// planResumes
// ---------------------------------------------------------------------------

const JOB_ID = "aaaabbbb-0000-0000-0000-000000000002";
const ESCALATION_MARKER = buildMarker("escalation", JOB_ID);
const CUTOFF_TS = "2024-01-05T12:00:00Z";
const AFTER_CUTOFF = "2024-01-05T13:00:00Z";
const BEFORE_CUTOFF = "2024-01-05T11:00:00Z";

function makeAwaitingJob(issueNumber: number, slug = "my-feature"): JobState {
  return makeJobState({
    jobId: JOB_ID,
    status: "awaiting-resume",
    issueNumber,
    request: {
      path: `/specrunner/changes/${slug}/request.md`,
      title: "My feature",
      type: "new-feature",
      slug,
    },
  });
}

describe("planResumes", () => {
  it("produces ResumeAction for valid /resume comment after escalation marker", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume fix the issue", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe("my-feature");
    expect(result[0]!.resumePrompt).toBe("fix the issue");
  });

  it("does not resume when no escalation marker comment exists", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, "/resume fix the issue", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("does not resume when /resume comment is before the escalation marker", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, "/resume early comment", "OWNER", BEFORE_CUTOFF),
      makeComment(2, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("does not resume when /resume comment is at exactly the cutoff time", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume at cutoff", "OWNER", CUTOFF_TS), // equal, not strictly greater
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("excludes /resume from unauthorized author (CONTRIBUTOR)", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume unauthorized", "CONTRIBUTOR", AFTER_CUTOFF),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("excludes /resume from NONE association", () => {
    const job = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume spam", "NONE", AFTER_CUTOFF),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("allows OWNER, MEMBER, COLLABORATOR associations", () => {
    for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const job = makeAwaitingJob(10);
      const comments: IssueComment[] = [
        makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
        makeComment(2, `/resume from ${assoc}`, assoc, AFTER_CUTOFF),
      ];
      const map = new Map([[10, comments]]);
      const result = planResumes([job], map);
      expect(result, `${assoc} should be allowed`).toHaveLength(1);
    }
  });

  it("excludes bot notification comments (isNotificationComment)", () => {
    const job = makeAwaitingJob(10);
    const botComment = `<!-- specrunner:notification kind="completed" jobId="xyz" version="1" -->\n/resume this is a bot comment`;
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, botComment, "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("picks the latest qualifying /resume comment when multiple exist", () => {
    const job = makeAwaitingJob(10);
    const ts1 = "2024-01-06T00:00:00Z";
    const ts2 = "2024-01-07T00:00:00Z";
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume first", "OWNER", ts1),
      makeComment(3, "/resume second (latest)", "OWNER", ts2),
    ];
    const map = new Map([[10, comments]]);
    const result = planResumes([job], map);
    expect(result).toHaveLength(1);
    expect(result[0]!.resumePrompt).toBe("second (latest)");
  });

  it("skips job with no issue number", () => {
    const job = makeJobState({ status: "awaiting-resume", issueNumber: undefined });
    const map = new Map<number, IssueComment[]>();
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });

  it("skips job when no comments in map", () => {
    const job = makeAwaitingJob(99);
    const map = new Map<number, IssueComment[]>();
    const result = planResumes([job], map);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseResumePrompt
// ---------------------------------------------------------------------------

describe("parseResumePrompt", () => {
  it("returns null for '/resume' with no trailing text", () => {
    expect(parseResumePrompt("/resume")).toBeNull();
  });

  it("returns null for '/resume   ' (only whitespace)", () => {
    expect(parseResumePrompt("/resume   ")).toBeNull();
  });

  it("returns text after '/resume ' for single-line", () => {
    expect(parseResumePrompt("/resume fix the authentication bug")).toBe("fix the authentication bug");
  });

  it("returns multiline text after '/resume\\n'", () => {
    const body = "/resume\nFirst line\nSecond line";
    expect(parseResumePrompt(body)).toBe("First line\nSecond line");
  });

  it("trims leading/trailing whitespace from the prompt", () => {
    expect(parseResumePrompt("/resume   hello world  ")).toBe("hello world");
  });

  it("handles '/resume' with leading whitespace in body", () => {
    expect(parseResumePrompt("  /resume text")).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// planInbox (composition)
// ---------------------------------------------------------------------------

describe("planInbox", () => {
  it("produces starts + resumes from combined input", () => {
    const issue = makeIssue(1, VALID_REQUEST_MD);
    const awaitingJob = makeAwaitingJob(10);
    const comments: IssueComment[] = [
      makeComment(1, buildMarker("escalation", JOB_ID), "OWNER", CUTOFF_TS),
      makeComment(2, "/resume go ahead", "OWNER", AFTER_CUTOFF),
    ];
    const plan = planInbox({
      approvedIssues: [issue],
      jobStates: [awaitingJob],
      maxStarts: 5,
      commentsByIssue: new Map([[10, comments]]),
    });

    expect(plan.starts).toHaveLength(1);
    expect(plan.resumes).toHaveLength(1);
    expect(plan.rejects).toHaveLength(0);
  });

  it("does not affect jobs without issue links", () => {
    const issueUnlinkedJob = makeJobState({
      status: "awaiting-resume",
      issueNumber: undefined,
    });
    const plan = planInbox({
      approvedIssues: [],
      jobStates: [issueUnlinkedJob],
      maxStarts: 5,
      commentsByIssue: new Map(),
    });
    expect(plan.starts).toHaveLength(0);
    expect(plan.resumes).toHaveLength(0);
  });
});

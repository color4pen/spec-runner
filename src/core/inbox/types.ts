/**
 * Types for the inbox planner (T-04).
 *
 * IssueRef, IssueComment, StartAction, RejectAction, ResumeAction, InboxPlan.
 */

/** A GitHub issue reference. */
export interface IssueRef {
  number: number;
  title: string;
  body: string;
}

/** A comment on a GitHub issue. */
export interface IssueComment {
  id: number;
  body: string;
  /** GitHub author_association: OWNER | MEMBER | COLLABORATOR | CONTRIBUTOR | NONE | etc. */
  authorAssociation: string;
  createdAt: string;
}

/** Action: start a new job from an issue. */
export interface StartAction {
  kind: "start";
  issue: IssueRef;
  /** Slug parsed from the issue body's request.md content. */
  slug: string;
}

/** Action: reject an issue (validation failed) with an error comment. */
export interface RejectAction {
  kind: "reject";
  issue: IssueRef;
  /** Validation error message to post as a comment. */
  reason: string;
}

/** Action: resume an awaiting-resume job. */
export interface ResumeAction {
  kind: "resume";
  /** Slug of the job to resume. */
  slug: string;
  jobId: string;
  issueNumber: number;
  /** Text to pass as resumePrompt. null if /resume had no body text. */
  resumePrompt: string | null;
}

/** The aggregate plan produced by planInbox. */
export interface InboxPlan {
  starts: StartAction[];
  rejects: RejectAction[];
  resumes: ResumeAction[];
}

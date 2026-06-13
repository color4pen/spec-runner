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
  /**
   * Decision records to append to state before resuming.
   * Only set when the /resume comment contained valid N=M selection tokens.
   * Absent when the comment was prose-only.
   */
  decisions?: import("../../state/schema.js").DecisionRecord[];
}

/** Action: auto-resume an orphaned (stale) running job. */
export interface RecoverAction {
  kind: "recover";
  slug: string;
  jobId: string;
  issueNumber?: number | null;
  /** New staleRecovery value to persist before resuming. */
  staleRecovery: { attempts: number; stepCount: number };
}

/** Action: cap exceeded — escalate a stale running job to awaiting-resume. */
export interface EscalateAction {
  kind: "escalate";
  slug: string;
  jobId: string;
  issueNumber?: number | null;
  /** Job step at detection time, used to build the synthetic resumePoint. */
  step: string;
}

/** The aggregate plan produced by planInbox. */
export interface InboxPlan {
  starts: StartAction[];
  rejects: RejectAction[];
  resumes: ResumeAction[];
  recovers: RecoverAction[];
  escalates: EscalateAction[];
}

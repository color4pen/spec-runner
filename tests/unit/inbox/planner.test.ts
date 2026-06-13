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
import { planStarts, planResumes, parseResumePrompt, parseResumeDecisionInput, planInbox, planStaleRecoveries, countStepRuns, MAX_STALE_RECOVERY_ATTEMPTS } from "../../../src/core/inbox/planner.js";
import type { IssueRef, IssueComment } from "../../../src/core/inbox/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepRun } from "../../../src/state/schema.js";
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

  it("planInbox with staleRunningJobIds routes stale job to recovers", () => {
    const staleJob = makeJobState({
      status: "running",
      jobId: "stale-job-id",
      request: { path: "/specrunner/changes/my-feature/request.md", title: "T", type: "bug-fix", slug: "my-feature" },
    });
    const staleIds = new Set(["stale-job-id"]);
    const plan = planInbox({
      approvedIssues: [],
      jobStates: [staleJob],
      maxStarts: 5,
      commentsByIssue: new Map(),
      staleRunningJobIds: staleIds,
    });
    expect(plan.recovers).toHaveLength(1);
    expect(plan.escalates).toHaveLength(0);
    expect(plan.recovers[0]!.slug).toBe("my-feature");
  });

  it("planInbox without staleRunningJobIds produces empty recovers/escalates", () => {
    const runningJob = makeJobState({ status: "running" });
    const plan = planInbox({
      approvedIssues: [],
      jobStates: [runningJob],
      maxStarts: 5,
      commentsByIssue: new Map(),
    });
    expect(plan.recovers).toHaveLength(0);
    expect(plan.escalates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// countStepRuns
// ---------------------------------------------------------------------------

function makeStepRun(attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null },
    startedAt: "2024-01-01T00:00:00.000Z",
    endedAt: "2024-01-01T00:00:01.000Z",
  };
}

describe("countStepRuns", () => {
  it("returns 0 when steps is undefined", () => {
    const state = makeJobState({ steps: undefined });
    expect(countStepRuns(state)).toBe(0);
  });

  it("returns 0 when steps is empty", () => {
    const state = makeJobState({ steps: {} });
    expect(countStepRuns(state)).toBe(0);
  });

  it("returns total step run count across all steps", () => {
    const state = makeJobState({
      steps: {
        design: [makeStepRun(1), makeStepRun(2)],
        review: [makeStepRun(1)],
        build: [makeStepRun(1), makeStepRun(2), makeStepRun(3)],
      },
    });
    expect(countStepRuns(state)).toBe(6);
  });

  it("returns sum of a single step with multiple runs", () => {
    const state = makeJobState({
      steps: { design: [makeStepRun(1), makeStepRun(2), makeStepRun(3)] },
    });
    expect(countStepRuns(state)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// planStaleRecoveries
// ---------------------------------------------------------------------------

function makeRunningJob(overrides: Partial<JobState> = {}): JobState {
  return makeJobState({
    status: "running",
    request: { path: "/specrunner/changes/my-feature/request.md", title: "T", type: "bug-fix", slug: "my-feature" },
    ...overrides,
  });
}

describe("planStaleRecoveries", () => {
  it("no staleRecovery stored → recover with attempts=1, stepCount=current", () => {
    const job = makeRunningJob({ steps: { design: [makeStepRun(1)] } });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(escalates).toHaveLength(0);
    expect(recovers).toHaveLength(1);
    const rec = recovers[0]!;
    expect(rec.kind).toBe("recover");
    expect(rec.slug).toBe("my-feature");
    expect(rec.staleRecovery.attempts).toBe(1);
    expect(rec.staleRecovery.stepCount).toBe(1);
  });

  it("stored.stepCount matches current & attempts < limit → recover with attempts+1", () => {
    const job = makeRunningJob({
      steps: { design: [makeStepRun(1)] },
      staleRecovery: { attempts: 1, stepCount: 1 },
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(escalates).toHaveLength(0);
    expect(recovers).toHaveLength(1);
    expect(recovers[0]!.staleRecovery.attempts).toBe(2);
    expect(recovers[0]!.staleRecovery.stepCount).toBe(1);
  });

  it("stored.stepCount differs from current (progress) → recover with attempts=1, new stepCount", () => {
    const job = makeRunningJob({
      steps: { design: [makeStepRun(1), makeStepRun(2)] },
      staleRecovery: { attempts: 2, stepCount: 1 }, // was 1, now 2
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(escalates).toHaveLength(0);
    expect(recovers).toHaveLength(1);
    expect(recovers[0]!.staleRecovery.attempts).toBe(1);
    expect(recovers[0]!.staleRecovery.stepCount).toBe(2);
  });

  it("stored.stepCount matches current & attempts >= limit → escalate", () => {
    const job = makeRunningJob({
      steps: { design: [makeStepRun(1)] },
      staleRecovery: { attempts: MAX_STALE_RECOVERY_ATTEMPTS, stepCount: 1 },
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(recovers).toHaveLength(0);
    expect(escalates).toHaveLength(1);
    const esc = escalates[0]!;
    expect(esc.kind).toBe("escalate");
    expect(esc.slug).toBe("my-feature");
    expect(esc.step).toBe(job.step);
  });

  it("boundary: attempts exactly at limit → escalate", () => {
    const job = makeRunningJob({
      staleRecovery: { attempts: MAX_STALE_RECOVERY_ATTEMPTS, stepCount: 0 },
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(recovers).toHaveLength(0);
    expect(escalates).toHaveLength(1);
  });

  it("boundary: attempts one below limit → recover", () => {
    const job = makeRunningJob({
      staleRecovery: { attempts: MAX_STALE_RECOVERY_ATTEMPTS - 1, stepCount: 0 },
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(recovers).toHaveLength(1);
    expect(escalates).toHaveLength(0);
  });

  it("job with empty slug is excluded from both lists", () => {
    const job = makeJobState({
      status: "running",
      // slug null + no branch → getJobSlug returns ""
      request: { path: "", title: "T", type: "bug-fix", slug: null },
      branch: null,
    });
    const { recovers, escalates } = planStaleRecoveries([job]);
    expect(recovers).toHaveLength(0);
    expect(escalates).toHaveLength(0);
  });

  it("staleRunningJobIds not containing running job → job not recovered/escalated", () => {
    const runningJob = makeRunningJob();
    // staleRunningJobIds does NOT include this job's id
    const staleIds = new Set<string>();
    const staleJobs = [runningJob].filter((s) => staleIds.has(s.jobId));
    const { recovers, escalates } = planStaleRecoveries(staleJobs);
    expect(recovers).toHaveLength(0);
    expect(escalates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseResumeDecisionInput (T-06)
// ---------------------------------------------------------------------------

describe("parseResumeDecisionInput", () => {
  it("/resume → empty selections, null resumePrompt", () => {
    const result = parseResumeDecisionInput("/resume");
    expect(result.selections).toEqual([]);
    expect(result.resumePrompt).toBeNull();
  });

  it("/resume prose only → empty selections, prose in resumePrompt", () => {
    const result = parseResumeDecisionInput("/resume fix the issue");
    expect(result.selections).toEqual([]);
    expect(result.resumePrompt).toBe("fix the issue");
  });

  it("/resume 1=2 → single selection, null prose", () => {
    const result = parseResumeDecisionInput("/resume 1=2");
    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]).toEqual({ findingNumber: 1, optionNumber: 2 });
    expect(result.resumePrompt).toBeNull();
  });

  it("/resume 1=2 2=1 → two selections, null prose", () => {
    const result = parseResumeDecisionInput("/resume 1=2 2=1");
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]).toEqual({ findingNumber: 1, optionNumber: 2 });
    expect(result.selections[1]).toEqual({ findingNumber: 2, optionNumber: 1 });
    expect(result.resumePrompt).toBeNull();
  });

  it("/resume 1=2 2=1 note → two selections + prose", () => {
    const result = parseResumeDecisionInput("/resume 1=2 2=1 note for agent");
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]).toEqual({ findingNumber: 1, optionNumber: 2 });
    expect(result.selections[1]).toEqual({ findingNumber: 2, optionNumber: 1 });
    expect(result.resumePrompt).toBe("note for agent");
  });

  it("N=0 token is not a valid selection — treated as prose, stops token scan", () => {
    const result = parseResumeDecisionInput("/resume 0=1 note");
    expect(result.selections).toEqual([]);
    expect(result.resumePrompt).toBe("0=1 note");
  });

  it("M=0 token is not a valid selection — treated as prose, stops token scan", () => {
    const result = parseResumeDecisionInput("/resume 1=0 note");
    expect(result.selections).toEqual([]);
    expect(result.resumePrompt).toBe("1=0 note");
  });

  it("word that is not N=M stops token scanning and becomes prose", () => {
    const result = parseResumeDecisionInput("/resume 1=2 word 3=4");
    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]).toEqual({ findingNumber: 1, optionNumber: 2 });
    expect(result.resumePrompt).toBe("word 3=4");
  });

  it("leading whitespace before /resume is ignored", () => {
    const result = parseResumeDecisionInput("   /resume 1=2");
    expect(result.selections).toHaveLength(1);
    expect(result.resumePrompt).toBeNull();
  });

  it("/resume with only whitespace → empty selections, null prompt", () => {
    const result = parseResumeDecisionInput("/resume   ");
    expect(result.selections).toEqual([]);
    expect(result.resumePrompt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// planResumes — decision recording (T-07)
// ---------------------------------------------------------------------------

function makeDecisionFinding(title: string, file: string) {
  return {
    severity: "low" as const,
    resolution: "decision-needed" as const,
    file,
    title,
    rationale: `Rationale for ${title}`,
    options: [
      { label: "Option A", consequence: "Consequence A" },
      { label: "Option B", consequence: "Consequence B" },
    ],
  };
}

function makeAwaitingJobWithDecisions(issueNumber: number): JobState {
  const finding = makeDecisionFinding("Human decision required", "src/design.ts");
  return makeJobState({
    jobId: JOB_ID,
    status: "awaiting-resume",
    issueNumber,
    step: "spec-review",
    request: {
      path: "/specrunner/changes/my-feature/request.md",
      title: "My feature",
      type: "new-feature",
      slug: "my-feature",
    },
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
            toolResult: { ok: true, findings: [finding] },
          },
        },
      ],
    },
  });
}

describe("planResumes — decision recording (T-07)", () => {
  it("/resume 1=1 on job with one open decision → ResumeAction with one decision record", () => {
    const job = makeAwaitingJobWithDecisions(20);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=1", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[20, comments]]);
    const result = planResumes([job], map);

    expect(result).toHaveLength(1);
    const action = result[0]!;
    expect(action.decisions).toHaveLength(1);
    const rec = action.decisions![0]!;
    expect(rec.step).toBe("spec-review");
    expect(rec.source).toBe("issue-comment");
    expect(rec.selectedOption.number).toBe(1);
    expect(rec.selectedOption.label).toBe("Option A");
    expect(rec.finding.title).toBe("Human decision required");
    expect(rec.findingKey).toBeTruthy();
    expect(rec.decidedAt).toBeTruthy();
  });

  it("/resume 1=2 → selects second option", () => {
    const job = makeAwaitingJobWithDecisions(21);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=2", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[21, comments]]);
    const result = planResumes([job], map);

    expect(result).toHaveLength(1);
    expect(result[0]!.decisions![0]!.selectedOption.number).toBe(2);
    expect(result[0]!.decisions![0]!.selectedOption.label).toBe("Option B");
  });

  it("prose after selections reaches resumePrompt", () => {
    const job = makeAwaitingJobWithDecisions(22);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=1 please also check X", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[22, comments]]);
    const result = planResumes([job], map);

    expect(result).toHaveLength(1);
    expect(result[0]!.resumePrompt).toBe("please also check X");
    expect(result[0]!.decisions).toHaveLength(1);
  });

  it("duplicate finding numbers in /resume → job stays awaiting-resume (no ResumeAction)", () => {
    const job = makeAwaitingJobWithDecisions(23);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=1 1=2", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[23, comments]]);
    const result = planResumes([job], map);

    // Duplicate finding number → invalid → no action
    expect(result).toHaveLength(0);
  });

  it("finding number out of range → no ResumeAction", () => {
    const job = makeAwaitingJobWithDecisions(24);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 5=1", "OWNER", AFTER_CUTOFF), // only 1 finding, N=5 is out of range
    ];
    const map = new Map([[24, comments]]);
    const result = planResumes([job], map);

    expect(result).toHaveLength(0);
  });

  it("option number out of range → no ResumeAction", () => {
    const job = makeAwaitingJobWithDecisions(25);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=9", "OWNER", AFTER_CUTOFF), // only 2 options, M=9 is out of range
    ];
    const map = new Map([[25, comments]]);
    const result = planResumes([job], map);

    expect(result).toHaveLength(0);
  });

  it("incomplete coverage (1 open decision, 0 selections) → treated as prose-only resume", () => {
    const job = makeAwaitingJobWithDecisions(26);
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume just prose no selections", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[26, comments]]);
    const result = planResumes([job], map);

    // Prose-only resume is always allowed
    expect(result).toHaveLength(1);
    expect(result[0]!.decisions).toBeUndefined();
    expect(result[0]!.resumePrompt).toBe("just prose no selections");
  });

  it("job with no open decisions treats N=M tokens as prose-only resume", () => {
    // No open decision-needed findings
    const job = makeJobState({
      jobId: JOB_ID,
      status: "awaiting-resume",
      issueNumber: 27,
      request: {
        path: "/specrunner/changes/my-feature/request.md",
        title: "My feature",
        type: "new-feature",
        slug: "my-feature",
      },
      resumePoint: {
        step: "spec-review",
        reason: "iterations exhausted",
        iterationsExhausted: 3,
      },
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] },
            },
          },
        ],
      },
    });
    const comments: IssueComment[] = [
      makeComment(1, ESCALATION_MARKER, "OWNER", CUTOFF_TS),
      makeComment(2, "/resume 1=2 some note", "OWNER", AFTER_CUTOFF),
    ];
    const map = new Map([[27, comments]]);
    const result = planResumes([job], map);

    // No open decisions → treated as prose resume
    expect(result).toHaveLength(1);
    expect(result[0]!.decisions).toBeUndefined();
  });
});

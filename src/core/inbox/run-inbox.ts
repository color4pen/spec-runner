/**
 * Inbox orchestrator: collects GitHub data, plans actions, executes effects.
 *
 * Dependencies are injected for testability. Default implementations delegate to
 * existing core/CLI commands (runRunCore, runResumeCore, store, github client).
 */
import type { GitHubClient } from "../port/github-client.js";
import type { JobState } from "../../state/schema.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { planInbox } from "./planner.js";
import type { InboxPlan, StartAction, RejectAction, ResumeAction, IssueComment } from "./types.js";
import { buildRejectComment } from "../notify/issue-notifier.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";
import { write as writeDraft } from "../request/store.js";

/** Effect functions injected by caller (allows mocking in tests). */
export interface InboxEffects {
  /** Write draft and start a new job from the given issue body. */
  startJob(slug: string, issueBody: string, issueNumber: number): Promise<void>;
  /** Resume an awaiting-resume job. */
  resumeJob(slug: string, resumePrompt: string | undefined): Promise<void>;
  /** Post a reject comment on an issue. */
  postRejectComment(issueNumber: number, body: string): Promise<void>;
}

/** Options for runInboxOrchestrator. */
export interface RunInboxOptions {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  repoRoot: string;
  approveLabel: string;
  maxStartsPerRun: number;
  dryRun?: boolean;
  json?: boolean;
  effects?: Partial<InboxEffects>;
}

/** Summary of one inbox run. */
export interface InboxRunSummary {
  started: Array<{ issueNumber: number; slug: string }>;
  rejected: Array<{ issueNumber: number; reason: string }>;
  resumed: Array<{ slug: string; issueNumber: number }>;
  errors: Array<{ action: string; error: string }>;
}

/**
 * Run the inbox orchestrator: collect, plan, execute.
 *
 * @returns Summary of what was done.
 */
export async function runInboxOrchestrator(opts: RunInboxOptions): Promise<InboxRunSummary> {
  const {
    githubClient,
    owner,
    repo,
    repoRoot,
    approveLabel,
    maxStartsPerRun,
    dryRun = false,
    json = false,
  } = opts;

  // ---------------------------------------------------------------------------
  // 1. Collect inputs
  // ---------------------------------------------------------------------------

  const [approvedIssues, allJobStates] = await Promise.all([
    githubClient.searchOpenIssuesByLabel(owner, repo, approveLabel),
    JobStateStore.list(repoRoot),
  ]);

  // For awaiting-resume + issue-linked jobs, fetch comments
  const awaitingWithIssue = allJobStates.filter(
    (s): s is JobState & { issueNumber: number } =>
      s.status === "awaiting-resume" && s.issueNumber != null,
  );

  const commentsByIssue = new Map<number, IssueComment[]>();
  await Promise.all(
    awaitingWithIssue.map(async (job) => {
      try {
        const comments = await githubClient.listIssueComments(owner, repo, job.issueNumber);
        commentsByIssue.set(job.issueNumber, comments);
      } catch (err) {
        stderrWrite(
          `[inbox] warn: failed to fetch comments for issue #${job.issueNumber}: ${(err as Error).message}`,
        );
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // 2. Plan
  // ---------------------------------------------------------------------------

  const plan: InboxPlan = planInbox({
    approvedIssues: approvedIssues.map((i) => ({ number: i.number, title: i.title, body: i.body })),
    jobStates: allJobStates,
    maxStarts: maxStartsPerRun,
    commentsByIssue,
  });

  // ---------------------------------------------------------------------------
  // 3. Dry-run output
  // ---------------------------------------------------------------------------

  if (dryRun) {
    if (!json) {
      stderrWrite("[inbox] dry-run: no effects will be executed.");
      stderrWrite(`[inbox] plan: ${plan.starts.length} start(s), ${plan.rejects.length} reject(s), ${plan.resumes.length} resume(s)`);
      for (const s of plan.starts) {
        stderrWrite(`  start  issue#${s.issue.number} → slug=${s.slug}`);
      }
      for (const r of plan.rejects) {
        stderrWrite(`  reject issue#${r.issue.number}: ${r.reason}`);
      }
      for (const res of plan.resumes) {
        stderrWrite(`  resume ${res.slug} (issue#${res.issueNumber})`);
      }
    }
    return {
      started: plan.starts.map((s) => ({ issueNumber: s.issue.number, slug: s.slug })),
      rejected: plan.rejects.map((r) => ({ issueNumber: r.issue.number, reason: r.reason })),
      resumed: plan.resumes.map((r) => ({ slug: r.slug, issueNumber: r.issueNumber })),
      errors: [],
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Execute effects (best-effort: each is independent)
  // ---------------------------------------------------------------------------

  const summary: InboxRunSummary = {
    started: [],
    rejected: [],
    resumed: [],
    errors: [],
  };

  const effects = buildEffects(opts);

  // Execute starts
  for (const action of plan.starts) {
    try {
      await executeStart(action, effects);
      summary.started.push({ issueNumber: action.issue.number, slug: action.slug });
      if (!json) {
        stderrWrite(`[inbox] started job slug=${action.slug} from issue#${action.issue.number}`);
      }
    } catch (err) {
      const msg = `start issue#${action.issue.number}: ${(err as Error).message}`;
      summary.errors.push({ action: `start:${action.issue.number}`, error: (err as Error).message });
      stderrWrite(`[inbox] warn: ${msg}`);
    }
  }

  // Execute rejects
  for (const action of plan.rejects) {
    try {
      const commentBody = buildRejectComment(action.issue.number, action.reason);
      await effects.postRejectComment(action.issue.number, commentBody);
      summary.rejected.push({ issueNumber: action.issue.number, reason: action.reason });
      if (!json) {
        stderrWrite(`[inbox] rejected issue#${action.issue.number}: ${action.reason}`);
      }
    } catch (err) {
      const msg = `reject issue#${action.issue.number}: ${(err as Error).message}`;
      summary.errors.push({ action: `reject:${action.issue.number}`, error: (err as Error).message });
      stderrWrite(`[inbox] warn: ${msg}`);
    }
  }

  // Execute resumes
  for (const action of plan.resumes) {
    try {
      await effects.resumeJob(action.slug, action.resumePrompt ?? undefined);
      summary.resumed.push({ slug: action.slug, issueNumber: action.issueNumber });
      if (!json) {
        stderrWrite(`[inbox] resumed job slug=${action.slug} (issue#${action.issueNumber})`);
      }
    } catch (err) {
      const msg = `resume ${action.slug}: ${(err as Error).message}`;
      summary.errors.push({ action: `resume:${action.slug}`, error: (err as Error).message });
      stderrWrite(`[inbox] warn: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. JSON output
  // ---------------------------------------------------------------------------

  if (json) {
    logResult(JSON.stringify(summary, null, 2));
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the effects object, merging injected overrides with defaults. */
function buildEffects(opts: RunInboxOptions): InboxEffects {
  const { githubClient, owner, repo, repoRoot } = opts;

  const defaultEffects: InboxEffects = {
    async startJob(slug: string, issueBody: string, issueNumber: number): Promise<void> {
      await writeDraft(repoRoot, slug, issueBody);
      const draftPath = `specrunner/drafts/${slug}/request.md`;
      const { runRunCore } = await import("../../cli/run.js");
      await runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber });
    },
    async resumeJob(slug: string, resumePrompt: string | undefined): Promise<void> {
      const { runResumeCore } = await import("../../cli/resume.js");
      await runResumeCore(slug, { cwd: repoRoot, prompt: resumePrompt });
    },
    async postRejectComment(issueNumber: number, body: string): Promise<void> {
      await githubClient.createIssueComment(owner, repo, issueNumber, body);
    },
  };

  return {
    startJob: opts.effects?.startJob ?? defaultEffects.startJob,
    resumeJob: opts.effects?.resumeJob ?? defaultEffects.resumeJob,
    postRejectComment: opts.effects?.postRejectComment ?? defaultEffects.postRejectComment,
  };
}

/** Execute a start action: delegate to effect (which writes draft and runs). */
async function executeStart(
  action: StartAction,
  effects: InboxEffects,
): Promise<void> {
  await effects.startJob(action.slug, action.issue.body, action.issue.number);
}

// executeResume and executeReject are inlined above for simplicity.
// These are not exported to keep the public surface minimal.
export type { RejectAction, ResumeAction };

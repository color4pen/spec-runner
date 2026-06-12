/**
 * Inbox orchestrator: collects GitHub data, plans actions, executes effects.
 *
 * Dependencies are injected for testability. Default implementations delegate to
 * existing core/CLI commands (runRunCore, runResumeCore, store, github client).
 */
import * as path from "node:path";
import type { GitHubClient } from "../port/github-client.js";
import type { JobState } from "../../state/schema.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { planInbox } from "./planner.js";
import type { InboxPlan, StartAction, RejectAction, ResumeAction, IssueComment } from "./types.js";
import { buildRejectComment, notifyJobTerminal } from "../notify/issue-notifier.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";
import { write as writeDraft } from "../request/store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { livenessJsonPath } from "../../util/paths.js";
import { isStaleRunning } from "../resume/safety.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { transitionJob } from "../../state/lifecycle.js";

/** Effect functions injected by caller (allows mocking in tests). */
export interface InboxEffects {
  /** Write draft and start a new job from the given issue body. */
  startJob(slug: string, issueBody: string, issueNumber: number): Promise<void>;
  /** Resume an awaiting-resume job. */
  resumeJob(slug: string, resumePrompt: string | undefined): Promise<void>;
  /** Post a reject comment on an issue. */
  postRejectComment(issueNumber: number, body: string): Promise<void>;
  /** Remove the approval label from an issue after a reject. */
  removeApprovalLabel(issueNumber: number): Promise<void>;
  /** Decide whether a running job is orphaned (process dead). */
  isStale(state: JobState): boolean;
  /** Persist a patched job state (best-effort) by jobId. */
  persistState(jobId: string, state: JobState): Promise<void>;
  /** Fire the terminal escalation notification for an awaiting-resume state. */
  notifyEscalation(state: JobState): Promise<void>;
  /** Return true if any existing job is already linked to the given issue number. */
  isIssueLinked(issueNumber: number): Promise<boolean>;
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
  recovered: Array<{ slug: string; jobId: string }>;
  escalated: Array<{ slug: string; jobId: string; issueNumber: number | null }>;
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

  // Unlinked approved issues also need comments for reject dedup
  const linkedIssueNumbers = new Set<number>(
    allJobStates.filter((s) => s.issueNumber != null).map((s) => s.issueNumber!),
  );
  const unlinkedApprovedIssues = approvedIssues.filter(
    (i) => !linkedIssueNumbers.has(i.number),
  );

  const commentsByIssue = new Map<number, IssueComment[]>();
  await Promise.all([
    ...awaitingWithIssue.map(async (job) => {
      try {
        const comments = await githubClient.listIssueComments(owner, repo, job.issueNumber);
        commentsByIssue.set(job.issueNumber, comments);
      } catch (err) {
        stderrWrite(
          `[inbox] warn: failed to fetch comments for issue #${job.issueNumber}: ${(err as Error).message}`,
        );
      }
    }),
    ...unlinkedApprovedIssues.map(async (issue) => {
      try {
        const comments = await githubClient.listIssueComments(owner, repo, issue.number);
        commentsByIssue.set(issue.number, comments);
      } catch (err) {
        stderrWrite(
          `[inbox] warn: failed to fetch comments for issue #${issue.number}: ${(err as Error).message}`,
        );
      }
    }),
  ]);

  // ---------------------------------------------------------------------------
  // 1b. Collect stale-running job IDs (before plan — effects needed here)
  // ---------------------------------------------------------------------------

  const effects = buildEffects(opts);

  const staleRunningJobIds = new Set<string>();
  for (const s of allJobStates) {
    if (s.status === "running" && effects.isStale(s)) {
      staleRunningJobIds.add(s.jobId);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Plan
  // ---------------------------------------------------------------------------

  const plan: InboxPlan = planInbox({
    approvedIssues: approvedIssues.map((i) => ({ number: i.number, title: i.title, body: i.body })),
    jobStates: allJobStates,
    maxStarts: maxStartsPerRun,
    commentsByIssue,
    staleRunningJobIds,
  });

  // ---------------------------------------------------------------------------
  // 3. Dry-run output
  // ---------------------------------------------------------------------------

  if (dryRun) {
    if (!json) {
      stderrWrite("[inbox] dry-run: no effects will be executed.");
      stderrWrite(
        `[inbox] plan: ${plan.starts.length} start(s), ${plan.rejects.length} reject(s), ${plan.resumes.length} resume(s), ${plan.recovers.length} recover(s), ${plan.escalates.length} escalate(s)`,
      );
      for (const s of plan.starts) {
        stderrWrite(`  start    issue#${s.issue.number} → slug=${s.slug}`);
      }
      for (const r of plan.rejects) {
        stderrWrite(`  reject   issue#${r.issue.number}: ${r.reason}`);
      }
      for (const res of plan.resumes) {
        stderrWrite(`  resume   ${res.slug} (issue#${res.issueNumber})`);
      }
      for (const rec of plan.recovers) {
        stderrWrite(`  recover  ${rec.slug} (attempt ${rec.staleRecovery.attempts})`);
      }
      for (const esc of plan.escalates) {
        stderrWrite(`  escalate ${esc.slug} (step=${esc.step})`);
      }
    }
    return {
      started: plan.starts.map((s) => ({ issueNumber: s.issue.number, slug: s.slug })),
      rejected: plan.rejects.map((r) => ({ issueNumber: r.issue.number, reason: r.reason })),
      resumed: plan.resumes.map((r) => ({ slug: r.slug, issueNumber: r.issueNumber })),
      recovered: plan.recovers.map((r) => ({ slug: r.slug, jobId: r.jobId })),
      escalated: plan.escalates.map((e) => ({ slug: e.slug, jobId: e.jobId, issueNumber: e.issueNumber ?? null })),
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
    recovered: [],
    escalated: [],
    errors: [],
  };

  // Execute starts
  for (const action of plan.starts) {
    try {
      if (await effects.isIssueLinked(action.issue.number)) {
        stderrWrite(
          `[inbox] skip: issue#${action.issue.number} already linked — skipping start`,
        );
        continue;
      }
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
      try {
        await effects.removeApprovalLabel(action.issue.number);
      } catch (labelErr) {
        stderrWrite(
          `[inbox] warn: failed to remove approval label from issue#${action.issue.number}: ${(labelErr as Error).message}`,
        );
      }
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

  // Execute recovers (stale-running auto-resume, independent of maxStartsPerRun)
  for (const action of plan.recovers) {
    try {
      const job = allJobStates.find((s) => s.jobId === action.jobId)!;
      const patched = { ...job, staleRecovery: action.staleRecovery, updatedAt: new Date().toISOString() };
      await effects.persistState(action.jobId, patched);
      await effects.resumeJob(action.slug, undefined);
      summary.recovered.push({ slug: action.slug, jobId: action.jobId });
      if (!json) {
        stderrWrite(`[inbox] recovered stale job slug=${action.slug} (attempt ${action.staleRecovery.attempts})`);
      }
    } catch (err) {
      summary.errors.push({ action: `recover:${action.slug}`, error: (err as Error).message });
      stderrWrite(`[inbox] warn: recover ${action.slug}: ${(err as Error).message}`);
    }
  }

  // Execute escalates (crash-loop guard — transition to awaiting-resume + notify)
  for (const action of plan.escalates) {
    try {
      const job = allJobStates.find((s) => s.jobId === action.jobId)!;
      const { state: escalated } = transitionJob(job, "awaiting-resume", {
        trigger: "stale-recovery-exhausted",
        reason: "Auto-recovery exceeded max attempts (crash loop suspected)",
        patch: {
          pid: null,
          resumePoint: {
            step: action.step,
            reason: "Auto-recovery exceeded max attempts (crash loop suspected)",
            iterationsExhausted: 0,
          },
          staleRecovery: null,
        },
      });
      await effects.persistState(action.jobId, escalated);
      await effects.notifyEscalation(escalated);
      summary.escalated.push({ slug: action.slug, jobId: action.jobId, issueNumber: action.issueNumber ?? null });
      if (!json) {
        stderrWrite(`[inbox] escalated stale job slug=${action.slug} to awaiting-resume`);
      }
    } catch (err) {
      summary.errors.push({ action: `escalate:${action.slug}`, error: (err as Error).message });
      stderrWrite(`[inbox] warn: escalate ${action.slug}: ${(err as Error).message}`);
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
    async removeApprovalLabel(issueNumber: number): Promise<void> {
      await githubClient.removeLabel(owner, repo, issueNumber, opts.approveLabel);
    },
    isStale(state: JobState): boolean {
      const slug = getJobSlug(state);
      const sidecarPath = slug ? path.join(repoRoot, livenessJsonPath(slug)) : undefined;
      return isStaleRunning(state, sidecarPath);
    },
    async persistState(jobId: string, state: JobState): Promise<void> {
      const store = await resolveStateStoreByJobId(repoRoot, jobId);
      if (store) {
        await store.persist(state);
      } else {
        stderrWrite(`[inbox] warn: persistState: no writable store found for job ${jobId} — skipping`);
      }
    },
    async notifyEscalation(state: JobState): Promise<void> {
      await notifyJobTerminal(state, { githubClient, owner, repo });
    },
    async isIssueLinked(issueNumber: number): Promise<boolean> {
      const states = await JobStateStore.list(repoRoot);
      return states.some((s) => s.issueNumber === issueNumber);
    },
  };

  return {
    startJob: opts.effects?.startJob ?? defaultEffects.startJob,
    resumeJob: opts.effects?.resumeJob ?? defaultEffects.resumeJob,
    postRejectComment: opts.effects?.postRejectComment ?? defaultEffects.postRejectComment,
    removeApprovalLabel: opts.effects?.removeApprovalLabel ?? defaultEffects.removeApprovalLabel,
    isStale: opts.effects?.isStale ?? defaultEffects.isStale,
    persistState: opts.effects?.persistState ?? defaultEffects.persistState,
    notifyEscalation: opts.effects?.notifyEscalation ?? defaultEffects.notifyEscalation,
    isIssueLinked: opts.effects?.isIssueLinked ?? defaultEffects.isIssueLinked,
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

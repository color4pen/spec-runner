/**
 * ReopenCommand: standalone lifecycle command for `job reopen`.
 *
 * Transition-only — no pipeline execution.
 * Transitions an awaiting-archive job to awaiting-resume.
 * This is an operator-scoped action (explicit --reason required) that:
 *   1. Validates the job is in awaiting-archive status
 *   2. Verifies the associated PR is still OPEN (fail-closed if unavailable)
 *   3. Appends an operator-event journal record (durable before transition)
 *   4. Transitions awaiting-archive → awaiting-resume via REOPEN_TRANSITIONS (allowReopen opt-in)
 *   5. Preserves all prior evidence (steps, reviewerStatuses, artifacts)
 *   6. Exits without starting the pipeline
 *
 * After reopen, use `job resume <slug> --from <step>` to execute the pipeline.
 *
 * Design D1: reopen is a named operator action, not a widening of resume.
 * Design D3: PR gate is fail-closed — no client or query failure → reject.
 * Design D4: transition patch clears only run-control fields (error/resumePoint/
 *   mainCheckoutDrift/pid); steps, reviewerStatuses, decisions, biteEvidence untouched.
 * Design D6: operator event is appended before the transition is persisted.
 */
import { JobStateStore } from "../../store/job-state-store.js";
import { loadStateByJobId } from "../job-access/load-by-job-id.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { logInfo, setLogLevel, logError, stderrWrite, type LogLevel } from "../../logger/stdout.js";
import { SpecRunnerError, worktreeGuardError } from "../../errors.js";
import type { JobState } from "../../state/schema.js";
import { resolveJobStateBySlug } from "../resume/resolve-job.js";
import { getJobSlug } from "../../state/job-slug.js";
import { transitionJob } from "../../state/lifecycle.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import type { GitHubClient } from "../port/github-client.js";

export interface ReopenOptions {
  /** Required: operator-supplied reason for the reopen (--reason). */
  reason: string;
  /** GitHub client for PR-state gate. null = fail-closed (no token). */
  githubClient: GitHubClient | null;
  logLevel?: LogLevel;
  cwd?: string;
  json?: boolean;
  noWorktree?: boolean;
  /** Dispatch-resolved repo root (null = outside a repo). */
  repoRoot?: string | null;
}

/**
 * Standalone command for `specrunner job reopen`.
 * execute() performs all validation and state transition without starting the pipeline.
 */
export class ReopenCommand {
  constructor(
    private readonly slug: string,
    private readonly options: ReopenOptions,
  ) {}

  async execute(): Promise<number> {
    setLogLevel(this.options.logLevel ?? "default");
    const cwd = this.options.cwd ?? process.cwd();

    // Worktree guard: reject reopen from inside a specrunner job worktree.
    {
      const wtResult = await detectSpecrunnerWorktree(cwd);
      if (wtResult.isSpecrunnerWorktree) {
        const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
        const guardErr = worktreeGuardError("job reopen", mainPath);
        logError(guardErr.message);
        stderrWrite(`Hint: ${guardErr.hint}`);
        return 2;
      }
    }

    // Resolve job state by slug, with short Job ID fallback
    let state: JobState;
    try {
      const resolved = await resolveJobStateBySlug(this.slug, cwd);
      if (resolved === null) {
        // resolveJobStateBySlug returns null for terminal-only slugs.
        // Check if this slug has any terminal jobs so we can show the right error.
        const allStates = await JobStateStore.list(cwd, { includeArchived: true });
        const terminalForSlug = allStates.filter(
          (s) => getJobSlug(s) === this.slug,
        );
        if (terminalForSlug.length > 0) {
          const terminalState = terminalForSlug.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0]!;
          logError(
            `Job '${this.slug}' has status '${terminalState.status}' and cannot be reopened. ` +
            `Only 'awaiting-archive' jobs are eligible for reopen.`,
          );
          return 1;
        }

        // Slug not found — try resolving as short Job ID prefix
        let fullId: string;
        try {
          fullId = await JobStateStore.resolveId(cwd, this.slug);
        } catch (err) {
          if (err instanceof SpecRunnerError) {
            logError(err.message);
            if (err.hint) stderrWrite(`Hint: ${err.hint}`);
          } else {
            logError((err as Error).message);
          }
          return 1;
        }
        state = (await loadStateByJobId(cwd, fullId)) as JobState;
      } else {
        state = resolved;
      }
    } catch (err) {
      logError((err as Error).message);
      return 2;
    }

    // Status gate: only awaiting-archive is reopenable
    if (state.status !== "awaiting-archive") {
      if (state.status === "archived" || state.status === "canceled") {
        logError(
          `Job '${this.slug}' has status '${state.status}' and cannot be reopened. ` +
          `Only 'awaiting-archive' jobs are eligible for reopen.`,
        );
      } else {
        logError(
          `Job '${this.slug}' has status '${state.status}', cannot reopen. ` +
          `Only jobs in 'awaiting-archive' status can be reopened.`,
        );
      }
      return 1;
    }

    // PR gate: job must have a recorded PR and the PR must be OPEN
    if (!state.pullRequest?.number) {
      logError(`Job '${this.slug}' has no recorded PR to reopen against.`);
      return 1;
    }

    // Fail-closed: no client → cannot determine PR state → reject
    if (!this.options.githubClient) {
      logError(
        `Cannot verify PR state for job '${this.slug}': no GitHub credentials available. ` +
        `Run 'specrunner login' to authenticate.`,
      );
      return 1;
    }

    let prState: string;
    try {
      const pr = await this.options.githubClient.getPullRequest(
        state.repository.owner,
        state.repository.name,
        state.pullRequest.number,
      );
      prState = pr.state;
    } catch (err) {
      logError(
        `Failed to query PR #${state.pullRequest.number} state: ${(err as Error).message}. ` +
        `Run 'specrunner login' to refresh credentials.`,
      );
      return 1;
    }

    if (prState === "MERGED") {
      logError(
        `PR #${state.pullRequest.number} has already been merged. ` +
        `Reopening a job with a merged PR is not supported.`,
      );
      return 1;
    }

    if (prState === "CLOSED") {
      logError(
        `PR #${state.pullRequest.number} is closed. ` +
        `Only jobs with an OPEN PR can be reopened.`,
      );
      return 1;
    }

    // Only OPEN PRs are allowed to proceed

    // Build the job state store (needed for appendOperatorEvent + persist).
    // D6: a durable store is required — fail-closed when sidecar is missing.
    const resolvedSlug = getJobSlug(state);
    const slug = resolvedSlug ?? this.slug;
    let store: JobStateStore;
    if (this.options.noWorktree) {
      store = new JobStateStore(state.jobId, cwd, { slug, stateRoot: cwd });
    } else {
      const resolved = await resolveStateStoreByJobId(cwd, state.jobId);
      if (resolved === null) {
        logError(
          `Cannot locate a writable state store for job '${this.slug}' (sidecar missing). ` +
          `The job state is inaccessible — reopen cannot proceed without a durable store.`,
        );
        return 1;
      }
      store = resolved;
    }

    // Append the operator event BEFORE persisting the transition (D6 durability).
    // If persist subsequently fails, the event remains as evidence.
    // Note: fromStep is omitted — step selection has moved to `resume`.
    await store.appendOperatorEvent({
      type: "operator-event",
      action: "reopen",
      reason: this.options.reason,
      ts: new Date().toISOString(),
    });

    // Transition awaiting-archive → awaiting-resume (operator-scoped opt-in)
    // D4: patch clears only run-control fields; steps/reviewerStatuses/decisions/biteEvidence untouched
    try {
      const { state: transitioned } = transitionJob(
        state,
        "awaiting-resume",
        {
          trigger: "reopen",
          reason: this.options.reason,
          patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: null },
        },
        { allowReopen: true },
      );
      await store.persist(transitioned);
    } catch (err) {
      logError(`Failed to update job state: ${(err as Error).message}`);
      return 1;
    }

    logInfo(
      `Job '${slug}' is now awaiting-resume. Run 'job resume ${slug} --from <step>' to continue.`,
    );
    return 0;
  }
}

/**
 * ReopenCommand: CommandRunner for the `job reopen` command.
 *
 * Transitions an awaiting-archive job back to running from a specified step.
 * This is an operator-scoped action (explicit --from + --reason required) that:
 *   1. Validates the job is in awaiting-archive status
 *   2. Verifies the associated PR is still OPEN (fail-closed if unavailable)
 *   3. Appends an operator-event journal record (durable before transition)
 *   4. Transitions awaiting-archive → running via REOPEN_TRANSITIONS (allowReopen opt-in)
 *   5. Preserves all prior evidence (steps, reviewerStatuses, artifacts)
 *
 * Design D1: reopen is a named operator action, not a widening of resume.
 * Design D3: PR gate is fail-closed — no client or query failure → reject.
 * Design D4: transition patch clears only run-control fields (error/resumePoint/
 *   mainCheckoutDrift/pid); steps, reviewerStatuses, decisions, biteEvidence untouched.
 * Design D6: operator event is appended before the transition is persisted.
 */
import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { loadConfig } from "../../config/store.js";
import { resolveRepoRoot } from "../../util/repo-root.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { loadStateByJobId } from "../job-access/load-by-job-id.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { logInfo, setLogLevel, logError, stderrWrite, type LogLevel } from "../../logger/stdout.js";
import { SpecRunnerError, worktreeGuardError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { parseRequestMd } from "../../parser/request-md.js";
import { resolveJobStateBySlug } from "../resume/resolve-job.js";
import { resolveRequestPath } from "../resume/resolve-request-path.js";
import { getJobSlug } from "../../state/job-slug.js";
import { resolveResumeStep, buildAllowedStepSet } from "../resume/resolve-step.js";
import { livenessJsonPath } from "../../util/paths.js";
import { transitionJob } from "../../state/lifecycle.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { EventBus } from "../event/event-bus.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import type { GitHubClient } from "../port/github-client.js";

export interface ReopenOptions {
  /** Required: pipeline step to restart from (--from). */
  from: string;
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
 * Controlled-exit error for prepare() failures.
 * exitCode 1 = logical rejection (status gate, PR gate, invalid step, etc.)
 * exitCode 2 = invocation error (inside worktree, failed job resolution)
 */
class PrepareError extends Error {
  constructor(public readonly exitCode: 1 | 2, message: string) {
    super(message);
  }
}

/**
 * CommandRunner for `specrunner job reopen`.
 * prepare() performs all validation and state transition before the pipeline runs.
 */
export class ReopenCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    events: EventBus,
    private readonly slug: string,
    private readonly options: ReopenOptions,
  ) {
    super(runtime, events);
  }

  async execute(): Promise<number> {
    // Override execute() to surface the exit code from PrepareError
    try {
      return await super.execute();
    } catch (err) {
      if (err instanceof PrepareError) {
        return err.exitCode;
      }
      throw err;
    }
  }

  protected async prepare(): Promise<PrepareResult> {
    const logLevel = this.options.logLevel ?? "default";
    setLogLevel(logLevel);
    const cwd = this.options.cwd ?? process.cwd();

    // Worktree guard: reject reopen from inside a specrunner job worktree.
    {
      const wtResult = await detectSpecrunnerWorktree(cwd);
      if (wtResult.isSpecrunnerWorktree) {
        const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
        const guardErr = worktreeGuardError("job reopen", mainPath);
        logError(guardErr.message);
        stderrWrite(`Hint: ${guardErr.hint}`);
        throw new PrepareError(2, "Cannot reopen from inside a worktree");
      }
    }

    // Resolve job state by slug, with short Job ID fallback
    let state: JobState;
    try {
      const resolved = await resolveJobStateBySlug(this.slug, cwd);
      if (resolved === null) {
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
          throw new PrepareError(1, "Job not found");
        }
        state = (await loadStateByJobId(cwd, fullId)) as JobState;
      } else {
        state = resolved;
      }
    } catch (err) {
      if (err instanceof PrepareError) throw err;
      logError((err as Error).message);
      throw new PrepareError(2, "Failed to resolve job");
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
      throw new PrepareError(1, `Cannot reopen from status '${state.status}'`);
    }

    // PR gate: job must have a recorded PR and the PR must be OPEN
    if (!state.pullRequest?.number) {
      logError(`Job '${this.slug}' has no recorded PR to reopen against.`);
      throw new PrepareError(1, "No PR recorded on job");
    }

    // Fail-closed: no client → cannot determine PR state → reject
    if (!this.options.githubClient) {
      logError(
        `Cannot verify PR state for job '${this.slug}': no GitHub credentials available. ` +
        `Run 'specrunner login' to authenticate.`,
      );
      throw new PrepareError(1, "GitHub client unavailable — run 'specrunner login'");
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
      throw new PrepareError(1, "PR state query failed — run 'specrunner login'");
    }

    if (prState === "MERGED") {
      logError(
        `PR #${state.pullRequest.number} has already been merged. ` +
        `Reopening a job with a merged PR is not supported.`,
      );
      throw new PrepareError(1, "PR is already merged");
    }

    if (prState === "CLOSED") {
      logError(
        `PR #${state.pullRequest.number} is closed. ` +
        `Only jobs with an OPEN PR can be reopened.`,
      );
      throw new PrepareError(1, "PR is closed");
    }

    // Only OPEN PRs are allowed to proceed

    // Resolve the start step from --from
    let startStep: StepName;
    try {
      const allowedSteps = buildAllowedStepSet(state.reviewers);
      startStep = resolveResumeStep(this.options.from, null, state.step, allowedSteps, state.reviewers);
    } catch (err) {
      logError((err as Error).message);
      throw new PrepareError(1, "Failed to resolve reopen step");
    }

    logInfo(`Reopening job '${this.slug}' from step '${startStep}'`);

    // Parse request.md before committing to "running" state
    const resolvedSlug = getJobSlug(state);
    const resolvedPath = resolveRequestPath(state.request.path, resolvedSlug, state.worktreePath, cwd);
    let request;
    try {
      request = await parseRequestMd(resolvedPath);
    } catch (err) {
      logError(`Failed to read request.md at '${resolvedPath}': ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to parse request.md");
    }

    // Build the job state store (needed for appendOperatorEvent + persist).
    // D6: a durable store is required — fail-closed when sidecar is missing.
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
        throw new PrepareError(1, "State store unavailable — sidecar missing");
      }
      store = resolved;
    }

    // Append the operator event BEFORE persisting the transition (D6 durability).
    // If persist subsequently fails, the event remains as evidence.
    const operatorEventTs = new Date().toISOString();
    await store.appendOperatorEvent({
      type: "operator-event",
      action: "reopen",
      reason: this.options.reason,
      fromStep: startStep,
      ts: operatorEventTs,
    });

    // Transition awaiting-archive → running (operator-scoped opt-in)
    // D4: patch clears only run-control fields; steps/reviewerStatuses/decisions/biteEvidence untouched
    let updatedState: JobState;
    try {
      const { state: transitioned } = transitionJob(
        state,
        "running",
        {
          trigger: "reopen",
          reason: this.options.reason,
          patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid },
        },
        { allowReopen: true },
      );
      await store.persist(transitioned);
      updatedState = transitioned;
    } catch (err) {
      logError(`Failed to update job state: ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to update state");
    }

    // Load config with project local overlay
    let config;
    try {
      const repoRoot = await resolveRepoRoot(cwd);
      config = await loadConfig(repoRoot ?? undefined);
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        logError(err.message);
        if (err.hint) stderrWrite(`Hint: ${err.hint}`);
      } else {
        logError((err as Error).message);
      }
      throw new PrepareError(1, "Failed to load config");
    }

    // Resolve existing worktree path (mirror resume.ts logic)
    let resolvedWorktreePath: string | null = updatedState.worktreePath ?? null;
    if (!resolvedWorktreePath && resolvedSlug) {
      try {
        const sidecarAbsPath = nodePath.join(cwd, livenessJsonPath(resolvedSlug));
        const raw = await nodeFs.readFile(sidecarAbsPath, "utf-8");
        const sidecar = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof sidecar["worktreePath"] === "string" &&
          sidecar["jobId"] === updatedState.jobId
        ) {
          resolvedWorktreePath = sidecar["worktreePath"];
        }
      } catch {
        // No sidecar or mismatch — will create a new worktree on resume
      }
    }

    return {
      jobState: updatedState,
      startStep,
      request,
      config,
      slug: this.slug,
      logLevel,
      repoRoot: cwd,
      workspaceOpts: {
        existingWorktreePath: resolvedWorktreePath,
        baseBranch: request.baseBranch,
        bootstrapState: updatedState,
        noWorktree: this.options.noWorktree,
      },
      // Reopen is not a resume — no interrupted context to restore
      resumeContext: undefined,
      resumePrompt: undefined,
      json: this.options.json ?? false,
    };
  }
}

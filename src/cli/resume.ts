import * as fs from "node:fs/promises";
import { createAnthropicClient } from "../sdk/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { loadConfig } from "../config/store.js";
import { loadJobState, updateJobState } from "../state/store.js";
import { logInfo, setVerbose } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";
import type { JobState, StepName } from "../state/schema.js";
import type { ParsedRequest } from "../parser/request-md.js";
import { parseRequestMd } from "../parser/request-md.js";
import { EventBus } from "../core/event/event-bus.js";
import { ProgressDisplay } from "./progress.js";
import { createWorktreeManager } from "../core/worktree/manager.js";
import { createStandardPipeline } from "../core/pipeline/index.js";
import { handlePostPipelineState } from "./run.js";
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { resolveResumeStep } from "../core/resume/resolve-step.js";
import { checkConsecutiveEscalations, checkStaleState } from "../core/resume/safety.js";

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  verbose?: boolean;
  cwd?: string;
}

/**
 * Output error from a thrown pipeline exception to stderr.
 */
function outputPipelineThrowError(err: unknown): void {
  if (err instanceof SpecRunnerError) {
    process.stderr.write(`Error: ${err.message}\n`);
    if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
  } else {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
  }
}

/**
 * Run the specrunner resume command.
 * Returns the determined exit code (0 = success, 1 = failure, 2 = argument error).
 * Separated from process.exit to make it testable.
 */
export async function runResumeCore(
  slug: string,
  options: ResumeOptions,
): Promise<number> {
  setVerbose(options.verbose ?? false);
  const cwd = options.cwd ?? process.cwd();

  // Task 2.2: Resolve job state by slug
  let state: JobState;
  try {
    const resolved = await resolveJobStateBySlug(slug);
    if (resolved === null) {
      process.stderr.write(
        `Error: No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.\n`,
      );
      return 2;
    }
    state = resolved;
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 2;
  }

  // Task 2.3: Status gate
  // "running" is always rejected (double-execution prevention)
  if (state.status === "running") {
    process.stderr.write(
      `Error: Job '${slug}' is currently running. Cannot resume a running job.\n`,
    );
    return 1;
  }

  if (state.status !== "awaiting-resume") {
    if (!options.force) {
      process.stderr.write(
        `Error: Job '${slug}' has status '${state.status}', not 'awaiting-resume'. Use --force to override.\n`,
      );
      return 1;
    }
  }

  // Task 2.4: Safety checks
  const resumePoint = state.resumePoint ?? null;
  const startStepForCheck = resumePoint?.step ?? (state.step as StepName | undefined);

  if (startStepForCheck) {
    const hasConsecutiveEscalations = checkConsecutiveEscalations(
      state,
      startStepForCheck,
    );
    if (hasConsecutiveEscalations && !options.force) {
      process.stderr.write(
        `Error: Step '${startStepForCheck}' has escalated 3 consecutive times. Use --force to override.\n`,
      );
      return 1;
    }
  }

  if (checkStaleState(state)) {
    process.stderr.write(
      `Warning: Job '${slug}' was last updated more than 24 hours ago. The branch may have drifted.\n`,
    );
  }

  // Task 2.5: resumePoint guard + resume step resolution
  if (resumePoint === null && options.from === undefined) {
    process.stderr.write(
      `Error: 再開位置が不明です。\`--from\` で再開 step を指定してください\n`,
    );
    return 1;
  }

  // Determine fallback step for phase inference when resumePoint is null
  const fallbackStep = resumePoint === null ? state.step : undefined;

  let startStep: StepName;
  try {
    startStep = resolveResumeStep(options.from, resumePoint, fallbackStep);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  logInfo(`Resuming job '${slug}' from step '${startStep}'`);

  // Parse request.md before committing to "running" state.
  // All pipeline steps use deps.request.content and deps.request.enabled.
  // Parsing early ensures a missing/corrupt request.md fails gracefully
  // without leaving the job stuck in "running".
  let request: ParsedRequest;
  try {
    request = await parseRequestMd(state.request.path);
  } catch (err) {
    process.stderr.write(
      `Error: Failed to read request.md at '${state.request.path}': ${(err as Error).message}\n`,
    );
    return 1;
  }

  // Task 2.6: State preparation
  let updatedState: JobState = {
    ...state,
    status: "running",
    error: null,
    resumePoint: null,
    updatedAt: new Date().toISOString(),
  };

  // Persist the updated state
  try {
    updatedState = await updateJobState(state.jobId, () => updatedState);
  } catch (err) {
    process.stderr.write(`Error: Failed to update job state: ${(err as Error).message}\n`);
    return 1;
  }

  // Task 2.8: Build PipelineDeps (config and clients)
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig();
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");

  let client: ReturnType<typeof createAnthropicSessionClient> | undefined;
  if (config.runtime !== "local") {
    const anthropicClient = createAnthropicClient(config.anthropic.apiKey);
    client = createAnthropicSessionClient(anthropicClient);
  }

  // repo is taken from state.repository (no git remote re-detection needed)
  const repo = {
    owner: state.repository.owner,
    name: state.repository.name,
  };

  // Set up EventBus and ProgressDisplay
  const events = new EventBus();
  new ProgressDisplay(events, { verbose: options.verbose ?? false, slug });

  // Task 2.7: Worktree management (local runtime only)
  // pipelineCwd is updated inside the local block; deps is built once below.
  let pipelineCwd = cwd;
  const manager = createWorktreeManager();

  let cleanupWorktreeOnFailure: (() => Promise<void>) | undefined;
  let signalCleanup: (() => Promise<void>) | undefined;

  if (config.runtime === "local") {
    // Check if existing worktree is still on disk
    const existingWorktreePath = updatedState.worktreePath;

    if (existingWorktreePath) {
      // Check if it exists on disk
      let worktreeExists = false;
      try {
        await fs.access(existingWorktreePath);
        worktreeExists = true;
      } catch {
        worktreeExists = false;
      }

      if (worktreeExists) {
        // Reuse existing worktree
        pipelineCwd = existingWorktreePath;
        logInfo(`Reusing existing worktree at: ${existingWorktreePath}`);
      } else {
        // Worktree was deleted — create a new one
        logInfo(`Worktree not found at ${existingWorktreePath}, creating new one`);
        let newWorktreePath: string;
        try {
          newWorktreePath = await manager.create(cwd, slug, updatedState.jobId);
        } catch (err) {
          process.stderr.write(`Error: Failed to create worktree: ${(err as Error).message}\n`);
          return 1;
        }
        // Update state with new worktree path
        updatedState = await updateJobState(updatedState.jobId, (s) => ({
          ...s,
          worktreePath: newWorktreePath,
        }));
        pipelineCwd = newWorktreePath;
      }
    } else {
      // No worktree recorded — create new one
      logInfo(`No worktree recorded, creating new one`);
      let newWorktreePath: string;
      try {
        newWorktreePath = await manager.create(cwd, slug, updatedState.jobId);
      } catch (err) {
        process.stderr.write(`Error: Failed to create worktree: ${(err as Error).message}\n`);
        return 1;
      }
      updatedState = await updateJobState(updatedState.jobId, (s) => ({
        ...s,
        worktreePath: newWorktreePath,
      }));
      pipelineCwd = newWorktreePath;
    }

    // Best-effort cleanup for failure paths
    cleanupWorktreeOnFailure = async (): Promise<void> => {
      try {
        const currentState = await loadJobState(updatedState.jobId);
        if (currentState?.status === "awaiting-resume") return;
      } catch { /* proceed with cleanup */ }
      try {
        const worktreeToClean = updatedState.worktreePath;
        if (worktreeToClean) {
          await manager.remove(worktreeToClean, cwd);
          await manager.prune(cwd);
          await updateJobState(updatedState.jobId, (s) => ({
            ...s,
            worktreePath: null,
          }));
        }
      } catch {
        // Best-effort
      }
    };

    // Signal handler
    signalCleanup = async (): Promise<void> => {
      try {
        await updateJobState(updatedState.jobId, (s) => ({
          ...s,
          status: "awaiting-resume" as const,
          resumePoint: {
            step: startStep,
            reason: "Interrupted by signal",
            iterationsExhausted: 0,
          },
          updatedAt: new Date().toISOString(),
        }));
      } catch {
        // Best-effort
      }
      process.exit(130);
    };
    process.on("SIGINT", signalCleanup);
    process.on("SIGTERM", signalCleanup);
  }

  // Task 2.9: Build PipelineDeps — single construction point (after pipelineCwd is set)
  const deps = {
    client,
    config,
    repo,
    request,
    slug,
    githubClient,
    cwd: pipelineCwd,
  };

  // Task 2.9: Pipeline execution via createStandardPipeline
  let finalState: JobState;
  try {
    const pipeline = createStandardPipeline(deps, events);
    finalState = await pipeline.run(startStep, updatedState, deps);
  } catch (err) {
    await cleanupWorktreeOnFailure?.();
    if (signalCleanup) {
      process.off("SIGINT", signalCleanup);
      process.off("SIGTERM", signalCleanup);
    }
    outputPipelineThrowError(err);
    return 1;
  }

  if (signalCleanup) {
    process.off("SIGINT", signalCleanup);
    process.off("SIGTERM", signalCleanup);
  }

  // Task 2.10: Post-pipeline processing
  return handlePostPipelineState(finalState, slug, cleanupWorktreeOnFailure);
}

/**
 * Run the specrunner resume command (entry point — calls process.exit).
 */
export async function runResume(
  slug: string,
  options: ResumeOptions,
): Promise<void> {
  const exitCode = await runResumeCore(slug, options);
  process.exit(exitCode);
}

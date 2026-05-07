/**
 * Core logic for `specrunner rm` command.
 *
 * Design:
 * - D1: Status gate (failed/terminated/archived allowed; running/awaiting-merge rejected unless --force)
 * - D2: deleteSession is NOT part of SessionClient port; runner receives a minimal client directly
 * - D3: deleteJobState in store.ts
 * - D4: --all-terminated prompts y/N unless --yes (non-TTY requires --yes)
 * - D6: session deletion is best-effort; API errors print warning and continue
 */
import { loadJobState, listJobStates, deleteJobState } from "../../state/store.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

/**
 * Minimal structural interface for Anthropic session deletion.
 * Avoids importing @anthropic-ai/sdk in core/; adapter passes a compatible client.
 */
export interface SessionDeleteClient {
  beta: {
    sessions: {
      delete(sessionId: string): Promise<unknown>;
    };
  };
}
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

export interface RmResult {
  exitCode: 0 | 1 | 2;
  removed: number;
  message?: string;
  /** Warning messages to be written to stderr by the caller. */
  warnings?: string[];
  /** Informational progress messages to be written to stdout by the caller. */
  info?: string[];
}

const ALLOWED_STATUSES = new Set(["failed", "terminated", "archived"]);

/**
 * Best-effort session cleanup for managed mode.
 * Returns a warning string on failure instead of writing to stderr directly.
 * Does NOT throw.
 */
async function cleanupSession(
  anthropicClient: SessionDeleteClient,
  sessionId: string,
): Promise<string | null> {
  try {
    await anthropicClient.beta.sessions.delete(sessionId);
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Warning: failed to delete cloud session ${sessionId}: ${msg}`;
  }
}

/**
 * Remove a single job.
 * - Status gate applied unless --force
 * - managed mode: best-effort session cleanup before state file deletion
 */
export async function removeSingleJob(opts: {
  jobId: string;
  force: boolean;
  config: SpecRunnerConfig;
  anthropicClient?: SessionDeleteClient;
}): Promise<RmResult> {
  const { jobId, force, config, anthropicClient } = opts;
  const warnings: string[] = [];

  // Load state — throws JOB_NOT_FOUND if missing
  let state;
  try {
    state = await loadJobState(jobId);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FOUND) {
      return { exitCode: 1, removed: 0, message: `Job not found: ${jobId}` };
    }
    throw err;
  }

  // Status gate
  if (!force && !ALLOWED_STATUSES.has(state.status)) {
    let message: string;
    if (state.status === "running") {
      message = "Job is still running. Use --force to override.";
    } else if (state.status === "awaiting-merge") {
      message = "Job has a pending PR. Use 'specrunner finish' or --force.";
    } else {
      message = `Cannot remove job with status '${state.status}'. Use --force to override.`;
    }
    return { exitCode: 1, removed: 0, message };
  }

  // Warn on --force for running jobs (D1 risk note)
  if (force && state.status === "running") {
    warnings.push(`Warning: removing a running job may break the active pipeline.`);
  }

  // Managed mode: best-effort session cleanup
  if (config.runtime !== "local" && anthropicClient && state.session?.id) {
    const warning = await cleanupSession(anthropicClient, state.session.id);
    if (warning) warnings.push(warning);
  }

  // Delete state file
  await deleteJobState(jobId);

  return {
    exitCode: 0,
    removed: 1,
    message: `Removed job ${jobId}`,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Remove all jobs with terminal status (failed / terminated / archived).
 * - Prompts for confirmation unless --yes
 * - Non-TTY without --yes is rejected
 * - managed mode: best-effort session cleanup per job
 */
export async function removeAllTerminated(opts: {
  yes: boolean;
  config: SpecRunnerConfig;
  anthropicClient?: SessionDeleteClient;
  stdin?: NodeJS.ReadableStream;
}): Promise<RmResult> {
  const { yes, config, anthropicClient, stdin: stdinOverride } = opts;

  const allStates = await listJobStates();
  const targets = allStates.filter((s) => ALLOWED_STATUSES.has(s.status));

  if (targets.length === 0) {
    return { exitCode: 0, removed: 0, message: "No terminated jobs to remove." };
  }

  const infoMessages: string[] = [];
  infoMessages.push(`Found ${targets.length} terminated job(s) to remove.`);

  if (!yes) {
    // Non-TTY without --yes: reject
    const stdinStream = stdinOverride ?? process.stdin;
    const isTTY = (stdinStream as NodeJS.ReadStream).isTTY ?? false;
    if (!isTTY) {
      return {
        exitCode: 1,
        removed: 0,
        message: "Non-interactive mode requires --yes to bulk-delete jobs.",
      };
    }

    // Prompt
    const confirmed = await promptConfirm(stdinStream, "Remove all? [y/N] ");
    if (!confirmed) {
      return { exitCode: 0, removed: 0, message: "Aborted.", info: infoMessages };
    }
  }

  let removed = 0;
  let hasErrors = false;
  const warnings: string[] = [];

  for (const state of targets) {
    try {
      // Managed mode: best-effort session cleanup
      if (config.runtime !== "local" && anthropicClient && state.session?.id) {
        const warning = await cleanupSession(anthropicClient, state.session.id);
        if (warning) warnings.push(warning);
      }
      await deleteJobState(state.jobId);
      removed++;
    } catch (err: unknown) {
      hasErrors = true;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to remove ${state.jobId}: ${msg}`);
    }
  }

  infoMessages.push(`Removed ${removed} job(s).`);

  return {
    exitCode: hasErrors ? 1 : 0,
    removed,
    info: infoMessages,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Read one line from stream and return true if answer is 'y' or 'Y'.
 */
function promptConfirm(stream: NodeJS.ReadableStream, prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    let answer = "";
    const onData = (chunk: Buffer | string) => {
      answer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const newlineIdx = answer.indexOf("\n");
      if (newlineIdx !== -1) {
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        const line = answer.slice(0, newlineIdx).trim();
        resolve(line === "y" || line === "Y");
      }
    };
    const onEnd = () => {
      stream.removeListener("data", onData);
      const line = answer.trim();
      resolve(line === "y" || line === "Y");
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
  });
}

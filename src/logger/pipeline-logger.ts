/**
 * PipelineLogger: EventBus subscriber that writes pipeline events to a JSONL log file.
 *
 * Design D1 (cli-log-persistence): mirrors ProgressDisplay pattern but for file output.
 * Both subscribe the same EventBus independently (fan-out).
 *
 * File format: one JSON object per line, { ts: ISO8601, type: string, ...payload }.
 * Write mode: append (0o600), so resume runs accumulate into the same file.
 * Sensitive values are masked via maskSensitive() before writing (MUST).
 *
 * Error resilience: on writeSync failure, fd is closed and further writes are no-op.
 * Pipeline execution must never be blocked by log write errors.
 *
 * Module-level state (initPipelineLog / logPipelineEvent / closePipelineLog) is
 * provided for deterministic commands (finish / cancel) that do not use EventBus.
 */
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import { getVerboseLogDir, getVerboseLogPath } from "../util/xdg.js";
import { maskSensitive } from "./stdout.js";
import type { EventBus } from "../core/event/event-bus.js";

// ---------------------------------------------------------------------------
// PipelineLogger class
// ---------------------------------------------------------------------------

export class PipelineLogger {
  private fd: number | null;

  constructor(logPath: string) {
    try {
      this.fd = openSync(logPath, "a", 0o600);
    } catch {
      this.fd = null;
    }
  }

  /**
   * Write a single log entry as a JSONL line.
   * { ts, type, ...entry } is serialized, sensitive values masked, and written via writeSync.
   * On write failure, fd is closed and further calls become no-op.
   */
  write(entry: Record<string, unknown>): void {
    if (this.fd === null) return;
    const fd = this.fd;
    try {
      const line = maskSensitive(JSON.stringify({ ts: new Date().toISOString(), ...entry })) + "\n";
      writeSync(fd, line);
    } catch {
      // Write failure — disable further writes
      try { closeSync(fd); } catch { /* ignore close error */ }
      this.fd = null;
    }
  }

  /**
   * Subscribe to EventBus events and write each as a JSONL entry.
   * Subscribed events: step:start / step:complete / step:error / verdict:parsed /
   *   pipeline:start / pipeline:complete / pipeline:fail / pipeline:iteration:start /
   *   pipeline:iteration:verdict / pipeline:iteration:exhausted / pipeline:summary /
   *   pipeline:cli-step
   */
  subscribe(events: EventBus): void {
    events.on("pipeline:start", ({ state }) => {
      this.write({
        type: "pipeline:start",
        jobId: state.jobId,
        status: state.status,
        step: state.step,
      });
    });

    events.on("step:start", ({ step, state }) => {
      this.write({
        type: "step:start",
        step,
        jobId: state.jobId,
        status: state.status,
      });
    });

    events.on("step:complete", ({ step, state }) => {
      const stepResults = state.steps?.[step];
      const lastRun = stepResults?.[stepResults.length - 1];
      this.write({
        type: "step:complete",
        step,
        jobId: state.jobId,
        status: state.status,
        verdict: lastRun?.outcome?.verdict ?? null,
        elapsed: lastRun?.endedAt && lastRun?.startedAt
          ? new Date(lastRun.endedAt).getTime() - new Date(lastRun.startedAt).getTime()
          : null,
      });
    });

    events.on("step:error", ({ step, error, state }) => {
      const errWithCode = error as Error & { code?: string; hint?: string };
      this.write({
        type: "step:error",
        step,
        jobId: state.jobId,
        error: errWithCode.message,
        code: errWithCode.code ?? null,
        hint: errWithCode.hint ?? null,
      });
    });

    events.on("verdict:parsed", ({ step, outcome }) => {
      this.write({
        type: "verdict:parsed",
        step,
        verdict: outcome.verdict,
      });
    });

    events.on("pipeline:complete", ({ state }) => {
      this.write({
        type: "pipeline:complete",
        jobId: state.jobId,
        status: state.status,
        branch: state.branch,
        pullRequestUrl: state.pullRequest?.url ?? null,
      });
    });

    events.on("pipeline:fail", ({ state, reason }) => {
      this.write({
        type: "pipeline:fail",
        jobId: state.jobId,
        status: state.status,
        reason,
        error: state.error ?? null,
      });
    });

    events.on("pipeline:iteration:start", ({ step, iteration, maxIterations }) => {
      this.write({ type: "pipeline:iteration:start", step, iteration, maxIterations });
    });

    events.on("pipeline:iteration:verdict", ({ step, iteration, verdict, action }) => {
      this.write({ type: "pipeline:iteration:verdict", step, iteration, verdict, action });
    });

    events.on("pipeline:iteration:exhausted", ({ step, iteration, maxIterations }) => {
      this.write({ type: "pipeline:iteration:exhausted", step, iteration, maxIterations });
    });

    events.on("pipeline:summary", ({ step, iterations, finalVerdict }) => {
      this.write({ type: "pipeline:summary", step, iterations, finalVerdict });
    });

    events.on("pipeline:cli-step", ({ step, verdict }) => {
      this.write({ type: "pipeline:cli-step", step, verdict: verdict ?? null });
    });
  }

  /**
   * Close the file descriptor.
   * Safe to call multiple times.
   */
  close(): void {
    if (this.fd !== null) {
      const fd = this.fd;
      this.fd = null;
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level state for finish / cancel (deterministic commands)
// ---------------------------------------------------------------------------

let _activePipelineLogger: PipelineLogger | null = null;

/**
 * Initialize the pipeline log for a job.
 * Creates the log directory (recursive) and opens the log file in append mode (0o600).
 * Stores the PipelineLogger instance as module-level state for logPipelineEvent().
 *
 * Returns the PipelineLogger instance so callers can call subscribe() on it.
 * On directory creation failure, returns a no-op PipelineLogger (fd = null internally).
 */
export function initPipelineLog(repoRoot: string, jobId: string): PipelineLogger {
  const dir = getVerboseLogDir(repoRoot);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // Directory creation failed — PipelineLogger will open with null fd (no-op)
  }
  const logPath = getVerboseLogPath(repoRoot, jobId);
  const logger = new PipelineLogger(logPath);
  _activePipelineLogger = logger;
  return logger;
}

/**
 * Write a log entry to the active pipeline log (module-level).
 * No-op if initPipelineLog() has not been called.
 * Used by finish / cancel for deterministic event recording.
 */
export function logPipelineEvent(entry: Record<string, unknown>): void {
  _activePipelineLogger?.write(entry);
}

/**
 * Close the active pipeline logger and clear module-level state.
 * Safe to call when no logger is active.
 */
export function closePipelineLog(): void {
  if (_activePipelineLogger !== null) {
    _activePipelineLogger.close();
    _activePipelineLogger = null;
  }
}

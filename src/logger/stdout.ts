/**
 * Logger utilities for specrunner CLI.
 * Handles progress display, stderr logging, and automatic masking of sensitive values.
 */
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import { getVerboseLogDir, getVerboseLogPath } from "../util/xdg.js";

/** Module-level verbose flag. Set via setVerbose() at process startup. */
let verbose = false;

/** File descriptor for verbose log output. null when verbose logging is inactive. */
let logFd: number | null = null;

/** Path to the current verbose log file. null when inactive. */
let currentLogPath: string | null = null;

/**
 * Set the global verbose flag.
 * When verbose=false (default), logWarn calls are suppressed.
 * Call setVerbose(true) when --verbose flag is passed.
 */
export function setVerbose(v: boolean): void {
  verbose = v;
}

/**
 * Return current verbose state.
 */
export function isVerbose(): boolean {
  return verbose;
}

/**
 * Resolve verbose flag from CLI flag and SPECRUNNER_LOG_LEVEL env var.
 * Returns true if either source enables verbose mode.
 */
export function resolveVerboseFlag(cliFlag: boolean): boolean {
  if (cliFlag) return true;
  return process.env["SPECRUNNER_LOG_LEVEL"] === "verbose";
}

/**
 * Initialize verbose log file for a job.
 * Creates the log directory if it doesn't exist and opens the log file in append mode.
 * No-op if verbose mode is not enabled (verbose === false).
 * Errors are caught and logged to stderr — verbose log failure must not block the pipeline.
 */
export function initVerboseLog(jobId: string): void {
  if (!verbose) return;
  try {
    const dir = getVerboseLogDir();
    mkdirSync(dir, { recursive: true });
    currentLogPath = getVerboseLogPath(jobId);
    logFd = openSync(currentLogPath, "a");
  } catch (err) {
    stderrWrite(`Warning: Failed to initialize verbose log: ${(err as Error).message}`);
    logFd = null;
    currentLogPath = null;
  }
}

/**
 * Write a verbose log entry to the log file.
 * No-op if verbose log is not initialized (logFd === null).
 * On write failure, closes the fd and stops further writes (pipeline must not be blocked).
 */
export function logVerbose(component: string, message: string, data?: Record<string, unknown>): void {
  if (logFd === null) return;
  const fd = logFd;
  try {
    const entry: Record<string, unknown> = { ts: new Date().toISOString(), component, message, ...data };
    const line = maskSensitive(JSON.stringify(entry)) + "\n";
    writeSync(fd, line);
  } catch {
    // Write failure — disable further writes to avoid repeated errors
    try { closeSync(fd); } catch { /* ignore */ }
    logFd = null;
  }
}

/**
 * Close the verbose log file descriptor.
 * Safe to call multiple times or when no log is open.
 */
export function closeVerboseLog(): void {
  if (logFd !== null) {
    const fd = logFd;
    logFd = null;
    currentLogPath = null;
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * Return the path to the current verbose log file, or null if not active.
 * Useful for displaying the log path to the user after pipeline completion.
 */
export function getVerboseLogFilePath(): string | null {
  return currentLogPath;
}

const MASK_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\bgho_[A-Za-z0-9]+/g,
  /\bghp_[A-Za-z0-9]+/g,
  /\bghr_[A-Za-z0-9]+/g,
];

/**
 * Mask sensitive values (API keys, tokens) in a string.
 * Replaces the token with a safe short form.
 */
export function maskSensitive(text: string): string {
  let result = text;
  for (const pattern of MASK_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const prefix = match.slice(0, match.indexOf("_") + 1);
      return `${prefix}...`;
    });
  }
  return result;
}

/**
 * Log a progress message to stdout. Sensitive values are masked.
 */
export function logInfo(message: string): void {
  process.stdout.write(maskSensitive(message) + "\n");
}

/**
 * Log a step progress with a bullet point.
 */
export function logStep(message: string): void {
  process.stdout.write("  " + maskSensitive(message) + "\n");
}

/**
 * Log a success message to stdout.
 */
export function logSuccess(message: string): void {
  process.stdout.write("OK " + maskSensitive(message) + "\n");
}

/**
 * Log a warning message to stderr.
 * Suppressed when verbose=false (default). Use setVerbose(true) to enable.
 */
export function logWarn(message: string): void {
  if (!verbose) return;
  process.stderr.write("Warning: " + maskSensitive(message) + "\n");
}

/**
 * Log an error message to stderr.
 */
export function logError(message: string): void {
  process.stderr.write("Error: " + maskSensitive(message) + "\n");
}

/**
 * Log a debug message to stderr (only if DEBUG env is set).
 */
export function logDebug(message: string): void {
  if (process.env["DEBUG"]) {
    process.stderr.write("[debug] " + maskSensitive(message) + "\n");
  }
}

/**
 * Write raw message to stderr (for fallback/operational messages).
 */
export function stderrWrite(message: string): void {
  process.stderr.write(maskSensitive(message) + "\n");
}

/**
 * Write raw message to stdout (without newline append).
 * Used for iteration progress and pipeline summary lines.
 */
export function stdoutWrite(message: string): void {
  process.stdout.write(message);
}

/**
 * Logger utilities for specrunner CLI.
 * Handles progress display, stderr logging, and automatic masking of sensitive values.
 */
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import { getVerboseLogDir, getVerboseLogPath } from "../util/xdg.js";

// ---------------------------------------------------------------------------
// LogLevel type and ordering
// ---------------------------------------------------------------------------

export type LogLevel = "quiet" | "default" | "verbose" | "debug";

export const LEVEL_ORDER: Record<LogLevel, number> = {
  quiet: 0,
  default: 1,
  verbose: 2,
  debug: 3,
};

export interface LogLevelFlags {
  quiet?: boolean;
  verbose?: boolean;   // -v or --verbose
  debug?: boolean;     // -vv
}

/** Module-level log level. Set via setLogLevel() at process startup. */
let currentLevel: LogLevel = "default";

/** File descriptor for verbose log output. null when verbose logging is inactive. */
let logFd: number | null = null;

/** Path to the current verbose log file. null when inactive. */
let currentLogPath: string | null = null;

/**
 * Set the global log level.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Return current log level.
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Return true if the given level is enabled (currentLevel >= level in LEVEL_ORDER).
 * e.g., isLevelEnabled("verbose") returns true when currentLevel is "verbose" or "debug".
 */
export function isLevelEnabled(level: LogLevel): boolean {
  return LEVEL_ORDER[currentLevel] >= LEVEL_ORDER[level];
}

/**
 * Resolve log level from CLI flags and environment variables.
 * Priority: CLI flags > SPECRUNNER_LOG_LEVEL > DEBUG env > default
 */
export function resolveLogLevel(flags: LogLevelFlags): LogLevel {
  // CLI flags take precedence (mutually exclusive; debug > verbose > quiet)
  if (flags.debug) return "debug";
  if (flags.verbose) return "verbose";
  if (flags.quiet) return "quiet";

  // Env: SPECRUNNER_LOG_LEVEL
  const envLevel = process.env["SPECRUNNER_LOG_LEVEL"];
  if (envLevel === "quiet" || envLevel === "verbose" || envLevel === "debug") {
    return envLevel;
  }

  // Env: DEBUG (legacy alias for debug)
  if (process.env["DEBUG"]) return "debug";

  return "default";
}

/**
 * Initialize verbose log file for a job.
 * Creates the log directory if it doesn't exist and opens the log file in append mode.
 * No-op if verbose mode is not enabled (level < verbose).
 * Errors are caught and logged to stderr — verbose log failure must not block the pipeline.
 */
export function initVerboseLog(repoRoot: string, jobId: string): void {
  if (!isLevelEnabled("verbose")) return;
  try {
    const dir = getVerboseLogDir(repoRoot);
    mkdirSync(dir, { recursive: true });
    currentLogPath = getVerboseLogPath(repoRoot, jobId);
    logFd = openSync(currentLogPath, "a", 0o600);
  } catch (err) {
    stderrWrite(`Warning: Failed to initialize verbose log: ${(err as Error).message}`);
    logFd = null;
    currentLogPath = null;
  }
}

/**
 * Write a verbose log entry to the log file.
 * No-op if verbose log is not initialized (logFd === null) or level < verbose.
 * On write failure, closes the fd and stops further writes (pipeline must not be blocked).
 */
export function logVerbose(component: string, message: string, data?: Record<string, unknown>): void {
  if (logFd === null) return;
  if (!isLevelEnabled("verbose")) return;
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
 * Log a progress message to stderr.
 * Suppressed at quiet level.
 */
export function logInfo(message: string): void {
  if (!isLevelEnabled("default")) return;
  process.stderr.write(maskSensitive(message) + "\n");
}

/**
 * Log a step progress with a bullet point.
 * Suppressed at quiet level.
 */
export function logStep(message: string): void {
  if (!isLevelEnabled("default")) return;
  process.stderr.write("  " + maskSensitive(message) + "\n");
}

/**
 * Log a success message to stderr.
 * Suppressed at quiet level.
 */
export function logSuccess(message: string): void {
  if (!isLevelEnabled("default")) return;
  process.stderr.write("OK " + maskSensitive(message) + "\n");
}

/**
 * Log a warning message to stderr.
 * Output at default level and above (quiet suppresses it).
 */
export function logWarn(message: string): void {
  if (!isLevelEnabled("default")) return;
  process.stderr.write("Warning: " + maskSensitive(message) + "\n");
}

/**
 * Log an error message to stderr. Always output regardless of log level.
 */
export function logError(message: string): void {
  process.stderr.write("Error: " + maskSensitive(message) + "\n");
}

/**
 * Log a debug message to stderr. Only output at debug level.
 */
export function logDebug(message: string): void {
  if (!isLevelEnabled("debug")) return;
  process.stderr.write("[debug] " + maskSensitive(message) + "\n");
}

/**
 * Write raw message to stderr (for fallback/operational messages).
 */
export function stderrWrite(message: string): void {
  process.stderr.write(maskSensitive(message) + "\n");
}

/**
 * Write raw message to stdout (without newline append).
 * Sensitive values are masked before output.
 */
export function stdoutWrite(message: string): void {
  process.stdout.write(maskSensitive(message));
}

/**
 * Write a result line to stdout (with newline append).
 * Used for program result data (PR URL, job ID, table output, etc.)
 * that should be pipe-safe. Sensitive values are masked.
 */
export function logResult(message: string): void {
  process.stdout.write(maskSensitive(message) + "\n");
}

/**
 * Logger utilities for specrunner CLI.
 * Handles progress display, stderr logging, and automatic masking of sensitive values.
 */

/** Module-level verbose flag. Set via setVerbose() at process startup. */
let verbose = false;

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

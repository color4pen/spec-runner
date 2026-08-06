/**
 * Operational guidance text for foreground run / resume.
 *
 * When a pipeline is started in foreground mode (no --detach), we emit a
 * one-time notice on stderr reminding the caller how to use --detach and
 * `job wait` for long-running sessions.  This is the output-face injection
 * described in design.md § D8.
 *
 * Text is defined as a single constant so tests can pin it with a string-
 * contains assertion without coupling to prose changes.
 */

import { isDetachedChild } from "./detach.js";
import { logInfo } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// FOREGROUND_NOTICE
// ---------------------------------------------------------------------------

/**
 * Notice emitted to stderr when a pipeline starts in foreground mode.
 *
 * Must contain both `--detach` and `job wait` so that TC-019 / TC-026 can
 * assert on the content without coupling to exact wording.
 */
export const FOREGROUND_NOTICE =
  "Note: This pipeline may run for 1-2 hours. " +
  "When starting from an LLM agent session (e.g. Claude Code), " +
  "use --detach to prevent SIGTERM from the idle-timeout harness, " +
  "then track progress with: specrunner job wait <slug>";

// ---------------------------------------------------------------------------
// emitForegroundNotice
// ---------------------------------------------------------------------------

/**
 * Emit the foreground notice to stderr (via logInfo, which respects --quiet).
 *
 * Skipped entirely when running as a detach child (SPECRUNNER_DETACHED is
 * set) to avoid duplicate output in the child's log.
 *
 * @param env  Environment to check for the detach marker.
 *             Pass `process.env` in production; pass a stub in tests.
 */
export function emitForegroundNotice(env: Record<string, string | undefined>): void {
  if (isDetachedChild(env)) return;
  logInfo(FOREGROUND_NOTICE);
}

import { stderrWrite, isLevelEnabled } from "../../logger/stdout.js";
import { getDebugSubsystems } from "../../util/env-filter.js";

/**
 * Pipeline diagnostic logger.
 *
 * Activated by setting SPECRUNNER_DEBUG=pipeline (comma-separated, other values ignored).
 * Requires debug log level to be enabled — zero overhead when disabled.
 * The log level check and env var check are orthogonal axes.
 */
export function logPipelineDiag(point: string, detail?: string): void {
  // debug level must be enabled
  if (!isLevelEnabled("debug")) return;

  // subsystem filter: SPECRUNNER_DEBUG must include "pipeline"
  const debugEnv = getDebugSubsystems();
  const parts = debugEnv.split(",").map((s) => s.trim());
  if (!parts.includes("pipeline")) return;

  const ts = new Date().toISOString();
  const line =
    detail !== undefined
      ? `[pipeline-diag ${ts}] ${point}: ${detail}`
      : `[pipeline-diag ${ts}] ${point}`;
  stderrWrite(line);
}

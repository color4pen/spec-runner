/**
 * Pipeline diagnostic logger.
 *
 * Activated by setting SPECRUNNER_DEBUG=pipeline (comma-separated, other values ignored).
 * Zero overhead when disabled — the env var check is the only cost per call.
 */
export function logPipelineDiag(point: string, detail?: string): void {
  const debugEnv = process.env["SPECRUNNER_DEBUG"] ?? "";
  const parts = debugEnv.split(",").map((s) => s.trim());
  if (!parts.includes("pipeline")) return;

  const ts = new Date().toISOString();
  const line =
    detail !== undefined
      ? `[pipeline-diag ${ts}] ${point}: ${detail}\n`
      : `[pipeline-diag ${ts}] ${point}\n`;
  process.stderr.write(line);
}

/**
 * Derive pipeline usage entries from job state and write to usage.json.
 *
 * T-10: Usage is now appended per-step (in executor.ts) before each step commit.
 * This function is a no-op to preserve the call site in archive orchestrator.
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "./types.js";

export interface DeriveUsageResult {
  ok: boolean;
  skipped: boolean;
  message: string;
}

/**
 * No-op: usage entries are written per-step in executor.ts (T-10).
 * Preserved as a call site so archive orchestrator does not need updating.
 */
export async function deriveAndWriteUsage(_params: {
  jobId: string;
  slug: string;
  cwd: string;
  repoRoot: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<DeriveUsageResult> {
  return { ok: true, skipped: true, message: "Usage written per-step; batch derivation disabled." };
}

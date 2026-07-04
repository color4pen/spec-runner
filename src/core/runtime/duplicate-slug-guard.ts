/**
 * duplicate-slug-guard: pre-run guard that rejects a second run while a live job
 * already holds the same slug.
 *
 * Design D4: reads liveness sidecar; if pid is alive → throw DUPLICATE_LIVE_JOB.
 * stale (dead pid), absent, or corrupted sidecar → return (allow run).
 *
 * Imports are limited to:
 *   node:fs/promises, node:path, src/util/paths.ts,
 *   src/core/resume/safety.ts, src/errors.ts
 */
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { livenessJsonPath } from "../../util/paths.js";
import { isProcessAlive } from "../resume/safety.js";
import { duplicateLiveJobError } from "../../errors.js";

export interface DuplicateLiveJobDeps {
  readFile?: (absPath: string) => Promise<string>;
  isAlive?: (pid: number) => boolean;
}

/**
 * Check whether a live job already holds `slug` on this machine.
 *
 * Reads `.specrunner/local/<slug>/liveness.json` from `repoRoot`.
 * If the recorded `pid` is alive, throws DUPLICATE_LIVE_JOB with an actionable
 * error message that includes the prior jobId and instructions to cancel or wait.
 *
 * Permissive cases (return without throwing):
 *  1. sidecar file is absent or unreadable
 *  2. JSON is corrupted
 *  3. `pid` field is missing or not a number
 *  4. `pid` is dead (stale sidecar)
 *
 * @param repoRoot - absolute path to the repository root
 * @param slug     - job slug (matches liveness sidecar directory name)
 * @param deps     - injectable fs/pid deps for testing (defaults to real fs + isProcessAlive)
 */
export async function checkDuplicateLiveJob(
  repoRoot: string,
  slug: string,
  deps?: DuplicateLiveJobDeps,
): Promise<void> {
  const readFile = deps?.readFile ?? ((p: string) => fsPromises.readFile(p, "utf-8"));
  const isAlive = deps?.isAlive ?? isProcessAlive;

  const sidecarPath = path.join(repoRoot, livenessJsonPath(slug));

  // Step 1: read sidecar; absent/unreadable → allow
  let raw: string;
  try {
    raw = await readFile(sidecarPath);
  } catch {
    return;
  }

  // Step 2: parse JSON; corrupted or non-object → allow
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }
    data = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  // Step 3: pid must be a number; otherwise → allow
  const pid = data["pid"];
  if (typeof pid !== "number") {
    return;
  }

  // Step 4: pid must be alive; stale → allow
  if (!isAlive(pid)) {
    return;
  }

  // Step 5: live pid → reject
  const jobId = typeof data["jobId"] === "string" ? (data["jobId"] as string) : null;
  throw duplicateLiveJobError(slug, jobId);
}

/**
 * attach orchestrator — fetch → read → verify sequence for `job attach --branch`.
 *
 * This orchestrator owns the "read and verify" phase of attach. Its only side
 * effect is `git fetch origin <branch>` (updates the remote-tracking ref).
 * Worktree creation and sidecar writing are NOT done here — they are done by
 * the CLI caller (attach.ts) after this function returns a VerifiedCheckpoint.
 *
 * ADR-20260715 D7: fetch → readCheckpointFromRef → verifyCheckpoint.
 */
import type { SpawnFn } from "../../util/spawn.js";
import { readCheckpointFromRef } from "../../git/checkpoint-ref.js";
import { verifyCheckpoint } from "./verify-checkpoint.js";
import { attachFetchFailedError } from "../../errors.js";
import type { VerifiedCheckpoint } from "./verify-checkpoint.js";

// ---------------------------------------------------------------------------
// runAttachVerification
// ---------------------------------------------------------------------------

export interface AttachVerificationInput {
  /** Repository root working directory. */
  cwd: string;
  /** Branch name to fetch and verify (without "origin/" prefix). */
  branch: string;
  /** Spawn function (transport-auth-wrapped for authentication). */
  spawnFn: SpawnFn;
  /** Expected repository identity (owner + name). */
  expectedRepo: { owner: string; name: string };
}

/**
 * Fetch origin/<branch>, read the branch-borne checkpoint, and verify its
 * self-consistency. Returns a VerifiedCheckpoint on success.
 *
 * Throws:
 * - ATTACH_FETCH_FAILED  — git fetch origin <branch> failed
 * - CHECKPOINT_NOT_FOUND — no (or ambiguous) active change folder in the ref tree
 * - CHECKPOINT_NOT_ATTACHABLE — self-consistency violation (any of (a)-(e))
 *
 * This function creates NO job state, worktree, or sidecar.
 */
export async function runAttachVerification(
  input: AttachVerificationInput,
): Promise<VerifiedCheckpoint> {
  const { cwd, branch, spawnFn, expectedRepo } = input;

  // Fetch the remote-tracking ref so object store has the latest checkpoint
  const fetchResult = await spawnFn("git", ["fetch", "origin", branch], { cwd });
  if (fetchResult.exitCode !== 0) {
    throw attachFetchFailedError(
      branch,
      `exit ${fetchResult.exitCode}: ${fetchResult.stderr.trim()}`,
    );
  }

  // Read checkpoint from the now-updated remote-tracking ref
  const ref = `origin/${branch}`;
  const { slug, stateJson, eventsJsonl, treeFiles } = await readCheckpointFromRef(
    spawnFn,
    cwd,
    ref,
  );

  // Verify self-consistency (pure predicate — no I/O side effects)
  return verifyCheckpoint({ slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo });
}

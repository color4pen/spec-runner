/**
 * attach orchestrator — fetch → read → verify sequence for `job attach --branch`.
 *
 * This orchestrator owns the "read and verify" phase of attach. Its only side
 * effect is `git fetch origin <branch>` (updates the remote-tracking ref).
 * Worktree creation and sidecar writing are NOT done here — they are done by
 * the CLI caller (attach.ts) after this function returns a VerifiedCheckpoint.
 *
 * Design D1–D2 (remote-checkpoint-publish-attach-closure/design.md):
 *   fetch → rev-parse OID (once) → readCheckpointFromRef(OID) → verifyCheckpoint(OID).
 * The resolved OID is used for all subsequent operations so symbolic origin/<branch>
 * is never re-evaluated after this point.
 */
import type { SpawnFn } from "../../util/spawn.js";
import { readCheckpointFromRef } from "../../git/checkpoint-ref.js";
import { verifyCheckpoint } from "./verify-checkpoint.js";
import { attachFetchFailedError, checkpointNotFoundError, checkpointNotAttachableError } from "../../errors.js";
import { readEvidenceAnchor } from "../../git/evidence-anchor-ref.js";
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

  // D1: resolve checkpoint commit OID once, immediately after fetch.
  // All subsequent operations (read, verify, materialize) use this OID —
  // symbolic origin/<branch> is never re-evaluated (no TOCTOU window).
  const revParseResult = await spawnFn(
    "git",
    ["rev-parse", `origin/${branch}^{commit}`],
    { cwd },
  );
  if (revParseResult.exitCode !== 0) {
    throw checkpointNotFoundError(
      branch,
      `git rev-parse origin/${branch}^{commit} failed (exit ${revParseResult.exitCode}): ${revParseResult.stderr.trim()}`,
    );
  }
  const checkpointOid = revParseResult.stdout.trim();

  // Read checkpoint using the resolved OID (not the symbolic ref)
  const { slug, stateJson, eventsJsonl, treeFiles } = await readCheckpointFromRef(
    spawnFn,
    cwd,
    checkpointOid,
  );

  // T-08: read the durable evidence anchor to verify checkpoint authenticity.
  // present → anchorDigest passed to verifyCheckpoint (authenticity enforced).
  // absent  → anchorDigest omitted (backward-compat, self-consistency only).
  // unavailable → fail-closed reject.
  const anchorResult = await readEvidenceAnchor(spawnFn, cwd, branch);
  let anchorDigest: string | undefined;
  if (anchorResult.kind === "present") {
    anchorDigest = anchorResult.digest;
  } else if (anchorResult.kind === "unavailable") {
    throw checkpointNotAttachableError(
      "journal-authenticity",
      `Evidence anchor fetch failed (fail-closed): ${anchorResult.reason}`,
    );
  }
  // anchorResult.kind === "absent" → anchorDigest stays undefined (backward-compat)

  // Verify self-consistency and authenticity (pure predicate — no I/O side effects)
  return verifyCheckpoint({ slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo, checkpointOid, anchorDigest });
}

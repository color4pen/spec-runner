/**
 * evidence-anchor-ref — durable anchor git plumbing for pipeline-authored journal digest.
 *
 * Stores the pipeline-authored journal digest as a git blob ref in the namespace
 * `refs/specrunner/evidence/<branch>`. This ref is:
 *   - agent-unreachable: agents have no push permission to this namespace
 *   - crash-surviving: persisted to origin via git push
 *   - content-addressed: the blob OID carries the digest string
 *
 * Design constraint: do NOT import from src/adapter/ or src/core/ — this is a
 * src/git/ layer module. Imports are limited to src/util/spawn and src/logger
 * (mirroring src/git/checkpoint-ref.ts conventions).
 *
 * All operations are best-effort (push failures do not throw).
 */
import type { SpawnFn } from "../util/spawn.js";
import { stderrWrite } from "../logger/stdout.js";

// ---------------------------------------------------------------------------
// evidenceAnchorRefName
// ---------------------------------------------------------------------------

/**
 * Returns the git ref name for the evidence anchor for the given branch.
 * Example: evidenceAnchorRefName("change/foo-abc12345") → "refs/specrunner/evidence/change/foo-abc12345"
 */
export function evidenceAnchorRefName(branch: string): string {
  return `refs/specrunner/evidence/${branch}`;
}

// ---------------------------------------------------------------------------
// pushEvidenceAnchor
// ---------------------------------------------------------------------------

/**
 * Push the pipeline-authored journal digest to the durable origin anchor ref.
 *
 * Steps:
 *   1. `git hash-object -w --stdin` with digest as stdin input → blob OID
 *   2. `git update-ref <ref> <blobOid>`
 *   3. `git push origin <ref>:<ref>`
 *
 * Best-effort: if any step fails, logs a warning to stderr but does NOT throw.
 * This ensures push failures never break the terminal transition.
 */
export async function pushEvidenceAnchor(
  spawnFn: SpawnFn,
  cwd: string,
  branch: string,
  digest: string,
): Promise<void> {
  const ref = evidenceAnchorRefName(branch);

  try {
    // Step 1: Create a git blob object from the digest string
    // Pass digest as stdin input (spawnFn supports opts.input for stdin piping)
    const hashResult = await spawnFn(
      "git",
      ["hash-object", "-w", "--stdin"],
      { cwd, input: digest },
    );

    if ((hashResult.exitCode ?? 1) !== 0) {
      stderrWrite(
        `Warning: evidence anchor hash-object failed (exit ${hashResult.exitCode}): ${hashResult.stderr.trim()}\n`,
      );
      return;
    }

    const blobOid = hashResult.stdout.trim();
    if (!blobOid) {
      stderrWrite("Warning: evidence anchor hash-object produced no OID.\n");
      return;
    }

    // Step 2: Update the local ref to point to the blob
    const updateRefResult = await spawnFn(
      "git",
      ["update-ref", ref, blobOid],
      { cwd },
    );

    if ((updateRefResult.exitCode ?? 1) !== 0) {
      stderrWrite(
        `Warning: evidence anchor update-ref failed (exit ${updateRefResult.exitCode}): ${updateRefResult.stderr.trim()}\n`,
      );
      return;
    }

    // Step 3: Push the ref to origin (best-effort)
    const pushResult = await spawnFn(
      "git",
      ["push", "origin", `${ref}:${ref}`],
      { cwd },
    );

    if ((pushResult.exitCode ?? 1) !== 0) {
      stderrWrite(
        `Warning: evidence anchor push failed (exit ${pushResult.exitCode}): ${pushResult.stderr.trim()}\n`,
      );
    }
  } catch (err) {
    // Best-effort: never throw
    stderrWrite(
      `Warning: evidence anchor push failed with exception: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// readEvidenceAnchor
// ---------------------------------------------------------------------------

/**
 * Read the durable evidence anchor digest from the origin ref.
 *
 * Steps:
 *   1. `git fetch origin <ref>:<ref>` — fetch from origin
 *   2. `git cat-file blob <ref>` — read blob content as digest
 *
 * Returns:
 *   - `{ kind: "present", digest }` — ref exists and contains a valid digest
 *   - `{ kind: "absent" }` — ref does not exist on origin (pre-feature / pre-anchor)
 *   - `{ kind: "unavailable", reason }` — fetch failed for non-ref-not-found reason (offline, etc.)
 */
export async function readEvidenceAnchor(
  spawnFn: SpawnFn,
  cwd: string,
  branch: string,
): Promise<
  | { kind: "present"; digest: string }
  | { kind: "absent" }
  | { kind: "unavailable"; reason: string }
> {
  const ref = evidenceAnchorRefName(branch);

  try {
    // Step 1: Fetch the ref from origin
    const fetchResult = await spawnFn(
      "git",
      ["fetch", "origin", `${ref}:${ref}`],
      { cwd },
    );

    if ((fetchResult.exitCode ?? 1) !== 0) {
      const stderr = fetchResult.stderr ?? "";
      // Detect "ref does not exist" patterns → absent
      if (isRefNotFoundError(stderr)) {
        return { kind: "absent" };
      }
      // Other fetch failures (network, auth, etc.) → unavailable
      return {
        kind: "unavailable",
        reason: `git fetch origin ${ref} failed (exit ${fetchResult.exitCode}): ${stderr.trim()}`,
      };
    }

    // Step 2: Read the blob content
    const catFileResult = await spawnFn(
      "git",
      ["cat-file", "blob", ref],
      { cwd },
    );

    if ((catFileResult.exitCode ?? 1) !== 0) {
      return {
        kind: "unavailable",
        reason: `git cat-file blob ${ref} failed (exit ${catFileResult.exitCode}): ${(catFileResult.stderr ?? "").trim()}`,
      };
    }

    const digest = catFileResult.stdout.trim();
    return { kind: "present", digest };
  } catch (err) {
    return {
      kind: "unavailable",
      reason: `exception reading evidence anchor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect patterns that indicate a git ref does not exist on origin.
 * Used to distinguish "absent" (ref not pushed yet) from "unavailable" (network/auth error).
 */
function isRefNotFoundError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("couldn't find remote ref") ||
    lower.includes("remote ref does not exist") ||
    (lower.includes("error") && lower.includes("refspec") && lower.includes("not found"))
  );
}

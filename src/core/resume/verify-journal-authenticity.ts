/**
 * verify-journal-authenticity — resume path journal authenticity verification.
 *
 * Verifies that the on-disk journal (events.jsonl + state.json) matches the
 * durable origin anchor ref before resuming a job. This prevents agents from
 * tampering with the journal during a crash→resume window.
 *
 * Design D7 (absent-anchor rules):
 *   - branch null → skip (pre-branch state)
 *   - origin anchor absent (ref not pushed) → skip (pre-feature / no prior checkpoint)
 *   - origin anchor unavailable (network/auth error) → fail-closed (unavailable)
 *   - origin anchor present → compare on-disk digest against anchor digest
 *
 * Source: tasks.md > T-07 / design.md > D5
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { computeJournalDigest } from "../../store/journal-anchor.js";
import { readEvidenceAnchor } from "../../git/evidence-anchor-ref.js";
import { atomicWriteString } from "../../util/atomic-write.js";
import type { SpawnFn } from "../../util/spawn.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResumeAuthenticityResult =
  | { kind: "ok" }
  | { kind: "skip" }
  | { kind: "tamper"; detail: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// verifyResumeJournalAuthenticity
// ---------------------------------------------------------------------------

/**
 * Verify that the on-disk journal in sourceChangeDir matches the durable origin anchor.
 *
 * @param input.cwd            - Repository root (for git operations).
 * @param input.branch         - Feature branch name (null = pre-branch → skip).
 * @param input.sourceChangeDir - Absolute path to the change folder (contains events.jsonl, state.json).
 * @param input.spawnFn        - SpawnFn for git operations.
 *
 * Returns:
 *   - { kind: "ok" }           — on-disk digest matches origin anchor.
 *   - { kind: "skip" }         — branch is null or anchor is absent (pre-branch / pre-feature).
 *   - { kind: "tamper"; detail } — on-disk digest does not match anchor.
 *   - { kind: "unavailable"; reason } — anchor fetch failed (network/auth error) → fail-closed.
 */
export async function verifyResumeJournalAuthenticity(input: {
  cwd: string;
  branch: string | null;
  sourceChangeDir: string;
  spawnFn: SpawnFn;
}): Promise<ResumeAuthenticityResult> {
  const { cwd, branch, sourceChangeDir, spawnFn } = input;

  // D7: branch null → pre-branch state → skip
  if (branch === null) {
    return { kind: "skip" };
  }

  // Fetch and read the durable origin anchor
  const anchorResult = await readEvidenceAnchor(spawnFn, cwd, branch);

  if (anchorResult.kind === "absent") {
    // D7: ref not present → pre-feature / no prior checkpoint → skip
    return { kind: "skip" };
  }

  if (anchorResult.kind === "unavailable") {
    // Fail-closed: network/auth error → cannot verify → block resume
    return { kind: "unavailable", reason: anchorResult.reason };
  }

  // anchorResult.kind === "present"
  const anchorDigest = anchorResult.digest;

  // Read on-disk journal bytes
  let onDiskDigest: string | null = null;
  try {
    const eventsPath = path.join(sourceChangeDir, "events.jsonl");
    const statePath = path.join(sourceChangeDir, "state.json");
    const [eventsBytes, stateBytes] = await Promise.all([
      fs.readFile(eventsPath, "utf-8"),
      fs.readFile(statePath, "utf-8"),
    ]);
    onDiskDigest = computeJournalDigest(eventsBytes, stateBytes);
  } catch (err) {
    // Cannot read on-disk journal — treat as tamper (anchor says journal should exist)
    return {
      kind: "tamper",
      detail: `on-disk journal unreadable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (onDiskDigest === anchorDigest) {
    return { kind: "ok" };
  }

  return {
    kind: "tamper",
    detail: `on-disk journal digest mismatch — expected ${anchorDigest}, got ${onDiskDigest}`,
  };
}

// ---------------------------------------------------------------------------
// restoreResumeJournal
// ---------------------------------------------------------------------------

/**
 * Restore the journal in sourceChangeDir from the origin branch checkpoint.
 *
 * After tamper detection, writes the origin checkpoint bytes (fetched via git show)
 * back to events.jsonl and state.json. Verifies that the restored content matches
 * the origin anchor before writing (fail-closed: do not restore if the origin itself
 * is suspect).
 *
 * @param input.cwd              - Repository root.
 * @param input.branch           - Feature branch name.
 * @param input.sourceChangeDir  - Absolute path to the change folder to restore.
 * @param input.spawnFn          - SpawnFn for git operations.
 * @param input.originAnchorDigest - The digest from the origin anchor ref (must match restored content).
 */
export async function restoreResumeJournal(input: {
  cwd: string;
  branch: string;
  sourceChangeDir: string;
  spawnFn: SpawnFn;
  originAnchorDigest: string;
}): Promise<void> {
  const { cwd, branch, sourceChangeDir, spawnFn, originAnchorDigest } = input;

  // Derive the worktree-relative change dir path from sourceChangeDir
  // (we need the relative path for `git show origin/<branch>:<path>`)
  const changeDir = sourceChangeDir.startsWith(cwd + "/")
    ? sourceChangeDir.slice(cwd.length + 1)
    : sourceChangeDir;

  // Fetch events.jsonl from origin/<branch>
  const eventsRelPath = `${changeDir}/events.jsonl`;
  const eventsResult = await spawnFn(
    "git",
    ["show", `origin/${branch}:${eventsRelPath}`],
    { cwd },
  );
  if ((eventsResult.exitCode ?? 1) !== 0) {
    throw new Error(
      `restoreResumeJournal: git show origin/${branch}:${eventsRelPath} failed (exit ${eventsResult.exitCode})`,
    );
  }
  const originEvents = eventsResult.stdout;

  // Fetch state.json from origin/<branch>
  const stateRelPath = `${changeDir}/state.json`;
  const stateResult = await spawnFn(
    "git",
    ["show", `origin/${branch}:${stateRelPath}`],
    { cwd },
  );
  if ((stateResult.exitCode ?? 1) !== 0) {
    throw new Error(
      `restoreResumeJournal: git show origin/${branch}:${stateRelPath} failed (exit ${stateResult.exitCode})`,
    );
  }
  const originState = stateResult.stdout;

  // Verify the restored content matches the origin anchor digest (fail-closed)
  const restoredDigest = computeJournalDigest(originEvents, originState);
  if (restoredDigest !== originAnchorDigest) {
    throw new Error(
      `restoreResumeJournal: origin checkpoint digest mismatch — ` +
      `expected ${originAnchorDigest}, got ${restoredDigest}. Refusing to restore.`,
    );
  }

  // Write the authentic bytes back to disk
  const eventsAbsPath = path.join(sourceChangeDir, "events.jsonl");
  const stateAbsPath = path.join(sourceChangeDir, "state.json");

  await Promise.all([
    atomicWriteString(eventsAbsPath, originEvents),
    atomicWriteString(stateAbsPath, originState),
  ]);
}

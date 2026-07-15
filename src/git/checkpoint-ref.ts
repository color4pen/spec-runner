/**
 * checkpoint-ref — read a branch-borne checkpoint from a remote-tracking ref.
 *
 * Reads branch-borne checkpoint state (state.json, events.jsonl, treeFiles) from
 * a git object store ref (e.g. "origin/<branch>") without checking out any files.
 *
 * Design constraint: do NOT import from src/adapter/ or src/core/ — this is a
 * src/git/ layer module. Imports are limited to src/util/spawn, src/util/paths,
 * and src/errors (mirroring src/git/remote.ts and src/git/source-revision.ts).
 */
import type { SpawnFn } from "../util/spawn.js";
import { changeFolderPath } from "../util/paths.js";
import {
  checkpointNotFoundError,
} from "../errors.js";

// ---------------------------------------------------------------------------
// Excluded subdirectory names under specrunner/changes/
// ---------------------------------------------------------------------------

const EXCLUDED_CHANGE_DIRS = new Set(["archive", "canceled"]);

// ---------------------------------------------------------------------------
// Internal helper: run git command using the Promise-based SpawnFn
// ---------------------------------------------------------------------------

async function runGit(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await spawnFn("git", args, { cwd });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// ---------------------------------------------------------------------------
// resolveCheckpointSlug
// ---------------------------------------------------------------------------

/**
 * Resolve the single active change folder slug from the given ref's tree.
 *
 * - Lists `specrunner/changes/` directory entries from the ref.
 * - Excludes "archive" and "canceled".
 * - For each candidate, checks if `specrunner/changes/<name>/state.json` exists
 *   via `git cat-file -e`.
 * - Exactly 1 match → returns slug.
 * - 0 matches → throws checkpointNotFoundError (no checkpoint).
 * - 2+ matches → throws checkpointNotFoundError (ambiguous).
 *
 * @param spawnFn  Spawn function (may be transport-auth-wrapped).
 * @param cwd      Working directory for git commands.
 * @param ref      Git ref to inspect (e.g. "origin/feat/x-abc").
 */
export async function resolveCheckpointSlug(
  spawnFn: SpawnFn,
  cwd: string,
  ref: string,
): Promise<string> {
  // List top-level entries under specrunner/changes/
  const lsResult = await runGit(spawnFn, cwd, [
    "ls-tree", "--name-only", ref, "specrunner/changes/",
  ]);

  if (lsResult.exitCode !== 0) {
    throw checkpointNotFoundError(
      ref,
      `git ls-tree failed (exit ${lsResult.exitCode}): ${lsResult.stderr.trim()}`,
    );
  }

  const entries = lsResult.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // ls-tree returns full paths like "specrunner/changes/my-slug"; extract basename
    .map((l) => {
      const parts = l.split("/");
      return parts[parts.length - 1] ?? "";
    })
    .filter((name) => name.length > 0 && !EXCLUDED_CHANGE_DIRS.has(name));

  // Check each candidate for presence of state.json via cat-file -e
  const candidates: string[] = [];
  for (const name of entries) {
    const stateJsonRef = `${ref}:${changeFolderPath(name)}/state.json`;
    const catResult = await runGit(spawnFn, cwd, ["cat-file", "-e", stateJsonRef]);
    if (catResult.exitCode === 0) {
      candidates.push(name);
    }
  }

  if (candidates.length === 0) {
    throw checkpointNotFoundError(
      ref,
      `No active change folder with state.json found under specrunner/changes/ in ref '${ref}'.`,
    );
  }

  if (candidates.length > 1) {
    throw checkpointNotFoundError(
      ref,
      `Ambiguous: found ${candidates.length} active change folders with state.json in ref '${ref}': ${candidates.join(", ")}. Specify a more specific branch or ensure only one active change folder exists.`,
    );
  }

  return candidates[0]!;
}

// ---------------------------------------------------------------------------
// CheckpointRefResult
// ---------------------------------------------------------------------------

export interface CheckpointRefResult {
  slug: string;
  stateJson: string;
  eventsJsonl: string;
  /** Repo-relative paths of all files under specrunner/changes/<slug>/ in the ref. */
  treeFiles: string[];
}

// ---------------------------------------------------------------------------
// readCheckpointFromRef
// ---------------------------------------------------------------------------

/**
 * Read the full branch-borne checkpoint from the given ref.
 *
 * - Resolves slug via resolveCheckpointSlug.
 * - Reads state.json via `git show <ref>:specrunner/changes/<slug>/state.json`.
 * - Reads events.jsonl via `git show <ref>:specrunner/changes/<slug>/events.jsonl`
 *   (empty string if not present).
 * - Lists all files under `specrunner/changes/<slug>/` via `git ls-tree -r --name-only`.
 *
 * @param spawnFn  Spawn function.
 * @param cwd      Working directory.
 * @param ref      Git ref (e.g. "origin/feat/x-abc").
 */
export async function readCheckpointFromRef(
  spawnFn: SpawnFn,
  cwd: string,
  ref: string,
): Promise<CheckpointRefResult> {
  const slug = await resolveCheckpointSlug(spawnFn, cwd, ref);
  const changeDir = changeFolderPath(slug);

  // Read state.json (required)
  const stateJsonShowResult = await runGit(spawnFn, cwd, [
    "show", `${ref}:${changeDir}/state.json`,
  ]);
  if (stateJsonShowResult.exitCode !== 0) {
    throw checkpointNotFoundError(
      ref,
      `git show ${ref}:${changeDir}/state.json failed (exit ${stateJsonShowResult.exitCode}): ${stateJsonShowResult.stderr.trim()}`,
    );
  }
  const stateJson = stateJsonShowResult.stdout;

  // Read events.jsonl (optional — empty string if absent)
  let eventsJsonl = "";
  const eventsShowResult = await runGit(spawnFn, cwd, [
    "show", `${ref}:${changeDir}/events.jsonl`,
  ]);
  if (eventsShowResult.exitCode === 0) {
    eventsJsonl = eventsShowResult.stdout;
  }
  // Non-zero exit = file not present; leave eventsJsonl as ""

  // List all files under specrunner/changes/<slug>/ (for artifact verification)
  const lsTreeResult = await runGit(spawnFn, cwd, [
    "ls-tree", "-r", "--name-only", ref, "--", `${changeDir}/`,
  ]);
  const treeFiles = lsTreeResult.exitCode === 0
    ? lsTreeResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    : [];

  return { slug, stateJson, eventsJsonl, treeFiles };
}

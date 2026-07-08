/**
 * Changed-line derivation utilities for the lcov coverage gate.
 *
 * Parses unified diff output to extract the set of changed (added/modified) line numbers,
 * then wraps git spawn to obtain changed files and their line sets for a branch comparison.
 *
 * No external dependencies — node:child_process only.
 * Uses POSIX-style paths (git output) as keys, matching lcov normalization.
 */
import { spawn as nodeSpawn } from "node:child_process";
import { stripSecrets } from "../../util/env-filter.js";

/** Type alias for the spawn function to allow test injection. */
export type SpawnFn = typeof nodeSpawn;

/**
 * Parse a unified diff text and return the set of HEAD-side (added/changed) line numbers.
 *
 * Processes hunk headers of the form:
 *   @@ -<old_start>[,<old_count>] +<new_start>[,<new_count>] @@
 *
 * Rules:
 * - Extract the HEAD side: `+<new_start>[,<new_count>]`.
 * - If `<new_count>` is omitted, treat as 1 line: [new_start, new_start].
 * - If `<new_count>` is 0 (pure deletion), contribute no lines.
 * - Otherwise, lines [new_start, new_start + new_count - 1] are included.
 * - Multiple hunks are unioned.
 *
 * @param diffText - Full text of `git diff --unified=0 <base>...HEAD -- <file>`.
 * @returns Set of HEAD-side line numbers that were added or modified.
 */
export function parseUnifiedDiffChangedLines(diffText: string): Set<number> {
  const result = new Set<number>();

  // Matches: @@ -<old> +<new_start>[,<new_count>] @@
  // Group 1: new_start, Group 2: new_count (optional, including leading comma)
  const hunkRe = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/m;

  for (const line of diffText.split("\n")) {
    const m = line.match(hunkRe);
    if (!m) continue;

    const newStart = parseInt(m[1]!, 10);
    // When count is omitted, it defaults to 1.
    const newCount = m[2] !== undefined ? parseInt(m[2], 10) : 1;

    // Pure deletion (d=0): no lines on HEAD side — skip.
    if (newCount === 0) continue;

    for (let i = newStart; i < newStart + newCount; i++) {
      result.add(i);
    }
  }

  return result;
}

/**
 * Spawn a git command and collect stdout as a string.
 * Resolves with stdout on exit code 0; rejects with an error otherwise.
 */
function spawnGit(
  args: string[],
  cwd: string,
  spawnFn: SpawnFn,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnFn("git", args, {
      cwd,
      shell: false,
      env: stripSecrets(process.env as Record<string, string | undefined>),
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `git ${args[0]} exited with code ${code}: ${Buffer.concat(errChunks).toString("utf-8")}`,
          ),
        );
      } else {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });

    child.on("error", (err) => reject(err));
  });
}

/**
 * Options for getChangedFilesAndLines.
 */
export interface ChangedFilesOptions {
  /** Working directory (repo root). */
  cwd: string;
  /** Base branch to diff against. Defaults to "main". */
  baseBranch?: string;
  /** Spawn function for dependency injection (tests). Defaults to node:child_process.spawn. */
  spawn?: SpawnFn;
}

/**
 * Get the set of changed (added/modified, not deleted) files and their changed line numbers
 * by comparing the current HEAD against baseBranch.
 *
 * Uses:
 *   git diff --name-only --diff-filter=d <baseBranch>...HEAD  (list changed, non-deleted files)
 *   git diff --unified=0 <baseBranch>...HEAD -- <file>        (per-file changed lines)
 *
 * @returns Map where keys are repo-root-relative POSIX paths (as output by git)
 *          and values are Sets of changed line numbers on the HEAD side.
 */
export async function getChangedFilesAndLines(
  options: ChangedFilesOptions,
): Promise<Map<string, Set<number>>> {
  const { cwd, baseBranch = "main", spawn = nodeSpawn } = options;
  const result = new Map<string, Set<number>>();

  // Step 1: List changed (non-deleted) files.
  let fileListOutput: string;
  try {
    fileListOutput = await spawnGit(
      ["diff", "--name-only", "--diff-filter=d", `${baseBranch}...HEAD`],
      cwd,
      spawn,
    );
  } catch {
    // No diff available (e.g. no git history) — return empty map.
    return result;
  }

  const files = fileListOutput
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (files.length === 0) {
    return result;
  }

  // Step 2: For each file, get per-line changed lines.
  for (const file of files) {
    let diffText: string;
    try {
      diffText = await spawnGit(
        ["diff", "--unified=0", `${baseBranch}...HEAD`, "--", file],
        cwd,
        spawn,
      );
    } catch {
      // If diff fails for a single file, treat it as having no changed lines.
      result.set(file, new Set<number>());
      continue;
    }

    result.set(file, parseUnifiedDiffChangedLines(diffText));
  }

  return result;
}

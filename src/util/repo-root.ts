import { spawnCommand } from "./spawn.js";

/**
 * Resolve the git repository root starting from the given directory (defaults to process.cwd()).
 * Returns null if not in a git repo or git command fails.
 * Use this for read-only CLI commands that can degrade gracefully.
 */
export async function resolveRepoRoot(cwd?: string): Promise<string | null> {
  try {
    const result = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: cwd ?? process.cwd() });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the git repository root starting from the given directory (defaults to process.cwd()),
 * or throw on failure.
 * Use this for state-modifying CLI commands that require a valid git repo.
 */
export async function resolveRepoRootOrFail(cwd?: string): Promise<string> {
  const root = await resolveRepoRoot(cwd);
  if (root === null) {
    throw new Error("Failed to resolve git repo root. Ensure you are inside a git repository.");
  }
  return root;
}

import { spawnCommand } from "./spawn.js";

/**
 * Resolve the git repository root from cwd.
 * Returns null if not in a git repo or git command fails.
 * Use this for read-only CLI commands that can degrade gracefully.
 */
export async function resolveRepoRoot(): Promise<string | null> {
  try {
    const result = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the git repository root from cwd, or throw on failure.
 * Use this for state-modifying CLI commands that require a valid git repo.
 */
export async function resolveRepoRootOrFail(): Promise<string> {
  const root = await resolveRepoRoot();
  if (root === null) {
    throw new Error("Failed to resolve git repo root. Ensure you are inside a git repository.");
  }
  return root;
}

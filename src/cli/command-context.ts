/**
 * CommandContext: dispatch-time resolved context injected into every command handler.
 *
 * Design:
 *  - repoRoot: the git repo root resolved from the invoker cwd (null = outside a repo)
 *  - invokerCwd: the actual working directory from which specrunner was invoked
 *
 * The two roles of cwd (per ADR repo-root-entry-resolution):
 *   (a) Repo root discovery origin — resolveRepoRoot(invokerCwd)
 *   (b) User-supplied relative-path base — path.resolve(invokerCwd, userInput)
 *
 * repoRoot is resolved once at dispatch and injected; handlers must not call
 * resolveRepoRoot() independently.
 */

import { resolveRepoRoot } from "../util/repo-root.js";

export interface CommandContext {
  /** Resolved git repository root, or null when outside a git repository. */
  repoRoot: string | null;
  /** Actual working directory from which specrunner was invoked. */
  invokerCwd: string;
}

/**
 * Build a CommandContext by resolving the repo root from the invoker cwd.
 *
 * @param invokerCwd  - process.cwd() at dispatch time (the real invoker directory)
 * @param resolveFn   - optional override for resolveRepoRoot (injectable for tests)
 */
export async function buildCommandContext(
  invokerCwd: string,
  resolveFn?: (cwd: string) => Promise<string | null>,
): Promise<CommandContext> {
  const resolver = resolveFn ?? resolveRepoRoot;
  const repoRoot = await resolver(invokerCwd);
  return { repoRoot, invokerCwd };
}

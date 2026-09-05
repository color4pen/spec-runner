/**
 * Git-denying spawn wrapper for the artifact-output profile.
 * T-06: guarded-spawn.ts — wraps SpawnFn to reject git/gh invocations.
 *
 * The artifact-output profile must not invoke git or gh through SpecRunner's
 * own spawn paths. This guard enforces that constraint mechanically.
 *
 * NOTE: Agent subprocess (Claude Code CLI / Codex) may internally call git;
 * that is intentionally out of scope for this guard (agent subprocess boundary).
 */
import type { SpawnFn } from "../../util/spawn.js";
import * as nodePath from "node:path";

/**
 * Wrap a SpawnFn to reject any invocation of `git` or `gh`.
 *
 * - If the command basename (last component) is `git` or `gh`: throws an Error.
 *   The error message clarifies that agent subprocess internal git calls are out of scope.
 * - For all other commands: delegates to the inner SpawnFn unchanged.
 */
export function createGitDenyingSpawn(inner: SpawnFn): SpawnFn {
  return (cmd, args, opts) => {
    const basename = nodePath.basename(cmd);
    if (basename === "git" || basename === "gh") {
      throw new Error(
        `[artifact-output] Attempted to spawn blocked command: ${cmd}\n` +
        `The artifact-output profile does not invoke git or gh through SpecRunner's own spawn paths.\n` +
        `Note: git calls inside the agent subprocess are out of scope for this guard.`,
      );
    }
    return inner(cmd, args, opts);
  };
}

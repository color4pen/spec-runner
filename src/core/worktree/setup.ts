/**
 * Workspace setup plan resolution for worktree creation.
 *
 * Resolves how the worktree should be set up after `git worktree add`:
 *   - "detect-install": run the default detectPm + install (existing behaviour)
 *   - "commands": run a user-specified command list
 *   - "skip": do nothing (non-JS / greenfield projects)
 *
 * D2 (design.md): Resolution (which kind) is a pure function here; execution is in manager.ts.
 * D5 (design.md): No import from verification module (avoids cross-cutting dependency).
 */
import type { ShellCommand } from "../../config/schema.js";

/**
 * Discriminated union representing how a worktree should be set up.
 *
 * - `detect-install`: use the existing detectPackageManager + installCommand flow (default).
 * - `commands`: execute the given list of shell commands in order (config-driven).
 * - `skip`: do not run any install or setup commands.
 */
export type WorkspaceSetupPlan =
  | { kind: "detect-install" }
  | { kind: "commands"; commands: { name?: string; run: string }[] }
  | { kind: "skip" };

/**
 * Normalize a ShellCommand entry to the internal `{ name?, run }` form.
 * Strings become `{ run: string }`.
 * Objects are passed through with only `name` and `run` extracted.
 */
function normalize(setup: ShellCommand[]): { name?: string; run: string }[] {
  return setup.map((cmd) => {
    if (typeof cmd === "string") {
      return { run: cmd };
    }
    const entry: { name?: string; run: string } = { run: cmd.run };
    if (cmd.name !== undefined) {
      entry.name = cmd.name;
    }
    return entry;
  });
}

/**
 * Resolve the workspace setup plan from config and JS dependency traces.
 *
 * Resolution rules (D3 in design.md):
 *   1. `setup !== undefined` (including empty array) → `{ kind: "commands", commands: normalize(setup) }`.
 *      An empty array is an explicit install skip even for JS projects.
 *   2. `setup === undefined` AND `hasJsTraces === true` → `{ kind: "detect-install" }`.
 *   3. `setup === undefined` AND `hasJsTraces === false` → `{ kind: "skip" }`.
 *
 * @param setup - The `workspace.setup` value from config, or `undefined` if not set.
 * @param hasJsTraces - Whether the repository root contains JS dependency traces
 *                      (any lockfile or package.json in LOCKFILE_MAP).
 */
export function resolveWorkspaceSetupPlan(
  setup: ShellCommand[] | undefined,
  hasJsTraces: boolean,
): WorkspaceSetupPlan {
  if (setup !== undefined) {
    return { kind: "commands", commands: normalize(setup) };
  }
  if (hasJsTraces) {
    return { kind: "detect-install" };
  }
  return { kind: "skip" };
}

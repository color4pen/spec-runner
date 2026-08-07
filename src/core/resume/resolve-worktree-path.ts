import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { livenessJsonPath } from "../../util/paths.js";

type FsReader = { readFile: (path: string, encoding: BufferEncoding) => Promise<string> };

/**
 * Resolve the worktree path for a job from state or liveness sidecar.
 *
 * Prefers `state.worktreePath` when set; falls back to the machine-local liveness
 * sidecar (`.specrunner/local/<slug>/liveness.json`) when the slug is known.
 * Returns null when neither source yields a valid path.
 */
export async function resolveLivenessWorktreePath(
  state: { worktreePath?: string | null; jobId: string },
  slug: string,
  cwd: string,
  fs: FsReader = nodeFs,
): Promise<string | null> {
  let resolvedWorktreePath: string | null = state.worktreePath ?? null;
  if (!resolvedWorktreePath && slug) {
    try {
      const sidecarAbsPath = nodePath.join(cwd, livenessJsonPath(slug));
      const raw = await fs.readFile(sidecarAbsPath, "utf-8");
      const sidecar = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof sidecar["worktreePath"] === "string" &&
        sidecar["jobId"] === state.jobId
      ) {
        resolvedWorktreePath = sidecar["worktreePath"];
      }
    } catch {
      // No sidecar or mismatch — will create a new worktree on resume
    }
  }
  return resolvedWorktreePath;
}

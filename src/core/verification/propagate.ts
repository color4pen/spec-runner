/**
 * Propagate verification-result.md to the feature branch on origin.
 *
 * The verification step (kind: "cli") writes verification-result.md to the
 * job worktree. The build-fixer step runs in a managed agent session whose
 * workspace is a fresh clone of the feature branch. Without this propagation,
 * build-fixer cannot read verification-result.md and falls back to running
 * tests itself.
 *
 * Design D5: With the job worktree design, the cwd IS already the feature branch
 * worktree. No temp worktree is needed — we commit and push directly from cwd.
 *
 * Failures are returned as `{ ok: false, error }`; the caller decides whether
 * to halt verification or continue with a warning.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawnCommand, type SpawnFn } from "../../util/spawn.js";
import { verificationResultPath } from "../../util/paths.js";

export interface PropagateResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

const VERIFICATION_RESULT_REL_PATH = (slug: string): string =>
  verificationResultPath(slug);

export async function propagateVerificationResult(params: {
  slug: string;
  branch: string;
  iteration: number;
  cwd: string;
  spawn?: SpawnFn;
}): Promise<PropagateResult> {
  const spawn = params.spawn ?? spawnCommand;
  const { slug, branch, iteration, cwd } = params;

  // Verify the source file exists in cwd (the job worktree)
  const sourceFile = path.join(cwd, verificationResultPath(slug));
  try {
    await fs.access(sourceFile);
  } catch {
    return { ok: false, error: `verification-result.md not found at ${sourceFile}` };
  }

  const relPath = VERIFICATION_RESULT_REL_PATH(slug);

  const addResult = await spawn("git", ["add", relPath], { cwd });
  if (addResult.exitCode !== 0) {
    return { ok: false, error: `git add failed: ${addResult.stderr.trim()}` };
  }

  const diffResult = await spawn("git", ["diff", "--cached", "--quiet"], { cwd });
  if (diffResult.exitCode === 0) {
    return { ok: true, warning: "verification-result.md unchanged; skipping commit" };
  }

  const commitMsg = `chore: verification result for ${slug} (iter ${iteration})`;
  const commitResult = await spawn("git", ["commit", "-m", commitMsg], { cwd });
  if (commitResult.exitCode !== 0) {
    return { ok: false, error: `git commit failed: ${commitResult.stderr.trim()}` };
  }

  const pushResult = await spawn("git", ["push", "origin", branch], { cwd });
  if (pushResult.exitCode !== 0) {
    return { ok: false, error: `git push failed: ${pushResult.stderr.trim()}` };
  }

  return { ok: true };
}

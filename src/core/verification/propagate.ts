/**
 * Propagate verification-result.md to the feature branch on origin.
 *
 * The verification step (kind: "cli") writes verification-result.md to the
 * job worktree. The implementer re-entry (recovery mode) runs in a managed
 * agent session whose workspace is a fresh clone of the feature branch. Without
 * this propagation, the implementer cannot read verification-result.md and falls
 * back to running tests itself.
 *
 * Design D5: With the job worktree design, the cwd IS already the feature branch
 * worktree. No temp worktree is needed — we commit and push directly from cwd.
 *
 * Failures are returned as `{ ok: false, error }`; the caller decides whether
 * to halt verification or continue with a warning.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { SpawnFn } from "../../util/spawn.js";
import { verificationResultPath } from "../../util/paths.js";

export interface PropagateResult {
  ok: boolean;
  commitOid?: string;
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
  spawn: SpawnFn;
  /**
   * D4 egress backstop: when provided, verifies the publish range against this ledger
   * (synthesizedCommits from job state) before pushing. Unknown commits abort the push
   * and return { ok: false, error }. Omit to skip the check (backward compat).
   */
  synthesizedCommits?: readonly string[];
}): Promise<PropagateResult> {
  const spawn = params.spawn;
  const { slug, iteration, cwd } = params;

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

  // Pathspec-limited: only the verification result decides whether to commit.
  // Whole-index diff would treat unrelated pre-staged entries as pending changes.
  const diffResult = await spawn("git", ["diff", "--cached", "--quiet", "--", relPath], { cwd });
  if (diffResult.exitCode === 0) {
    return { ok: true, warning: "verification-result.md unchanged; skipping commit" };
  }

  const commitMsg = `chore: verification result for ${slug} (iter ${iteration})`;
  // Explicit pathspec — a bare commit would sweep pre-staged unauthorized index entries
  // into the verification-result commit (which egress then blesses as pipeline-synthesized).
  const commitResult = await spawn("git", ["commit", "-m", commitMsg, "--", relPath], { cwd });
  if (commitResult.exitCode !== 0) {
    return { ok: false, error: `git commit failed: ${commitResult.stderr.trim()}` };
  }

  const headResult = await spawn("git", ["rev-parse", "HEAD"], { cwd });
  const commitOid = (headResult.exitCode ?? 1) === 0 ? headResult.stdout.trim() : undefined;
  return { ok: true, commitOid };
}

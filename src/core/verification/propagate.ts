/**
 * Commit verification-result.md in the CLI checkout and return its OID.
 * Local steps read it from the same worktree. Managed runtime separately
 * publishes the ledgered result through VerificationHandoffCapability.
 * Failures require the caller to halt before any publication or next step.
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
   * Legacy caller input. Publication and its egress check are owned by the
   * runtime handoff; this helper only creates the local result commit.
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
  const commitOid = headResult.stdout.trim();
  if ((headResult.exitCode ?? 1) !== 0 || commitOid.length === 0) {
    const detail = headResult.stderr.trim() || "git returned no commit OID";
    return { ok: false, error: `git rev-parse HEAD failed: ${detail}` };
  }
  return { ok: true, commitOid };
}

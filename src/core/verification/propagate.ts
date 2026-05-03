/**
 * Propagate verification-result.md to the feature branch on origin.
 *
 * The verification step (kind: "cli") writes verification-result.md to the
 * orchestrator's local filesystem. The build-fixer step runs in a managed
 * agent session whose workspace is a fresh clone of the feature branch.
 * Without this propagation, build-fixer cannot read verification-result.md
 * and falls back to running tests itself — typically with the wrong runner
 * (`bun test` vs `bun run test`) and observing false-positive failures.
 *
 * This helper uses a temporary git worktree so the orchestrator's main
 * checkout is never modified. The worktree is removed in a finally block.
 *
 * Failures are returned as `{ ok: false, error }`; the caller decides whether
 * to halt verification or continue with a warning.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { spawnCommand, type SpawnFn } from "../../util/spawn.js";

export interface PropagateResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

const VERIFICATION_RESULT_REL_PATH = (slug: string): string =>
  path.posix.join("openspec", "changes", slug, "verification-result.md");

export async function propagateVerificationResult(params: {
  slug: string;
  branch: string;
  iteration: number;
  cwd: string;
  spawn?: SpawnFn;
  mkdtempFn?: (prefix: string) => Promise<string>;
}): Promise<PropagateResult> {
  const spawn = params.spawn ?? spawnCommand;
  const mkdtempFn =
    params.mkdtempFn ?? ((prefix: string) => fs.mkdtemp(prefix));
  const { slug, branch, iteration, cwd } = params;

  const sourceFile = path.join(cwd, "openspec", "changes", slug, "verification-result.md");
  let content: string;
  try {
    content = await fs.readFile(sourceFile, "utf-8");
  } catch {
    return { ok: false, error: `verification-result.md not found at ${sourceFile}` };
  }

  const fetchResult = await spawn("git", ["fetch", "origin", branch], { cwd });
  if (fetchResult.exitCode !== 0) {
    return { ok: false, error: `git fetch origin ${branch} failed: ${fetchResult.stderr.trim()}` };
  }

  const tmpBase = await mkdtempFn(path.join(os.tmpdir(), "specrunner-verify-"));
  const worktreePath = path.join(tmpBase, "wt");

  let worktreeAdded = false;
  try {
    const wtAddResult = await spawn(
      "git",
      ["worktree", "add", "-B", branch, worktreePath, `origin/${branch}`],
      { cwd },
    );
    if (wtAddResult.exitCode !== 0) {
      return { ok: false, error: `git worktree add failed: ${wtAddResult.stderr.trim()}` };
    }
    worktreeAdded = true;

    const targetFile = path.join(worktreePath, "openspec", "changes", slug, "verification-result.md");
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, content, "utf-8");

    const relPath = VERIFICATION_RESULT_REL_PATH(slug);
    const addResult = await spawn("git", ["add", relPath], { cwd: worktreePath });
    if (addResult.exitCode !== 0) {
      return { ok: false, error: `git add failed: ${addResult.stderr.trim()}` };
    }

    const diffResult = await spawn("git", ["diff", "--cached", "--quiet"], { cwd: worktreePath });
    if (diffResult.exitCode === 0) {
      return { ok: true, warning: "verification-result.md unchanged; skipping commit" };
    }

    const commitMsg = `chore: verification result for ${slug} (iter ${iteration})`;
    const commitResult = await spawn("git", ["commit", "-m", commitMsg], { cwd: worktreePath });
    if (commitResult.exitCode !== 0) {
      return { ok: false, error: `git commit failed: ${commitResult.stderr.trim()}` };
    }

    const pushResult = await spawn("git", ["push", "origin", branch], { cwd: worktreePath });
    if (pushResult.exitCode !== 0) {
      return { ok: false, error: `git push failed: ${pushResult.stderr.trim()}` };
    }

    return { ok: true };
  } finally {
    if (worktreeAdded) {
      await spawn("git", ["worktree", "remove", "--force", worktreePath], { cwd });
    }
    await fs.rm(tmpBase, { recursive: true, force: true });
  }
}

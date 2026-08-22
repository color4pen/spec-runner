/**
 * CLI handler for `job archive --from-issue <n>`.
 *
 * Orchestrates: GitHub client setup → completed marker scan → 3-stage slug resolution → archive.
 *
 * Resolution order:
 *   1. local state (loadStateByJobId) — fastest; skips all network calls.
 *   2. base-borne archive record (resolveArchivedSlugByJobId) — for post-merge runs where the
 *      head branch has been deleted by GitHub. No branch fetch or rebind is performed.
 *   3. closing PR branch + rebind (resolveArchiveBranchFromIssue → runAttachVerification) —
 *      for pre-merge runs where the head branch still exists.
 *
 * cwd / repoRoot are received as arguments. process.cwd() is not called here.
 */
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { getOriginInfo } from "../git/remote.js";
import { createTransportAuth } from "../git/transport-auth.js";
import { spawnCommand } from "../util/spawn.js";
import { SpecRunnerError, EXIT_CODE, attachRuntimeUnsupportedError, ERROR_CODES } from "../errors.js";
import { logError, logInfo, stderrWrite, type LogLevel } from "../logger/stdout.js";
import { resolveCompletedJobId, resolveArchiveBranchFromIssue } from "../core/issue-target/archive.js";
import { resolveArchivedSlugByJobId } from "../core/archive/job-context.js";
import { loadStateByJobId } from "../core/job-access/load-by-job-id.js";
import { getJobSlug } from "../state/job-slug.js";
import type { JobState } from "../state/schema.js";
import { runAttachVerification } from "../core/attach/orchestrator.js";
import { attachArchivePolicy } from "../core/attach/checkpoint-policy.js";
import { LocalRuntime } from "../core/runtime/local.js";
import { runArchive } from "./archive.js";
import type { CommandContext } from "./command-context.js";

export interface ArchiveFromIssueOptions {
  withMerge?: boolean;
  mergeWaitMs?: number;
  cwd?: string;
  repoRoot?: string | null;
  logLevel?: LogLevel;
}

/**
 * Run `job archive --from-issue <issueNumber>`.
 * Returns process exit code.
 */
export async function runArchiveFromIssue(
  issueNumber: number,
  opts: ArchiveFromIssueOptions,
  ctx?: CommandContext,
): Promise<number> {
  const repoRoot = ctx?.repoRoot ?? opts.repoRoot ?? opts.cwd;
  if (!repoRoot) {
    logError("archive --from-issue: cannot determine repo root (no ctx.repoRoot or cwd)");
    return EXIT_CODE.GENERAL_ERROR;
  }

  try {
    // --- 1. Config + runtime check ---
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    if (config.runtime !== "local") {
      const err = attachRuntimeUnsupportedError(config.runtime ?? "unknown");
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }

    // --- 2. GitHub client setup ---
    const githubHost = resolveGitHubHost(config.github);
    const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);

    let githubToken: string;
    try {
      const result = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
      githubToken = result.token;
    } catch (err) {
      logError(`Failed to resolve GitHub token: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    let owner: string;
    let repo: string;
    try {
      const origin = await getOriginInfo(repoRoot, githubHost);
      owner = origin.owner;
      repo = origin.name;
    } catch (err) {
      logError(`Failed to resolve git origin: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);
    const transportAuth = createTransportAuth({ token: githubToken, cwd: repoRoot });
    const spawnFn = transportAuth.wrapSpawn(spawnCommand);

    // --- 3. Resolve jobId from completed marker ---
    const jobId = await resolveCompletedJobId({ client: githubClient, owner, repo, issueNumber });

    // --- 4. Local short-circuit ---
    let slug: string;

    let localState = null;
    try {
      localState = await loadStateByJobId(repoRoot, jobId);
    } catch (err) {
      const errCode = (err as { code?: string }).code;
      if (errCode !== ERROR_CODES.JOB_NOT_FOUND) {
        throw err;
      }
    }

    if (localState !== null) {
      slug = getJobSlug(localState as unknown as JobState);
    } else {
      // --- 5. Archive record fallback (post-merge: head branch may be deleted) ---
      const archivedSlug = await resolveArchivedSlugByJobId({ cwd: repoRoot, jobId, issueNumber });

      if (archivedSlug !== null) {
        logInfo(`archive-from-issue: resolved slug "${archivedSlug}" from base-borne archive record (post-merge path)`);
        slug = archivedSlug;
      } else {
        // --- 6. Resolve branch from closing PRs ---
        const resolved = await resolveArchiveBranchFromIssue({
          client: githubClient,
          owner,
          repo,
          issueNumber,
          jobId,
          spawnFn,
          cwd: repoRoot,
        });

        // --- 7. Rebind: verify checkpoint with awaiting-archive policy ---
        let verified: import("../core/attach/verify-checkpoint.js").VerifiedCheckpoint;
        try {
          verified = await runAttachVerification({
            cwd: repoRoot,
            branch: resolved.branch,
            spawnFn,
            expectedRepo: { owner, name: repo },
            policy: attachArchivePolicy,
          });
        } catch (err) {
          if (err instanceof SpecRunnerError) {
            logError(err.message);
            stderrWrite(`Hint: ${err.hint}`);
            return err.exitCode;
          }
          logError(`Attach verification failed: ${(err as Error).message}`);
          return EXIT_CODE.GENERAL_ERROR;
        }

        const runtime = new LocalRuntime({
          cwd: repoRoot,
          githubClient,
          githubToken,
          owner,
          repo,
          workspaceSetup: config.workspace?.setup,
        });

        const baseBranch = verified.state.request.baseBranch ?? "main";
        try {
          await runtime.setupWorkspace(verified.slug, verified.jobId, {
            attachCheckpoint: {
              branch: verified.branch,
              checkpointRef: verified.checkpointOid,
            },
            baseBranch,
          });
        } catch (err) {
          if (err instanceof SpecRunnerError) {
            logError(err.message);
            stderrWrite(`Hint: ${err.hint}`);
            return err.exitCode;
          }
          logError(`Failed to set up workspace: ${(err as Error).message}`);
          return EXIT_CODE.GENERAL_ERROR;
        }

        slug = verified.slug;
      } // end else (archivedSlug === null)
    } // end else (localState === null)

    // --- 8. Archive ---
    return await runArchive({
      slug,
      withMerge: opts.withMerge,
      cwd: repoRoot,
      mergeWaitMs: opts.mergeWaitMs,
    });
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    logError(`archive --from-issue failed: ${(err as Error).message}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}

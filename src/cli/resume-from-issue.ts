/**
 * CLI handler for `job resume --from-issue <n>`.
 *
 * Orchestrates: GitHub client setup → escalation marker scan → optional local
 * short-circuit → Development-link enumeration → identity check → rebind →
 * resume.
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
import { logError, stderrWrite, type LogLevel } from "../logger/stdout.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { resolveEscalationJobId, resolveResumeBranchFromIssue } from "../core/issue-target/resume.js";
import { loadStateByJobId } from "../core/job-access/load-by-job-id.js";
import { getJobSlug } from "../state/job-slug.js";
import type { JobState } from "../state/schema.js";
import { runAttachVerification } from "../core/attach/orchestrator.js";
import { LocalRuntime } from "../core/runtime/local.js";
import { runResumeCore } from "./resume.js";
import type { CommandContext } from "./command-context.js";

export interface ResumeFromIssueOptions {
  detach?: boolean;
  prompt?: string;
  from?: string;
  force?: boolean;
  applyCanon?: boolean;
  adoptCommits?: boolean;
  wontfix?: string;
  wontfixReason?: string;
  noWorktree?: boolean;
  json?: boolean;
  logLevel?: LogLevel;
  /** Invoker working directory. */
  cwd?: string;
  /** Dispatch-resolved repo root. */
  repoRoot?: string | null;
}

/**
 * Run `job resume --from-issue <issueNumber>`.
 * Returns process exit code.
 */
export async function runResumeFromIssue(
  issueNumber: number,
  opts: ResumeFromIssueOptions,
  ctx?: CommandContext,
): Promise<number> {
  const repoRoot = ctx?.repoRoot ?? opts.repoRoot ?? opts.cwd;
  if (!repoRoot) {
    logError("resume --from-issue: cannot determine repo root (no ctx.repoRoot or cwd)");
    return EXIT_CODE.GENERAL_ERROR;
  }

  try {
    // --- 1. GitHub client setup ---
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
    }

    // Runtime check: rebind is local-only
    if (config.runtime !== "local") {
      const err = attachRuntimeUnsupportedError(config.runtime ?? "unknown");
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }

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

    // Transport-auth wrapped spawn (used for fetch + checkpoint reads)
    const transportAuth = createTransportAuth({ token: githubToken, cwd: repoRoot });
    const spawnFn = transportAuth.wrapSpawn(spawnCommand);

    // --- 2. Resolve jobId from escalation marker ---
    const jobId = await resolveEscalationJobId({ client: githubClient, owner, repo, issueNumber });

    // --- 3. Local short-circuit (D4) ---
    let slug: string;
    let needsRebind: boolean;

    let localState = null;
    try {
      localState = await loadStateByJobId(repoRoot, jobId);
    } catch (err) {
      // Check the error code regardless of error class: loadStateByJobId throws
      // SpecRunnerError(JOB_NOT_FOUND) when absent — check code field directly.
      const errCode = (err as { code?: string }).code;
      if (errCode !== ERROR_CODES.JOB_NOT_FOUND) {
        throw err;
      }
      // JOB_NOT_FOUND: no local state → need full branch resolution
    }

    if (localState !== null) {
      // NormalizedJobState is Omit<JobState,"steps"> & {steps:Record<...>}
      // getJobSlug only reads request.slug / branch / request.path — safe cast
      slug = getJobSlug(localState as unknown as JobState);
      needsRebind = false;
    } else {
      // --- 4. Resolve branch from Development links ---
      const resolved = await resolveResumeBranchFromIssue({
        client: githubClient,
        owner,
        repo,
        issueNumber,
        jobId,
        spawnFn,
        cwd: repoRoot,
      });
      slug = resolved.slug;
      needsRebind = true;

      // --- 5. Detach (slug is now known — D7) ---
      if (opts.detach && !isDetachedChild(process.env as Record<string, string | undefined>)) {
        return await detachSelf({
          args: process.argv.slice(2),
          repoRoot,
          slug,
          env: process.env as Record<string, string | undefined>,
        });
      }

      // --- 6. Rebind: verify checkpoint and set up workspace ---
      let verified: import("../core/attach/verify-checkpoint.js").VerifiedCheckpoint;
      try {
        verified = await runAttachVerification({
          cwd: repoRoot,
          branch: resolved.branch,
          spawnFn,
          expectedRepo: { owner, name: repo },
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
      // Use the slug from the verified checkpoint — not the resolver's preliminary slug —
      // so that runResumeCore always receives the identity-confirmed value.
      slug = verified.slug;
    }

    // Detach for the local-state short-circuit path (slug known from local state)
    if (!needsRebind && opts.detach && !isDetachedChild(process.env as Record<string, string | undefined>)) {
      return await detachSelf({
        args: process.argv.slice(2),
        repoRoot,
        slug,
        env: process.env as Record<string, string | undefined>,
      });
    }

    // --- 7. Resume ---
    return await runResumeCore(slug, {
      from: opts.from,
      force: opts.force,
      logLevel: opts.logLevel,
      cwd: repoRoot,
      repoRoot,
      prompt: opts.prompt,
      json: opts.json,
      noWorktree: opts.noWorktree,
      applyCanon: opts.applyCanon,
      adoptCommits: opts.adoptCommits,
      wontfix: opts.wontfix,
      wontfixReason: opts.wontfixReason,
    });
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    logError(`resume --from-issue failed: ${(err as Error).message}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}

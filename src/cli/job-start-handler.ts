/**
 * CLI handler for `specrunner job start` (and its `run` alias).
 * Extracted from run.ts (T-19): uses static imports for from-issue.ts to
 * eliminate the value-import cycle that was previously hidden by await import().
 *
 * Dependency direction:
 *   job-start-handler → run.ts (runRunCore)
 *   job-start-handler → from-issue.ts (runFromIssue)
 *   from-issue.ts     → run.ts (runRunCore)   ← existing, unchanged
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
import { parseRequestMdRaw } from "../parser/request-md.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
import { logError, resolveLogLevel } from "../logger/stdout.js";
import { EXIT_CODE } from "../errors.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { resolveGitHubHost, resolveGitHubApiBaseUrl } from "../config/github-host.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { getOriginInfo } from "../git/remote.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { runRunCore } from "./run.js";
import { runFromIssue } from "./from-issue.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";

/**
 * Resolve a slug from a user-provided input (slug string, request.md path, or slug hint).
 * Returns the slug if resolvable, null otherwise.
 * Used by --detach to validate the slug before spawning the detached child.
 */
export function resolveSlugForDetach(input: string, cwd: string): string | null {
  if (SLUG_REGEX.test(input)) return input;

  const absPath = path.resolve(cwd, input);
  if (fs.existsSync(absPath)) {
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      const raw = parseRequestMdRaw(content, absPath);
      if (raw.slug && SLUG_REGEX.test(raw.slug)) return raw.slug;
    } catch {
      // ignore — fall through
    }
  }

  try {
    const resolved = storeResolve(cwd, input);
    if (fs.existsSync(resolved)) {
      const content = fs.readFileSync(resolved, "utf-8");
      const raw = parseRequestMdRaw(content, resolved);
      if (raw.slug && SLUG_REGEX.test(raw.slug)) return raw.slug;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * CLI handler for `specrunner job start` (and its `run` alias).
 * Returns the exit code; caller (dispatch boundary) is responsible for process.exit().
 * The startWithIssueLink dynamic import (../core/issue-target/start.js) is intentionally
 * retained because it is a ../core module (not a ./ module) and is not part of any cycle.
 */
export async function handleJobStart(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const fromIssue = typeof parsed.flags["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;
  const hasPositional = parsed.positional !== undefined;

  // --- Presence check: need exactly one of positional or --from-issue ---
  if (fromIssue === undefined && !hasPositional) {
    logError("Usage error: 'job start' requires a <slug|file> positional or --from-issue <n>");
    return EXIT_CODE.ARG_ERROR;
  }

  // --- Exclusivity: --from-issue + positional ---
  if (fromIssue !== undefined && hasPositional) {
    logError("Usage error: --from-issue and positional <slug|file> are mutually exclusive");
    return EXIT_CODE.ARG_ERROR;
  }

  // --- Exclusivity: --from-issue + --issue ---
  if (fromIssue !== undefined && parsed.flags["issue"] !== undefined) {
    logError("Usage error: --from-issue and --issue are mutually exclusive (--from-issue includes issue linkage)");
    return EXIT_CODE.ARG_ERROR;
  }

  if (parsed.flags["detach"] && parsed.flags["json"]) {
    logError("--detach and --json are mutually exclusive");
    return EXIT_CODE.ARG_ERROR;
  }

  // --- Route --from-issue before generic detach branch ---
  if (fromIssue !== undefined) {
    const logLevel = resolveLogLevel({
      quiet: !!parsed.flags["quiet"],
      verbose: !!parsed.flags["verbose"],
      debug: !!parsed.flags["debug"],
    });
    return await runFromIssue(
      fromIssue,
      { detach: !!parsed.flags["detach"], logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] },
      ctx,
    );
  }

  // --- Positional path (confirmed present) ---
  const requestMdPath = parsed.positional!;

  if (parsed.flags["detach"] && !isDetachedChild(process.env as Record<string, string | undefined>)) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    const slug = resolveSlugForDetach(requestMdPath, ctx?.repoRoot ?? process.cwd());
    if (!slug) {
      logError(`Cannot resolve slug from '${requestMdPath}'. Provide a valid slug or request.md path with --detach.`);
      return EXIT_CODE.GENERAL_ERROR;
    }
    return await detachSelf({
      args: process.argv.slice(2),
      repoRoot,
      slug,
      env: process.env as Record<string, string | undefined>,
    });
  }

  const logLevel = resolveLogLevel({
    quiet: !!parsed.flags["quiet"],
    verbose: !!parsed.flags["verbose"],
    debug: !!parsed.flags["debug"],
  });
  // --issue is now validated as integer by the parser (min: 1)
  const issue = typeof parsed.flags["issue"] === "number" ? parsed.flags["issue"] : undefined;

  // Positional + --issue: route through issue-target for Development linked branch registration
  if (issue !== undefined) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    let config;
    try {
      config = await loadConfigWithOverlay(repoRoot, repoRoot);
    } catch (err) {
      logError(`Failed to load config: ${(err as Error).message}`);
      return EXIT_CODE.GENERAL_ERROR;
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
    const { startWithIssueLink } = await import("../core/issue-target/start.js");
    return await startWithIssueLink({
      repoRoot,
      requestMdPath,
      issueNumber: issue,
      githubClient,
      owner,
      repo,
      // Closure carries the CLI flags (logLevel / json / no-worktree) so the issue-target
      // route preserves the same runRunCore contract as the plain positional route.
      startPrimitive: (p, opts) =>
        runRunCore(p, { ...opts, logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] }),
    });
  }

  return await runRunCore(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] });
}

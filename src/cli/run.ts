import * as path from "node:path";
import * as fs from "node:fs";
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { runPreflight } from "../core/preflight.js";
import { checkRuntimePrereqs, resolveRuntimeCredentials } from "../core/runtime/prereqs.js";
import { setLogLevel, logError, stderrWrite, resolveLogLevel, type LogLevel } from "../logger/stdout.js";
import { SpecRunnerError, EXIT_CODE } from "../errors.js";
import { createRuntime } from "../core/runtime/index.js";
import { PipelineRunCommand } from "../core/command/pipeline-run.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import { ensureDotSpecrunnerGitignore } from "../util/gitignore.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { createIssueFidelityComparator } from "../adapter/claude-code/issue-fidelity-comparator.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { parseRequestMdRaw } from "../parser/request-md.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { getOriginInfo } from "../git/remote.js";
import { isDetachedChild, detachSelf } from "../core/command/detach.js";
// runFromIssue is lazily imported inside handleJobStart to avoid a
// value-import cycle: from-issue.ts → run.ts → from-issue.ts

/**
 * Resolve the heartbeat interval (seconds) from config → env → TTY-aware default.
 * Returns 0 to disable the heartbeat.
 */
function resolveHeartbeatInterval(config: SpecRunnerConfig): number {
  // 1. config
  const cfgVal = config.progress?.heartbeatIntervalSec;
  if (cfgVal === null || cfgVal === 0) return 0;
  if (cfgVal !== undefined && cfgVal > 0) return cfgVal;

  // 2. env
  const envVal = process.env["SPECRUNNER_HEARTBEAT_INTERVAL"];
  if (envVal === "0" || envVal === "off") return 0;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }

  // 3. default: TTY → 30s, non-TTY → 60s
  return process.stdout.isTTY ? 30 : 60;
}

export async function runRunCore(
  requestMdPath: string,
  options: { cwd?: string; logLevel?: LogLevel; json?: boolean; noWorktree?: boolean; issue?: number; inboxOrigin?: boolean; onFeatureBranchCreated?: (baseOid: string, branchName: string) => Promise<void> },
): Promise<number> {
  setLogLevel(options.logLevel ?? "default");
  const cwd = options.cwd ?? process.cwd();
  let absolutePath = path.resolve(cwd, requestMdPath);

  if (!fs.existsSync(absolutePath)) {
    const slugResolved = storeResolve(cwd, requestMdPath);
    if (!fs.existsSync(slugResolved)) {
      logError(`'${requestMdPath}' is neither a file path nor an active request slug.`);
      stderrWrite("Hint: Use 'specrunner request ls' to see available slugs.");
      return 1;
    }
    absolutePath = slugResolved;
  }

  let preflightResult: Awaited<ReturnType<typeof runPreflight>>;
  try {
    preflightResult = await runPreflight(absolutePath, cwd, process.env as Record<string, string | undefined>, {
      prereqChecker: { check: checkRuntimePrereqs },
      credentialsResolver: { resolve: resolveRuntimeCredentials },
    });
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      if (err.hint) stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    logError((err as Error).message);
    return 1;
  }

  const { config, repo, githubToken } = preflightResult;

  // Ensure .gitignore covers .specrunner/ (idempotent)
  await ensureDotSpecrunnerGitignore(cwd);

  const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);
  const anthropicResult = config.runtime === "managed"
    ? await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>)
    : await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, { optional: true });
  const sessionClient = anthropicResult
    ? createAnthropicSessionClient(createAnthropicClient(anthropicResult.apiKey))
    : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken);
  const events = new EventBus();
  const logLevel = options.logLevel ?? "default";
  const slug = preflightResult.request.slug;
  const progress = wireProgressDisplay(events, {
    logLevel,
    slug,
    heartbeatIntervalSec: resolveHeartbeatInterval(config),
  });
  try {
    return await new PipelineRunCommand(
      runtime,
      events,
      absolutePath,
      preflightResult,
      { ...options, noWorktree: options.noWorktree, issue: options.issue },
      (config) => createIssueFidelityComparator(config),
    ).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  } finally {
    progress.dispose();
  }
}

export async function runRun(
  requestMdPath: string,
  options: { cwd?: string; logLevel?: LogLevel; json?: boolean; noWorktree?: boolean; issue?: number; inboxOrigin?: boolean; onFeatureBranchCreated?: (baseOid: string, branchName: string) => Promise<void> },
): Promise<void> {
  process.exit(await runRunCore(requestMdPath, options));
}

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
 * Extracted from command-registry.ts inline runJobHandler (T-05).
 */
export async function handleJobStart(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  const fromIssue = typeof parsed.flags["from-issue"] === "number" ? parsed.flags["from-issue"] : undefined;
  const hasPositional = parsed.positional !== undefined;

  // --- Presence check: need exactly one of positional or --from-issue ---
  if (fromIssue === undefined && !hasPositional) {
    logError("Usage error: 'job start' requires a <slug|file> positional or --from-issue <n>");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Exclusivity: --from-issue + positional ---
  if (fromIssue !== undefined && hasPositional) {
    logError("Usage error: --from-issue and positional <slug|file> are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Exclusivity: --from-issue + --issue ---
  if (fromIssue !== undefined && parsed.flags["issue"] !== undefined) {
    logError("Usage error: --from-issue and --issue are mutually exclusive (--from-issue includes issue linkage)");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  if (parsed.flags["detach"] && parsed.flags["json"]) {
    logError("--detach and --json are mutually exclusive");
    process.exit(EXIT_CODE.ARG_ERROR);
  }

  // --- Route --from-issue before generic detach branch ---
  // (lazy import breaks value-import cycle with from-issue.ts)
  if (fromIssue !== undefined) {
    const logLevel = resolveLogLevel({
      quiet: !!parsed.flags["quiet"],
      verbose: !!parsed.flags["verbose"],
      debug: !!parsed.flags["debug"],
    });
    const { runFromIssue } = await import("./from-issue.js");
    const code = await runFromIssue(
      fromIssue,
      { detach: !!parsed.flags["detach"], logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] },
      ctx,
    );
    process.exit(code);
  }

  // --- Positional path (confirmed present) ---
  const requestMdPath = parsed.positional!;

  if (parsed.flags["detach"] && !isDetachedChild(process.env as Record<string, string | undefined>)) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    const slug = resolveSlugForDetach(requestMdPath, ctx?.repoRoot ?? process.cwd());
    if (!slug) {
      logError(`Cannot resolve slug from '${requestMdPath}'. Provide a valid slug or request.md path with --detach.`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const code = await detachSelf({
      args: process.argv.slice(2),
      repoRoot,
      slug,
      env: process.env as Record<string, string | undefined>,
    });
    process.exit(code);
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
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const githubHost = resolveGitHubHost(config.github);
    const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
    let githubToken: string;
    try {
      const result = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
      githubToken = result.token;
    } catch (err) {
      logError(`Failed to resolve GitHub token: ${(err as Error).message}`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    let owner: string;
    let repo: string;
    try {
      const origin = await getOriginInfo(repoRoot, githubHost);
      owner = origin.owner;
      repo = origin.name;
    } catch (err) {
      logError(`Failed to resolve git origin: ${(err as Error).message}`);
      process.exit(EXIT_CODE.GENERAL_ERROR);
    }
    const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);
    const { startWithIssueLink } = await import("../core/issue-target/start.js");
    const code = await startWithIssueLink({
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
    process.exit(code);
  }

  await runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"], noWorktree: !!parsed.flags["no-worktree"] });
}

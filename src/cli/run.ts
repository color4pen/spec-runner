import * as path from "node:path";
import * as fs from "node:fs";
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { runPreflight } from "../core/preflight.js";
import { checkRuntimePrereqs, resolveRuntimeCredentials } from "../core/runtime/prereqs.js";
import { setLogLevel, logError, stderrWrite, type LogLevel } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";
import { createRuntime } from "../core/runtime/index.js";
import { PipelineRunCommand } from "../core/command/pipeline-run.js";
import { EventBus } from "../core/event/event-bus.js";
import { wireProgressDisplay } from "./progress.js";
import { ensureDotSpecrunnerGitignore } from "../util/gitignore.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { registerExitGuard } from "../core/lifecycle/exit-guard.js";

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
  options: { cwd?: string; logLevel?: LogLevel },
): Promise<number> {
  setLogLevel(options.logLevel ?? "default");
  const cwd = options.cwd ?? process.cwd();
  registerExitGuard(cwd);
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

  const githubClient = createGitHubClient(fetch, githubToken);
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
    return await new PipelineRunCommand(runtime, events, absolutePath, preflightResult, options).execute();
  } catch (err) {
    logError((err as Error).message);
    return 1;
  } finally {
    progress.dispose();
  }
}

export async function runRun(
  requestMdPath: string,
  options: { cwd?: string; logLevel?: LogLevel },
): Promise<void> {
  process.exit(await runRunCore(requestMdPath, options));
}

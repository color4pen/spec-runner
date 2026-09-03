/**
 * CLI entry point for `specrunner doctor`.
 * Assembles DoctorContext from real implementations and runs all checks.
 * Design D9: exit code 0 (pass/warn), 1 (fail), 2 (crash — handled in bin/specrunner.ts).
 */
import * as nodeFsSync from "node:fs";
import * as nodeFsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import { promisify } from "node:util";

import { runChecks } from "../core/doctor/runner.js";
import { commonChecks, managedChecks, localChecks } from "../core/doctor/checks/index.js";
import { formatHuman, formatJson } from "../core/doctor/formatter.js";
import type { DoctorContext, DoctorFs, DoctorConfig, DoctorGitHubClient, ExecFileFunction } from "../core/doctor/types.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { getConfigPath } from "../util/xdg.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import { stripSecrets } from "../util/env-filter.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { resolveClaudeCodeOAuthToken } from "../core/credentials/claude-code.js";
import { stdoutWrite, stderrWrite } from "../logger/stdout.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { EXIT_CODE } from "../errors.js";

const execFileAsync = promisify(childProcess.execFile);

/**
 * Build a DoctorFs from real fs modules.
 */
function buildRealFs(): DoctorFs {
  return {
    stat: nodeFsPromises.stat as DoctorFs["stat"],
    existsSync: nodeFsSync.existsSync,
    readdirSync: (p: string) => nodeFsSync.readdirSync(p) as string[],
    access: nodeFsPromises.access,
    constants: nodeFsSync.constants,
    readFile: (p: string, enc: "utf-8") => nodeFsPromises.readFile(p, enc),
  };
}

/**
 * Build a DoctorConfig from an already-loaded SpecRunnerConfig (or null if load failed).
 * Pass loadError when the config file exists but failed to parse.
 * Pass loadErrorPath to indicate which file caused the error (for doctor hint generation).
 */
function buildDoctorConfig(rawConfig: SpecRunnerConfig | null, loadError?: string, loadErrorPath?: string): DoctorConfig {
  return {
    loaded: rawConfig !== null,
    loadError,
    loadErrorPath,
    get(dotPath: string): unknown {
      if (!rawConfig) return undefined;
      const parts = dotPath.split(".");
      let current: unknown = rawConfig;
      for (const part of parts) {
        if (typeof current !== "object" || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    },
  };
}

/**
 * Build the execFile adapter.
 *
 * Injectable for testing: pass a custom env snapshot and/or a mock execFileAsyncImpl.
 * Production callers use no-arg form — defaults strip secrets from process.env.
 *
 * D4 allowlist note: doctor.ts is a composition-root that needs execFile's
 * `timeout` + `AbortSignal` options, which are not offered by the git-exec seam.
 * It strips secrets at the call site instead of routing through the seam.
 */
export const buildExecFile = (
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  execFileAsyncImpl: typeof execFileAsync = execFileAsync,
): ExecFileFunction => {
  return async (file: string, args: string[], options?: { timeout?: number; signal?: AbortSignal }) => {
    const result = await execFileAsyncImpl(file, args, {
      timeout: options?.timeout,
      signal: options?.signal,
      env: stripSecrets(env) as Record<string, string>,
    });
    return { stdout: result.stdout as string, stderr: result.stderr as string };
  };
};

/**
 * Run the doctor command.
 * @param opts.json        - Whether to output JSON instead of human-readable format
 * @param opts.repoRoot    - Pre-resolved repo root from dispatch (pass undefined to auto-resolve).
 *                           null means invoker is outside a git repo; repo checks will fail.
 * @param opts.invokerCwd  - The actual working directory from which the command was invoked.
 *                           Defaults to process.cwd() when not provided (role (a) default).
 * @returns Exit code: 0 (all pass/warn) or 1 (any fail).
 *          Caller returns this exit code to the dispatch boundary (bin/specrunner.ts).
 *          Unexpected errors propagate to `handleDoctor`, which catches them and returns 1.
 */
export async function runDoctor(opts: {
  json: boolean;
  repoRoot?: string | null;
  invokerCwd?: string;
}): Promise<number> {
  // Role (a): invokerCwd defaults to process.cwd() — the repo root discovery origin.
  const invokerCwd = opts.invokerCwd ?? process.cwd();
  // Use the pre-resolved repoRoot from dispatch when provided; fall back to auto-resolution.
  const repoRoot = opts.repoRoot !== undefined
    ? opts.repoRoot
    : await resolveRepoRoot(invokerCwd);

  // Load config (best-effort — checks will report failure if unavailable)
  let rawConfig: SpecRunnerConfig | null = null;
  let configLoadError: string | undefined;
  let configLoadErrorPath: string | undefined;
  try {
    // Pass the already-resolved repoRoot so loadConfigWithOverlay skips its internal
    // resolveRepoRoot call (avoids a duplicate resolution when repoRoot is pre-supplied).
    rawConfig = await loadConfigWithOverlay(invokerCwd, repoRoot);
  } catch (err: unknown) {
    // Config not available — propagate reason so config-file-exists can distinguish
    // malformed JSON from ENOENT.
    configLoadError = err instanceof Error ? err.message : String(err);
    // Determine which file failed so doctor can point to the right path in its hint.
    // loadConfig labels errors with "project local config" or "user global config".
    // The project-local config lives at the repo root, not necessarily cwd.
    if (configLoadError.includes("project local config")) {
      // Reuse the already-resolved repoRoot instead of calling resolveRepoRoot again.
      if (repoRoot) {
        configLoadErrorPath = path.join(repoRoot, ".specrunner", "config.json");
      }
    } else if (configLoadError.includes("user global config")) {
      configLoadErrorPath = getConfigPath();
    }
  }

  const githubHost = resolveGitHubHost(rawConfig?.github);
  const githubApiBaseUrl = resolveGitHubApiBaseUrl(rawConfig?.github);

  // Resolve GitHub token (best-effort — doctor works even without token)
  let resolvedGitHubToken: string | null = null;
  let githubTokenSource: "credentials" | "env" | "gh" | null = null;
  try {
    const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
    resolvedGitHubToken = resolved.token;
    githubTokenSource = resolved.source;
  } catch {
    // Token not found — checks will report failure
  }

  // Resolve Anthropic API key (best-effort — doctor works even without key)
  let resolvedSpecRunnerApiKey: string | null = null;
  let specRunnerApiKeySource: "credentials" | "env" | null = null;
  try {
    const resolved = await resolveSpecRunnerApiKey(
      process.env as Record<string, string | undefined>,
      { optional: true },
    );
    if (resolved) {
      resolvedSpecRunnerApiKey = resolved.apiKey;
      specRunnerApiKeySource = resolved.source;
    }
  } catch {
    // resolver with optional:true doesn't throw, but safety catch
  }

  // Resolve Claude Code OAuth token (best-effort — doctor works even without token)
  let resolvedClaudeCodeOAuthToken: string | null = null;
  let claudeCodeOAuthTokenSource: "credentials" | "env" | null = null;
  try {
    const resolved = await resolveClaudeCodeOAuthToken(
      process.env as Record<string, string | undefined>,
      { optional: true },
    );
    if (resolved) {
      resolvedClaudeCodeOAuthToken = resolved.token;
      claudeCodeOAuthTokenSource = resolved.source;
    }
  } catch {
    // resolver with optional:true doesn't throw, but safety catch
  }

  // Build GitHub client (uses resolved token — may be null → empty string fallback)
  const githubClient: DoctorGitHubClient = createGitHubClient(globalThis.fetch, resolvedGitHubToken ?? "", githubApiBaseUrl);

  // Assemble DoctorContext
  const ctx: DoctorContext = {
    cwd: invokerCwd,
    repoRoot,
    env: process.env as Record<string, string | undefined>,
    now: new Date(),
    fetch: globalThis.fetch,
    fs: buildRealFs(),
    execFile: buildExecFile(),
    config: buildDoctorConfig(rawConfig, configLoadError, configLoadErrorPath),
    githubClient,
    homeDir: os.homedir(),
    processVersion: process.version,
    platform: process.platform,
    resolvedGitHubToken,
    githubTokenSource,
    resolvedSpecRunnerApiKey,
    specRunnerApiKeySource,
    resolvedClaudeCodeOAuthToken,
    claudeCodeOAuthTokenSource,
    configPath: getConfigPath(),
  };

  // Run runtime-specific checks
  const runtime = rawConfig?.runtime ?? "local";
  const checks = [
    ...commonChecks,
    ...(runtime === "managed" ? managedChecks : localChecks),
  ];
  const results = await runChecks(checks, ctx);

  // Output
  const output = opts.json ? formatJson(results) : formatHuman(results);
  stdoutWrite(output + "\n");

  // Return exit code: 1 if any fail, 0 otherwise
  const hasFail = results.some((r) => r.status === "fail");
  return hasFail ? 1 : 0;
}

/**
 * CLI handler for `specrunner doctor`.
 * Returns the exit code; caller (dispatch boundary) is responsible for process.exit().
 * The catch is kept (not deleted) because doctor uses a flat Fatal:/1 for all errors,
 * not the SpecRunnerError-aware two-branch conversion that the dispatch boundary provides.
 */
/* c8 ignore next 13 */
export async function handleDoctor(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  // default action: run diagnostics
  try {
    return await runDoctor({
      json: !!parsed.flags["json"],
      repoRoot: ctx?.repoRoot,
      invokerCwd: ctx?.invokerCwd,
    });
  } catch (err: unknown) {
    stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}

/**
 * CLI handler for `specrunner doctor repair <slug>`.
 * Returns the exit code; caller (dispatch boundary) is responsible for process.exit().
 * Dynamic import is maintained (not converted to static import).
 */
/* c8 ignore next 17 */
export async function handleDoctorRepair(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const slug = parsed.positional;
  if (!slug) {
    stderrWrite("Error: specrunner doctor repair requires a <slug> argument\n");
    stderrWrite("Usage: specrunner doctor repair <slug>\n");
    return 2;
  }
  const repoRoot = ctx?.repoRoot ?? process.cwd();
  try {
    const { repairSlugOccupancySidecar } = await import("../core/occupancy/repair.js");
    const result = await repairSlugOccupancySidecar(repoRoot, slug);
    stderrWrite(result.message + "\n");
    return 0;
  } catch (err: unknown) {
    stderrWrite(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}

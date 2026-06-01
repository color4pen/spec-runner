/**
 * Fail-fast validation checks for specrunner run command.
 * Each check is independent and ordered — first failure exits.
 */

import { loadConfig } from "../config/store.js";
import { checkConfigComplete } from "../config/schema.js";
import { getOriginInfo } from "../git/remote.js";
import { parseRequestMd } from "../parser/request-md.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { requirementsFor } from "../core/credentials/requirements.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { logInfo } from "../logger/stdout.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

export interface PreflightResult {
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  /** Resolved GitHub token (from credentials file or GITHUB_TOKEN env var). */
  githubToken: string;
  /** Source of the resolved GitHub token. */
  githubTokenSource: "credentials" | "env";
  /** Resolved Anthropic API key (present only for managed runtime). */
  specRunnerApiKey?: string;
  /** Source of the resolved Anthropic API key. */
  specRunnerApiKeySource?: "credentials" | "env";
}

/**
 * Check runtime-specific prerequisites using declarative requirements matrix.
 * Returns { field, hint } when a prerequisite is missing, null when all are satisfied.
 * For non-managed runtimes, only checks non-anthropic requirements.
 */
export async function checkRuntimePrereqs(
  cfg: SpecRunnerConfig,
  env: Record<string, string | undefined>,
): Promise<{ field: string; hint: string } | null> {
  const requirements = requirementsFor(cfg.runtime ?? "local");

  for (const req of requirements) {
    if (req.key === "anthropic.apiKey") {
      try {
        await resolveSpecRunnerApiKey(env);
      } catch {
        return {
          field: req.envVar,
          hint: "Save an API key via 'specrunner login --provider anthropic', set SPECRUNNER_API_KEY env var, then run 'specrunner managed setup'.",
        };
      }
    }
  }

  // Check non-credential runtime requirements (agents config, environment config)
  if (cfg.runtime === "managed") {
    if (!cfg.agents?.["design"]?.agentId) {
      return {
        field: "agents.design.agentId",
        hint: "Run 'specrunner managed setup' first.",
      };
    }
    if (!cfg.environment?.id) {
      return {
        field: "environment.id",
        hint: "Run 'specrunner managed setup' first.",
      };
    }
  }

  return null;
}

/**
 * Run all preflight checks in order.
 * Throws SpecRunnerError on the first failing check.
 */
export async function runPreflight(
  requestMdPath: string,
  cwd: string,
  env: Record<string, string | undefined>,
): Promise<PreflightResult> {
  // Step 1: Config exists (load user global + project local overlay from repo root)
  // Resolve repo root from cwd for project local config overlay support.
  // resolveRepoRoot returns null gracefully when not in a git repo (loadConfig handles null → user-global-only).
  const repoRoot = await resolveRepoRoot(cwd);
  const config = await loadConfig(repoRoot ?? undefined);

  // Step 2: Config complete (all required fields present — github check moved here)
  const incomplete = checkConfigComplete(config);
  if (incomplete) {
    throw new SpecRunnerError(
      "CONFIG_INCOMPLETE",
      incomplete.hint,
      incomplete.hint,
    );
  }

  // Step 2.5: GitHub token (required for PR operations via REST API)
  let githubToken: string;
  let githubTokenSource: "credentials" | "env";
  try {
    const resolved = await resolveGitHubToken(env);
    githubToken = resolved.token;
    githubTokenSource = resolved.source;
    logInfo(`GitHub token source: ${resolved.source}`);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      throw new SpecRunnerError(
        ERROR_CODES.RUNTIME_PREREQ_MISSING,
        err.hint,
        err.message,
      );
    }
    throw err;
  }

  // Step 2.7: Runtime prerequisites (managed-specific)
  const prereq = await checkRuntimePrereqs(config, env);
  if (prereq) {
    throw new SpecRunnerError(
      ERROR_CODES.RUNTIME_PREREQ_MISSING,
      prereq.hint,
      `Missing runtime prerequisite: ${prereq.field}.`,
    );
  }

  // Resolve Anthropic API key for managed runtime (best-effort, prereq check already validated)
  let specRunnerApiKey: string | undefined;
  let specRunnerApiKeySource: "credentials" | "env" | undefined;
  if (config.runtime === "managed") {
    try {
      const resolved = await resolveSpecRunnerApiKey(
        env,
        { optional: true },
      );
      if (resolved) {
        specRunnerApiKey = resolved.apiKey;
        specRunnerApiKeySource = resolved.source;
      }
    } catch {
      // Already validated in checkRuntimePrereqs; ignore
    }
  }

  // Step 3 & 4: Git repo + GitHub remote
  const repo = await getOriginInfo(cwd);

  // Step 5: request.md parseable
  const request = await parseRequestMd(requestMdPath);

  return { config, repo, request, githubToken, githubTokenSource, specRunnerApiKey, specRunnerApiKeySource };
}

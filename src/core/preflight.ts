/**
 * Fail-fast validation checks for specrunner run command.
 * Each check is independent and ordered — first failure exits.
 */

import { loadConfig } from "../config/store.js";
import { checkConfigComplete } from "../config/schema.js";
import { getOriginInfo } from "../git/remote.js";
import { parseRequestMd } from "../parser/request-md.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

export interface PreflightResult {
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  /** Resolved GitHub token (from credentials file or GITHUB_TOKEN env var). */
  githubToken: string;
}

/**
 * Check runtime-specific prerequisites for the managed runtime.
 * Returns { field, hint } when a prerequisite is missing, null when all are satisfied.
 * For non-managed runtimes, always returns null.
 */
export function checkRuntimePrereqs(
  cfg: SpecRunnerConfig,
  env: Record<string, string | undefined>,
): { field: string; hint: string } | null {
  if (cfg.runtime !== "managed") return null;

  if (!env["SPECRUNNER_API_KEY"]) {
    return {
      field: "SPECRUNNER_API_KEY",
      hint: "Set SPECRUNNER_API_KEY env var, then run 'specrunner managed setup'.",
    };
  }
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
  return null;
}

/**
 * Run all preflight checks in order.
 * Throws SpecRunnerError on the first failing check.
 */
export async function runPreflight(
  requestMdPath: string,
  cwd: string,
): Promise<PreflightResult> {
  // Step 1: Config exists
  const config = await loadConfig();

  // Step 2: Config complete (all required fields present — github check moved here)
  const incomplete = checkConfigComplete(config);
  if (incomplete) {
    throw new SpecRunnerError(
      "CONFIG_INCOMPLETE",
      incomplete.hint,
      incomplete.hint,
    );
  }

  // Step 2.5: GitHub token (both runtimes require it for PR creation / gh CLI)
  let githubToken: string;
  try {
    const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
    githubToken = resolved.token;
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
  const prereq = checkRuntimePrereqs(config, process.env as Record<string, string | undefined>);
  if (prereq) {
    throw new SpecRunnerError(
      ERROR_CODES.RUNTIME_PREREQ_MISSING,
      prereq.hint,
      `Missing runtime prerequisite: ${prereq.field}.`,
    );
  }

  // Step 3 & 4: Git repo + GitHub remote
  const repo = await getOriginInfo(cwd);

  // Step 5: request.md parseable
  const request = await parseRequestMd(requestMdPath);

  return { config, repo, request, githubToken };
}

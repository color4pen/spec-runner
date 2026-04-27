/**
 * Fail-fast validation checks for specrunner run command.
 * Each check is independent and ordered — first failure exits.
 */

import { loadConfig } from "../config/store.js";
import { checkConfigComplete } from "../config/schema.js";
import { getOriginInfo } from "../git/remote.js";
import { parseRequestMd } from "../parser/request-md.js";
import { SpecRunnerError } from "../errors.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { OriginInfo } from "../git/remote.js";
import type { ParsedRequest } from "../parser/request-md.js";

export interface PreflightResult {
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
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

  // Step 2: Config complete (all required fields present)
  const incomplete = checkConfigComplete(config);
  if (incomplete) {
    throw new SpecRunnerError(
      "CONFIG_INCOMPLETE",
      incomplete.hint,
      incomplete.hint,
    );
  }

  // Step 3 & 4: Git repo + GitHub remote
  const repo = await getOriginInfo(cwd);

  // Step 5: request.md parseable
  const request = await parseRequestMd(requestMdPath);

  return { config, repo, request };
}

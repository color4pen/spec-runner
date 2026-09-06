/**
 * GitHub integration configuration resolution.
 *
 * Resolves whether GitHub integration is enabled for the current project,
 * and traces which configuration layer declared the setting.
 *
 * Separation of concerns:
 *   - resolveGitHubIntegrationConfig: derive { enabled } from a loaded config.
 *   - traceGitHubIntegration: derive { enabled, source } from a full load result,
 *     attributing the setting to the layer that declared it.
 */
import type { SpecRunnerConfig } from "./schema.js";
import type { SourceAwareConfigLoadResult } from "./store.js";

export type GitHubIntegrationSource = "project-local" | "user-global" | "default";

export interface GitHubIntegrationConfig {
  /** Whether GitHub integration is enabled. Default: true. */
  enabled: boolean;
}

export interface TracedGitHubIntegrationConfig extends GitHubIntegrationConfig {
  /** Which configuration layer declared the enabled value. */
  source: GitHubIntegrationSource;
}

/**
 * Derive GitHub integration config from a loaded SpecRunnerConfig.
 *
 * `config.github?.enabled ?? true` — absent means enabled (backward compatible).
 */
export function resolveGitHubIntegrationConfig(config: SpecRunnerConfig): GitHubIntegrationConfig {
  return { enabled: config.github?.enabled ?? true };
}

/**
 * Derive GitHub integration config with source attribution from a full config load result.
 *
 * Priority order: project-local → user-global → default (true).
 * The source is set to the first layer that explicitly declares `github.enabled`.
 */
export function traceGitHubIntegration(
  loadResult: SourceAwareConfigLoadResult,
): TracedGitHubIntegrationConfig {
  // Check project-local first (highest priority)
  const projectLocalRaw = loadResult.projectLocal.migrated;
  if (
    projectLocalRaw !== null &&
    typeof projectLocalRaw === "object" &&
    projectLocalRaw !== null
  ) {
    const pl = projectLocalRaw as Record<string, unknown>;
    const github = pl["github"];
    if (
      typeof github === "object" &&
      github !== null &&
      "enabled" in github &&
      typeof (github as Record<string, unknown>)["enabled"] === "boolean"
    ) {
      return {
        enabled: (github as Record<string, unknown>)["enabled"] as boolean,
        source: "project-local",
      };
    }
  }

  // Check user-global next
  const userGlobalRaw = loadResult.userGlobal.migrated;
  if (
    userGlobalRaw !== null &&
    typeof userGlobalRaw === "object" &&
    userGlobalRaw !== null
  ) {
    const ug = userGlobalRaw as Record<string, unknown>;
    const github = ug["github"];
    if (
      typeof github === "object" &&
      github !== null &&
      "enabled" in github &&
      typeof (github as Record<string, unknown>)["enabled"] === "boolean"
    ) {
      return {
        enabled: (github as Record<string, unknown>)["enabled"] as boolean,
        source: "user-global",
      };
    }
  }

  // Default: enabled = true
  return { enabled: true, source: "default" };
}

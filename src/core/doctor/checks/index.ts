/**
 * Aggregated list of DoctorChecks.
 * Execution order: runtime → config → env → auth → repo → agents → storage.
 *
 * commonChecks: checks run for all runtimes (GitHub-enabled path)
 * githubChecks: checks run only when GitHub integration is enabled (T-12)
 * nonGithubChecks: checks run when GitHub integration is disabled (T-12)
 * managedChecks: checks run only for managed runtime (5)
 * localChecks: checks run only for local runtime (1)
 * selectChecks(runtime, githubEnabled): returns the right check set (T-12)
 */
import type { DoctorCheck } from "../types.js";

// Runtime
import { nodeVersionCheck } from "./runtime/node.js";
import { packageManagerCheck } from "./runtime/package-manager.js";
import { gitVersionCheck } from "./runtime/git.js";
import { codexCliCheck } from "./runtime/codex-cli.js";
import { aozuCliCheck } from "./runtime/aozu-cli.js";

// Config
import { configFileExistsCheck } from "./config/file-exists.js";
import { managedKeyPresentCheck } from "./config/managed-key-present.js";
import { githubTokenPresentCheck } from "./config/github-token-present.js";
import { claudeCodeTokenPresentCheck } from "./config/claude-code-token-present.js";

// Env
import { githubClientIdCheck } from "./env/github-client-id.js";

// Auth
import { managedKeyValidCheck } from "./auth/managed-key-valid.js";
import { githubTokenValidCheck } from "./auth/github-token-valid.js";

// Repo
import { gitRepositoryCheck } from "./repo/git-repository.js";
import { githubOriginCheck } from "./repo/github-origin.js";
import { gitOriginCheck } from "./repo/git-origin.js";
import { specrunnerProjectMdCheck } from "./repo/specrunner-project-md.js";
import { workflowStructureCheck } from "./repo/workflow-structure.js";

// Agents
import { agentsRegisteredCheck } from "./agents/agents-registered.js";
import { environmentRegisteredCheck } from "./agents/environment-registered.js";
import { definitionDriftCheck } from "./agents/definition-drift.js";
import { agentProviderAliveCheck } from "./agents/agent-provider-alive.js";
import { environmentProviderAliveCheck } from "./agents/environment-provider-alive.js";

// Storage
import { localStateWritableCheck } from "./storage/local-state-writable.js";
import { legacyJobsDirCheck } from "./storage/legacy-jobs-dir.js";
import { orphanSidecarsCheck } from "./storage/orphan-sidecars.js";
import { orphanWorktreesCheck } from "./storage/orphan-worktrees.js";
import { journalIntegrityCheck } from "./storage/journal-integrity.js";
import { createSlugOccupancyCheck } from "./storage/slug-occupancy.js";

/**
 * Checks that are always run (GitHub-enabled path: original behavior preserved).
 * For backward compat, this list is unchanged from before T-12.
 */
export const commonChecks: DoctorCheck[] = [
  // Runtime (4 — gh CLI check removed: no longer required)
  nodeVersionCheck,
  packageManagerCheck,
  gitVersionCheck,
  aozuCliCheck,
  // Config
  configFileExistsCheck,
  githubTokenPresentCheck,
  // Env
  githubClientIdCheck,
  // Auth
  githubTokenValidCheck,
  // Repo
  gitRepositoryCheck,
  githubOriginCheck,
  specrunnerProjectMdCheck,
  workflowStructureCheck,
  // Storage
  localStateWritableCheck,
  legacyJobsDirCheck,
  orphanSidecarsCheck,
  orphanWorktreesCheck,
  journalIntegrityCheck,
  createSlugOccupancyCheck(),
];

/**
 * T-12: Checks that require GitHub integration (token, API client, GitHub-specific origin).
 * Excluded from the check set when github.enabled: false.
 */
export const githubChecks: DoctorCheck[] = [
  githubTokenPresentCheck,
  githubClientIdCheck,
  githubTokenValidCheck,
  githubOriginCheck,
];

/**
 * T-12: Base checks that run regardless of GitHub integration status.
 * Excludes GitHub-specific checks (token, client-id, token-valid, github-origin).
 * Includes gitOriginCheck (generic origin presence check) when GitHub is disabled.
 */
const baseChecks: DoctorCheck[] = [
  // Runtime
  nodeVersionCheck,
  packageManagerCheck,
  gitVersionCheck,
  aozuCliCheck,
  // Config (no token check)
  configFileExistsCheck,
  // Repo (git-origin replaces github-origin)
  gitRepositoryCheck,
  gitOriginCheck,
  specrunnerProjectMdCheck,
  workflowStructureCheck,
  // Storage
  localStateWritableCheck,
  legacyJobsDirCheck,
  orphanSidecarsCheck,
  orphanWorktreesCheck,
  journalIntegrityCheck,
  createSlugOccupancyCheck(),
];

export const managedChecks: DoctorCheck[] = [
  managedKeyPresentCheck,
  managedKeyValidCheck,
  agentsRegisteredCheck,
  environmentRegisteredCheck,
  definitionDriftCheck,
  agentProviderAliveCheck,
  environmentProviderAliveCheck,
];

export const localChecks: DoctorCheck[] = [
  claudeCodeTokenPresentCheck,
  codexCliCheck,
];

/**
 * T-12: Select the right check set based on runtime and GitHub integration status.
 *
 * When githubEnabled is true (or undefined — legacy backward compat):
 *   → same as before T-12: commonChecks + runtime-specific checks
 * When githubEnabled is false:
 *   → baseChecks (no GitHub checks) + runtime-specific checks
 */
export function selectChecks(
  runtime: string,
  githubEnabled: boolean,
): DoctorCheck[] {
  const runtimeSpecific = runtime === "managed" ? managedChecks : localChecks;
  if (githubEnabled) {
    return [...commonChecks, ...runtimeSpecific];
  }
  // GitHub disabled: use base checks (no token/client/github-origin)
  return [...baseChecks, ...runtimeSpecific];
}


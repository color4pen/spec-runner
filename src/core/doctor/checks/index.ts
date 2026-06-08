/**
 * Aggregated list of DoctorChecks.
 * Execution order: runtime → config → env → auth → repo → agents → storage.
 *
 * commonChecks: checks run for all runtimes
 * managedChecks: checks run only for managed runtime (5)
 * localChecks: checks run only for local runtime (1)
 * allChecks: combined for backward compatibility
 */
import type { DoctorCheck } from "../types.js";

// Runtime
import { nodeVersionCheck } from "./runtime/node.js";
import { packageManagerCheck } from "./runtime/package-manager.js";
import { gitVersionCheck } from "./runtime/git.js";
import { codexCliCheck } from "./runtime/codex-cli.js";

// Config
import { configFileExistsCheck } from "./config/file-exists.js";
import { managedKeyPresentCheck } from "./config/managed-key-present.js";
import { githubTokenPresentCheck } from "./config/github-token-present.js";

// Env
import { githubClientIdCheck } from "./env/github-client-id.js";

// Auth
import { managedKeyValidCheck } from "./auth/managed-key-valid.js";
import { githubTokenValidCheck } from "./auth/github-token-valid.js";

// Repo
import { gitRepositoryCheck } from "./repo/git-repository.js";
import { githubOriginCheck } from "./repo/github-origin.js";
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

export const commonChecks: DoctorCheck[] = [
  // Runtime (3 — gh CLI check removed: no longer required)
  nodeVersionCheck,
  packageManagerCheck,
  gitVersionCheck,
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
  codexCliCheck,
];

/**
 * All checks combined (for backward compatibility).
 * For runtime-specific assembly, use commonChecks + managedChecks or commonChecks + localChecks.
 */
export const allChecks: DoctorCheck[] = [...commonChecks, ...managedChecks, ...localChecks];

// Re-export individual checks for direct import
export {
  nodeVersionCheck,
  packageManagerCheck,
  gitVersionCheck,
  codexCliCheck,
  configFileExistsCheck,
  managedKeyPresentCheck,
  githubTokenPresentCheck,
  githubClientIdCheck,
  managedKeyValidCheck,
  githubTokenValidCheck,
  gitRepositoryCheck,
  githubOriginCheck,
  specrunnerProjectMdCheck,
  workflowStructureCheck,
  agentsRegisteredCheck,
  environmentRegisteredCheck,
  definitionDriftCheck,
  agentProviderAliveCheck,
  environmentProviderAliveCheck,
  localStateWritableCheck,
  legacyJobsDirCheck,
};

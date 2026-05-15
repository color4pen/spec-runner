/**
 * Aggregated list of DoctorChecks.
 * Execution order: runtime → config → env → auth → repo → agents → storage.
 *
 * commonChecks: checks run for all runtimes (14)
 * managedChecks: checks run only for managed runtime (5)
 * localChecks: checks run only for local runtime (1)
 * allChecks: combined for backward compatibility
 */
import type { DoctorCheck } from "../types.js";

// Runtime
import { nodeVersionCheck } from "./runtime/node.js";
import { bunVersionCheck } from "./runtime/bun.js";
import { gitVersionCheck } from "./runtime/git.js";
import { codexCliCheck } from "./runtime/codex-cli.js";

// Config
import { configFileExistsCheck } from "./config/file-exists.js";
import { anthropicKeyPresentCheck } from "./config/anthropic-key-present.js";
import { githubTokenPresentCheck } from "./config/github-token-present.js";

// Env
import { githubClientIdCheck } from "./env/github-client-id.js";

// Auth
import { anthropicKeyValidCheck } from "./auth/anthropic-key-valid.js";
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
import { jobsWritableCheck } from "./storage/jobs-writable.js";
import { oldStateFilesCheck } from "./storage/old-state-files.js";

export const commonChecks: DoctorCheck[] = [
  // Runtime (3)
  nodeVersionCheck,
  bunVersionCheck,
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
  jobsWritableCheck,
  oldStateFilesCheck,
];

export const managedChecks: DoctorCheck[] = [
  anthropicKeyPresentCheck,
  anthropicKeyValidCheck,
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
  bunVersionCheck,
  gitVersionCheck,
  codexCliCheck,
  configFileExistsCheck,
  anthropicKeyPresentCheck,
  githubTokenPresentCheck,
  githubClientIdCheck,
  anthropicKeyValidCheck,
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
  jobsWritableCheck,
  oldStateFilesCheck,
};

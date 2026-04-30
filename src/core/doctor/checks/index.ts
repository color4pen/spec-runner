/**
 * Aggregated list of all 18 DoctorChecks.
 * Execution order: runtime → config → env → auth → repo → agents → storage.
 */
import type { DoctorCheck } from "../types.js";

// Runtime
import { nodeVersionCheck } from "./runtime/node.js";
import { bunVersionCheck } from "./runtime/bun.js";
import { gitVersionCheck } from "./runtime/git.js";
import { openspecCheck } from "./runtime/openspec.js";

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
import { openspecProjectMdCheck } from "./repo/openspec-project-md.js";
import { workflowStructureCheck } from "./repo/workflow-structure.js";

// Agents
import { agentsRegisteredCheck } from "./agents/agents-registered.js";
import { environmentRegisteredCheck } from "./agents/environment-registered.js";
import { definitionDriftCheck } from "./agents/definition-drift.js";

// Storage
import { jobsWritableCheck } from "./storage/jobs-writable.js";
import { oldStateFilesCheck } from "./storage/old-state-files.js";

export const allChecks: DoctorCheck[] = [
  // Runtime (4)
  nodeVersionCheck,
  bunVersionCheck,
  gitVersionCheck,
  openspecCheck,
  // Config (3)
  configFileExistsCheck,
  anthropicKeyPresentCheck,
  githubTokenPresentCheck,
  // Env (1)
  githubClientIdCheck,
  // Auth (2)
  anthropicKeyValidCheck,
  githubTokenValidCheck,
  // Repo (4)
  gitRepositoryCheck,
  githubOriginCheck,
  openspecProjectMdCheck,
  workflowStructureCheck,
  // Agents (3)
  agentsRegisteredCheck,
  environmentRegisteredCheck,
  definitionDriftCheck,
  // Storage (2)
  jobsWritableCheck,
  oldStateFilesCheck,
];

// Re-export individual checks for direct import
export {
  nodeVersionCheck,
  bunVersionCheck,
  gitVersionCheck,
  openspecCheck,
  configFileExistsCheck,
  anthropicKeyPresentCheck,
  githubTokenPresentCheck,
  githubClientIdCheck,
  anthropicKeyValidCheck,
  githubTokenValidCheck,
  gitRepositoryCheck,
  githubOriginCheck,
  openspecProjectMdCheck,
  workflowStructureCheck,
  agentsRegisteredCheck,
  environmentRegisteredCheck,
  definitionDriftCheck,
  jobsWritableCheck,
  oldStateFilesCheck,
};

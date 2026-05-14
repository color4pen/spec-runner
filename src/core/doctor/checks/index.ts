/**
 * Aggregated list of all 17 DoctorChecks.
 * Execution order: runtime → config → env → auth → repo → agents → storage.
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

// Storage
import { jobsWritableCheck } from "./storage/jobs-writable.js";
import { oldStateFilesCheck } from "./storage/old-state-files.js";

export const allChecks: DoctorCheck[] = [
  // Runtime (3+1)
  nodeVersionCheck,
  bunVersionCheck,
  gitVersionCheck,
  codexCliCheck,
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
  specrunnerProjectMdCheck,
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
  jobsWritableCheck,
  oldStateFilesCheck,
};

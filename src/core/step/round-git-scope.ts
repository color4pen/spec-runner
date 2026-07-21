/**
 * Step-level re-export of round-git-scope pipeline utilities.
 *
 * Provides pipelineManagedPaths to commit-push.ts for scoped staging.
 * Decoupled from the pipeline module so the import path can be mocked in unit tests.
 */
export { pipelineManagedPaths } from "../pipeline/round-git-scope.js";

/**
 * Job-state GitHub integration contract helpers.
 *
 * Provides typed accessors for the githubIntegration field in JobState.
 * Legacy state files (field absent) are treated as GitHub-enabled for
 * backward compatibility.
 */
import type { JobState } from "./schema.js";
import { SpecRunnerError } from "../errors.js";

/**
 * Get the GitHub integration contract for a job.
 *
 * Returns `{ enabled: true }` for legacy state files that lack the field,
 * preserving backward compatibility.
 */
export function getGitHubIntegration(state: { githubIntegration?: { enabled: boolean } }): { enabled: boolean } {
  return state.githubIntegration ?? { enabled: true };
}

/**
 * Require that the job's GitHub integration is enabled AND that the state
 * has GitHub repository identity (owner + name).
 *
 * Throws `GITHUB_INTEGRATION_DISABLED` when the contract is disabled.
 * Throws `GITHUB_INTEGRATION_REQUIRED` when owner/name are missing despite
 * the contract being enabled (data integrity guard).
 *
 * @returns The GitHub repository identity { owner, name }.
 */
export function requireGitHubRepository(state: JobState): { owner: string; name: string } {
  const contract = getGitHubIntegration(state);
  if (!contract.enabled) {
    throw new SpecRunnerError(
      "GITHUB_INTEGRATION_DISABLED",
      "This operation requires GitHub integration, which is disabled for this job. " +
        "The job was started with github.enabled: false in the project config.",
      "GitHub integration is disabled for this job.",
    );
  }
  const { owner, name } = state.repository;
  if (!owner || !name) {
    throw new SpecRunnerError(
      "GITHUB_INTEGRATION_REQUIRED",
      "This job requires GitHub repository identity (owner and name) but none was recorded. " +
        "This may indicate a corrupted job state.",
      "GitHub repository identity (owner/name) is missing from job state.",
    );
  }
  return { owner, name };
}

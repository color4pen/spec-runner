/**
 * applyGitHubIntegration — pipeline terminal selector.
 *
 * When GitHub integration is disabled, the pipeline cannot end with pr-create
 * (no GitHub client is available). This function rewrites the descriptor to
 * route transitions that would go to "pr-create" directly to "end" instead,
 * and removes "pr-create" from the step set and roles.
 *
 * When enabled, the base descriptor is returned with reference identity preserved
 * (no allocation) so callers can use `===` to check if anything changed.
 *
 * B-5: Pure function — no I/O, no subprocess, no import of adapters.
 */
import type { PipelineDescriptor } from "./types.js";

const PR_CREATE = "pr-create";

/**
 * Apply the GitHub integration contract to a pipeline descriptor.
 *
 * @param descriptor The base pipeline descriptor from the registry.
 * @param contract   The GitHub integration contract for this job.
 * @returns          When enabled: `descriptor` unchanged (same reference).
 *                   When disabled: a new descriptor with pr-create removed.
 */
export function applyGitHubIntegration(
  descriptor: PipelineDescriptor,
  contract: { enabled: boolean },
): PipelineDescriptor {
  if (contract.enabled) {
    // GitHub enabled: no changes — return same reference (reference identity preserved).
    return descriptor;
  }

  // GitHub disabled: rewrite descriptor to remove pr-create terminal.
  const newSteps = descriptor.steps.filter(([name]) => name !== PR_CREATE);

  const newTransitions = descriptor.transitions
    // Remove rows that originate from pr-create (its own outgoing transitions)
    .filter((t) => t.step !== PR_CREATE)
    // Replace rows targeting pr-create with "end"
    .map((t) => t.to === PR_CREATE ? { ...t, to: "end" as const } : t);

  const newRoles = Object.fromEntries(
    Object.entries(descriptor.roles).filter(([name]) => name !== PR_CREATE),
  );

  return {
    ...descriptor,
    steps: newSteps,
    transitions: newTransitions,
    roles: newRoles,
  };
}

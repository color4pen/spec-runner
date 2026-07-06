/**
 * Scope config resolver: applies per-repo forbidden surfaces to a pipeline descriptor.
 *
 * Design (composeReviewerDescriptor と同型の変換):
 *   - base.permissionScope absent → return base (reference-identical, zero overhead)
 *   - base.permissionScope present → spread-clone with forbidden replaced by config-resolved surfaces
 *
 * Import direction: core/pipeline → config (allowed existing edge, same as run.ts → config/getAgentId).
 * config → core の上向き import は作らない。
 */
import type { PipelineDescriptor } from "./types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import { resolvePipelineForbiddenSurfaces } from "../../config/schema.js";

/**
 * Apply per-repo forbidden surfaces from config to a pipeline descriptor.
 *
 * When the descriptor does not declare a permissionScope, returns base unchanged
 * (same reference) — zero-overhead no-op, consistent with composeReviewerDescriptor's
 * "no reviewers → return base" contract.
 *
 * When permissionScope is present, returns a new descriptor with:
 *   - permissionScope.forbidden replaced by the resolved surfaces from config
 *   - permissionScope.checkpoint preserved unchanged (shape is code, not config)
 *   - all other descriptor fields spread-cloned from base
 *
 * @param base   - The static pipeline descriptor from the registry.
 * @param config - The resolved SpecRunnerConfig (merged user + project layers).
 * @returns      - A descriptor with config-resolved forbidden surfaces, or base if no scope.
 */
export function applyScopeConfig(
  base: PipelineDescriptor,
  config: SpecRunnerConfig,
): PipelineDescriptor {
  if (base.permissionScope === undefined) {
    // No scope declared — no capability requirement — return base unchanged.
    return base;
  }

  const forbidden = resolvePipelineForbiddenSurfaces(config, base.id);

  return {
    ...base,
    permissionScope: {
      checkpoint: base.permissionScope.checkpoint,
      forbidden,
    },
  };
}

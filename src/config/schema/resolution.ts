/**
 * Config resolvers: apply defaults to optional config sections.
 * Each resolver is the single source of truth for its section's effective values.
 */
import type {
  SpecRunnerConfig,
  InboxConfig,
  TransientRetryConfig,
  ResolvedDesignLayer,
  ForbiddenSurfaceConfig,
} from "./types.js";
import {
  DEFAULT_INBOX_APPROVE_LABEL,
  DEFAULT_INBOX_MAX_STARTS_PER_RUN,
  DEFAULT_TRANSIENT_RETRY_MAX,
  DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS,
} from "./types.js";

/**
 * Resolve InboxConfig with defaults applied.
 * Returns a fully-resolved config with all fields present.
 */
export function resolveInboxConfig(config: SpecRunnerConfig): Required<InboxConfig> {
  return {
    approveLabel: config.inbox?.approveLabel ?? DEFAULT_INBOX_APPROVE_LABEL,
    maxStartsPerRun: config.inbox?.maxStartsPerRun ?? DEFAULT_INBOX_MAX_STARTS_PER_RUN,
  };
}

/**
 * Resolve TransientRetryConfig with defaults applied.
 * Returns a fully-resolved config with all fields present.
 */
export function resolveTransientRetryConfig(config: SpecRunnerConfig): Required<TransientRetryConfig> {
  return {
    maxRetries: config.transientRetry?.maxRetries ?? DEFAULT_TRANSIENT_RETRY_MAX,
    baseDelayMs: config.transientRetry?.baseDelayMs ?? DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS,
  };
}

/**
 * Resolve DesignLayerConfig with defaults applied.
 * Returns a fully-resolved config with all fields present.
 * Follows the same pattern as resolveInboxConfig / resolveTransientRetryConfig.
 */
export function resolveDesignLayerConfig(config: SpecRunnerConfig): ResolvedDesignLayer {
  return {
    enabled: config.designLayer?.enabled === true,
    command: config.designLayer?.command ?? "aozu",
    requireCitationTypes: config.designLayer?.requireCitationTypes ?? [],
    topicEmission: config.designLayer?.topicEmission !== false,
  };
}

// ---------------------------------------------------------------------------
// Pipeline forbidden-surfaces resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the forbidden surfaces for a given pipeline id from config.
 *
 * Returns the declared surfaces when pipelineId === "fast" and config has them.
 * Returns [] for all other pipeline ids and when the fast section is absent.
 *
 * This is the single source of truth for config.pipeline.fast.forbiddenSurfaces access.
 * All consumers must call this resolver — do not read config.pipeline.fast directly elsewhere.
 */
export function resolvePipelineForbiddenSurfaces(
  config: SpecRunnerConfig,
  pipelineId: string,
): ForbiddenSurfaceConfig[] {
  if (pipelineId === "fast") {
    return config.pipeline?.fast?.forbiddenSurfaces ?? [];
  }
  return [];
}

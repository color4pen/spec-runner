/**
 * Shared helpers for converting LifecycleScenario declarations into
 * concrete SpecRunnerConfig and AgentRunPolicy objects.
 *
 * Used by both claude-code.ts and codex.ts harnesses.
 * No provider-SDK imports.
 */
import type { SpecRunnerConfig } from "../../../../../src/config/schema.js";
import type { AgentRunPolicy } from "../../../../../src/core/port/agent-runner.js";
import type { ReportToolSpec, FollowUpPolicy } from "../../../../../src/core/port/report-result.js";
import { parseBaseReportInput } from "../../../../../src/core/port/report-result.js";
import type { OutputVerificationPolicy } from "../../../../../src/core/port/output-contract.js";
import { boolean } from "zod/v4-mini";
import type { LifecycleScenario } from "../scenario.js";

// ---------------------------------------------------------------------------
// Shared report tool spec used by contract harnesses
// ---------------------------------------------------------------------------

export const CONTRACT_REPORT_TOOL: ReportToolSpec = {
  name: "report_result",
  description: "Report step completion",
  zodSchema: { ok: boolean() },
  parseInput: parseBaseReportInput,
};

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

/**
 * Build a SpecRunnerConfig from a scenario's config declaration.
 * Merges scenario-specific overrides onto a minimal base config.
 */
export function buildScenarioConfig(scenario: LifecycleScenario): Partial<SpecRunnerConfig> {
  const cfg: Partial<SpecRunnerConfig> = {};

  if (scenario.config.transientRetry !== undefined) {
    cfg.transientRetry = { maxRetries: scenario.config.transientRetry.maxRetries };
  }

  if (scenario.config.contextRollover !== undefined) {
    cfg.contextRollover = {
      maxRollovers: scenario.config.contextRollover.maxRollovers,
    };
  }

  if (scenario.config.steps?.implementer !== undefined) {
    cfg.steps = {
      implementer: {
        timeoutMs: scenario.config.steps.implementer.timeoutMs,
      },
    };
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// Policy builder
// ---------------------------------------------------------------------------

/**
 * Build an AgentRunPolicy from a scenario's policy declaration.
 */
export function buildScenarioPolicy(
  scenario: LifecycleScenario,
  opts?: { outputVerificationPolicy?: OutputVerificationPolicy },
): AgentRunPolicy {
  const policy: AgentRunPolicy = {};

  if (scenario.policy.hasReportTool) {
    policy.reportTool = CONTRACT_REPORT_TOOL;
  }

  if (scenario.policy.postWorkPrompts && scenario.policy.postWorkPrompts.length > 0) {
    policy.postWorkPrompts = scenario.policy.postWorkPrompts;
  }

  if (scenario.policy.toolReportRetryMaxAttempts !== undefined) {
    const maxAttempts = scenario.policy.toolReportRetryMaxAttempts;
    const retryPolicy: FollowUpPolicy = {
      maxAttempts,
      buildPrompt: ({ attempt }) =>
        `Please call report_result now. (attempt ${attempt}/${maxAttempts})`,
    };
    policy.toolReportRetry = retryPolicy;
  }

  if (opts?.outputVerificationPolicy) {
    policy.outputVerification = opts.outputVerificationPolicy;
  } else if (scenario.policy.outputVerification) {
    policy.outputVerification = buildOutputVerificationPolicy(
      scenario.policy.outputVerification,
    );
  }

  return policy;
}

// ---------------------------------------------------------------------------
// Output verification policy builder
// ---------------------------------------------------------------------------

/**
 * Build an OutputVerificationPolicy from a scenario's outputVerification descriptor.
 * The detect() sequence repeats the last element when exhausted.
 */
export function buildOutputVerificationPolicy(
  descriptor: NonNullable<LifecycleScenario["policy"]["outputVerification"]>,
): OutputVerificationPolicy {
  let detectCallIndex = 0;

  const detect = async () => {
    const seq = descriptor.detectSequence;
    const entry = detectCallIndex < seq.length
      ? seq[detectCallIndex]!
      : seq[seq.length - 1]!;
    detectCallIndex++;

    if (entry === "throws") {
      throw new Error("output verification detect failed");
    }

    const count = entry as number;
    if (count === 0) {
      return { violations: [] };
    }

    // Build minimal follow-up violations
    const violations = Array.from({ length: count }, (_, i) => ({
      kind: "content-format" as const,
      path: `file-${i}.ts`,
      policy: "follow-up" as const,
      detail: [`missing-check-${i}`],
    }));
    return { violations };
  };

  const buildPrompt = (violations: unknown[], attempt: number): string => {
    return `Please fix ${violations.length} output violation(s). (attempt ${attempt}/${descriptor.maxAttempts})`;
  };

  return {
    detect,
    maxAttempts: descriptor.maxAttempts,
    buildPrompt,
  };
}

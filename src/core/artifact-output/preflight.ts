/**
 * Preflight check for the artifact-output profile.
 * T-05: preflight.ts — pure functions, no I/O.
 *
 * Plans the effective pipeline by checking which steps require capabilities
 * that the selected profile does not provide.
 */
import type { PipelineDescriptor } from "../pipeline/types.js";
import {
  getProfileCapabilities,
  STEP_CAPABILITY_REQUIREMENTS,
  UNSUPPORTED_OPERATIONS,
  type ExecutionProfileId,
  type RuntimeCapabilityId,
} from "./execution-profile.js";

// ─── Report types ─────────────────────────────────────────────────────────────

export interface UnsupportedStepEntry {
  step: string;
  missing: RuntimeCapabilityId[];
}

export interface EffectivePipelineReport {
  profileId: ExecutionProfileId;
  pipelineId: string;
  /** Steps that CAN run in this profile. */
  supported: string[];
  /** Steps that CANNOT run due to missing capabilities. */
  unsupported: UnsupportedStepEntry[];
  /** Declared unsupported operations (from execution-profile.ts). */
  unsupportedOperations: typeof UNSUPPORTED_OPERATIONS;
  /** True if all steps in the pipeline are supported. */
  executable: boolean;
}

// ─── Core preflight function ──────────────────────────────────────────────────

/**
 * Plan the effective pipeline for the given descriptor and profile.
 * Returns a report listing supported/unsupported steps and whether the pipeline
 * can be executed as-is.
 *
 * Never throws — pure computation over data tables.
 */
export function planEffectivePipeline(
  descriptor: PipelineDescriptor,
  profileId: ExecutionProfileId,
): EffectivePipelineReport {
  const capabilities = getProfileCapabilities(profileId);

  const supported: string[] = [];
  const unsupported: UnsupportedStepEntry[] = [];

  for (const [stepName] of descriptor.steps) {
    const required = STEP_CAPABILITY_REQUIREMENTS[stepName] ?? [];
    const missing = required.filter((cap) => !capabilities.has(cap));

    if (missing.length === 0) {
      supported.push(stepName);
    } else {
      unsupported.push({ step: stepName, missing });
    }
  }

  return {
    profileId,
    pipelineId: descriptor.id,
    supported,
    unsupported,
    unsupportedOperations: UNSUPPORTED_OPERATIONS,
    executable: unsupported.length === 0,
  };
}

// ─── Report rendering ─────────────────────────────────────────────────────────

/**
 * Render a human-readable string from an EffectivePipelineReport.
 * Returns a string (does NOT write to stdout).
 */
export function renderEffectivePipelineReport(report: EffectivePipelineReport): string {
  const lines: string[] = [
    `Profile: ${report.profileId}`,
    `Pipeline: ${report.pipelineId}`,
    `Executable: ${report.executable}`,
    "",
  ];

  if (report.supported.length > 0) {
    lines.push(`Supported steps (${report.supported.length}):`);
    for (const step of report.supported) {
      lines.push(`  ✓ ${step}`);
    }
    lines.push("");
  }

  if (report.unsupported.length > 0) {
    lines.push(`Unsupported steps (${report.unsupported.length}):`);
    for (const entry of report.unsupported) {
      lines.push(`  ✗ ${entry.step} — missing: ${entry.missing.join(", ")}`);
    }
    lines.push("");
  }

  if (report.unsupportedOperations.length > 0) {
    lines.push("Unsupported operations in this profile:");
    for (const op of report.unsupportedOperations) {
      lines.push(`  • ${op.displayName}: ${op.reason}`);
    }
  }

  return lines.join("\n");
}

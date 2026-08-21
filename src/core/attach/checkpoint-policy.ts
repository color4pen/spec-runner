/**
 * checkpoint-policy — use-case verification policies for checkpoint attach.
 *
 * Separates use-case-specific checks (who can attach this checkpoint)
 * from generic integrity checks (is the checkpoint self-consistent).
 *
 * Design D1–D5 (checkpoint-verification-policy-split/design.md):
 *   - CheckpointVerificationPolicy: injectable policy interface
 *   - PolicyVerificationContext: minimal context passed to policy.verify()
 *   - attachResumePolicy: default policy implementing awaiting-resume checks
 *   - attachArchivePolicy: policy for awaiting-archive attach (D1, T-01)
 *   - attachQuiescentPolicy: composite — delegates by status (T-01)
 */
import { getPipelineDescriptor } from "../pipeline/registry.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import { resolveResumeStep, buildAllowedStepSet } from "../resume/resolve-step.js";
import { checkpointNotAttachableError } from "../../errors.js";
import type { NormalizedJobState } from "../../store/job-state-projection.js";
import type { StepDeps } from "../step/types.js";

// ---------------------------------------------------------------------------
// Policy context + interface
// ---------------------------------------------------------------------------

export interface PolicyVerificationContext {
  state: NormalizedJobState;
  slug: string;
  treeFiles: string[];
}

export interface CheckpointVerificationPolicy {
  verify(ctx: PolicyVerificationContext): void;
}

// ---------------------------------------------------------------------------
// attachResumePolicy — default policy for job attach --branch
// ---------------------------------------------------------------------------

/**
 * Verification policy for `job attach --branch`:
 *   (a) status === "awaiting-resume"
 *   (c) resumePoint + pipeline definition resolvable
 *   (d-new) resume step reads() required file inputs present in treeFiles
 *
 * These are use-case checks that are NOT present in the generic integrity layer.
 */
export const attachResumePolicy: CheckpointVerificationPolicy = {
  verify({ state, slug, treeFiles }: PolicyVerificationContext): void {
    // (a) Status must be awaiting-resume
    if (state.status !== "awaiting-resume") {
      throw checkpointNotAttachableError(
        "not-quiescent",
        `state.status is '${state.status}', expected 'awaiting-resume'. Only awaiting-resume jobs can be attached.`,
      );
    }

    // (c) Resume point + pipeline definition resolvable
    let descriptor: ReturnType<typeof getPipelineDescriptor>;
    try {
      descriptor = getPipelineDescriptor(getPipelineId(state));
    } catch (err: unknown) {
      throw checkpointNotAttachableError(
        "pipeline-unresolvable",
        `Pipeline descriptor not found: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let resolvedStepName: string;
    try {
      resolvedStepName = resolveResumeStep(
        undefined,
        state.resumePoint ?? null,
        state.step,
        buildAllowedStepSet(state.reviewers),
        state.reviewers,
      );
    } catch (err: unknown) {
      throw checkpointNotAttachableError(
        "resume-step-unresolvable",
        `Cannot resolve resume step: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // (d-new) Resume step reads() tree-precheck: required file inputs must be in treeFiles.
    // Skip dynamic steps (coordinator / regression-gate) not in the static descriptor set.
    // Invariant: all standard pipeline step reads() reference only state + deps.slug
    // (audited; config / request / cwd are not accessed).
    const descriptorStepMap = new Map(descriptor.steps);
    const resumeStep = descriptorStepMap.get(resolvedStepName);
    if (resumeStep !== undefined && typeof resumeStep.reads === "function") {
      const minDeps = { slug } as unknown as StepDeps;
      let readsRefs: import("../step/types.js").IoRef[] = [];
      try {
        readsRefs = resumeStep.reads(state as import("../../state/schema.js").JobState, minDeps);
      } catch (err: unknown) {
        // reads() threw — scope unevaluable → fail-closed (scope-unevaluable → reject).
        throw checkpointNotAttachableError(
          "resume-reads-unevaluable",
          `Cannot evaluate reads() for resume step '${resolvedStepName}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      for (const ref of readsRefs) {
        if (ref.required !== false && ref.artifact !== "gitState") {
          if (!treeFiles.includes(ref.path)) {
            throw checkpointNotAttachableError(
              "resume-input-missing",
              `Resume step '${resolvedStepName}' requires '${ref.path}' but it is not present in the checkpoint tree.`,
            );
          }
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------
// attachArchivePolicy — policy for awaiting-archive attach (T-01)
// ---------------------------------------------------------------------------

/**
 * Verification policy for `job archive --from-issue` (awaiting-archive path):
 *   (a) status === "awaiting-archive"
 *   (b) state.pullRequest?.number is present
 *
 * Does NOT verify resumePoint, pipeline descriptor, or reads() — archive path
 * does not resume the pipeline.
 */
export const attachArchivePolicy: CheckpointVerificationPolicy = {
  verify({ state }: PolicyVerificationContext): void {
    if (state.status !== "awaiting-archive") {
      throw checkpointNotAttachableError(
        "not-quiescent",
        `state.status is '${state.status}', expected 'awaiting-archive'. Only awaiting-archive jobs can be attached via archive path.`,
      );
    }
    if (typeof (state as { pullRequest?: { number?: unknown } }).pullRequest?.number !== "number") {
      throw checkpointNotAttachableError(
        "missing-pr-number",
        `state.pullRequest.number is absent. Cannot archive without a PR number.`,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// attachQuiescentPolicy — composite: delegates by status (T-01)
// ---------------------------------------------------------------------------

/**
 * Composite policy that accepts both quiescent statuses:
 *   - awaiting-resume → attachResumePolicy
 *   - awaiting-archive → attachArchivePolicy
 *   - anything else → not-quiescent error
 */
export const attachQuiescentPolicy: CheckpointVerificationPolicy = {
  verify(ctx: PolicyVerificationContext): void {
    const status = ctx.state.status;
    if (status === "awaiting-resume") {
      attachResumePolicy.verify(ctx);
    } else if (status === "awaiting-archive") {
      attachArchivePolicy.verify(ctx);
    } else {
      throw checkpointNotAttachableError(
        "not-quiescent",
        `state.status is '${status}', expected 'awaiting-resume' or 'awaiting-archive'.`,
      );
    }
  },
};

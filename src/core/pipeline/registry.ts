/**
 * Pipeline registry: maps pipeline identifiers to their PipelineDescriptor.
 *
 * This module is the single source of truth for pipeline configurations.
 * Dependency direction: registry → step / types / kernel (no import from run.ts).
 */
import type { PipelineDescriptor } from "./types.js";
import { STANDARD_TRANSITIONS } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";
import { PIPELINE_IDS } from "../../kernel/pipeline-ids.js";

import { DesignStep } from "../step/design.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { TestCaseGenStep } from "../step/test-case-gen.js";
import { ImplementerStep } from "../step/implementer.js";
import { VerificationStep } from "../step/verification.js";
import { BuildFixerStep } from "../step/build-fixer.js";
import { CodeReviewStep } from "../step/code-review.js";
import { CodeFixerStep } from "../step/code-fixer.js";
import { ConformanceStep } from "../step/conformance.js";
import { AdrGenStep } from "../step/adr-gen.js";
import { PrCreateStep } from "../step/pr-create.js";

/**
 * Standard 12-step pipeline descriptor.
 * All fields match the current createStandardPipeline / STANDARD_* constants exactly.
 */
export const STANDARD_DESCRIPTOR: PipelineDescriptor = {
  id: PIPELINE_IDS.STANDARD,
  steps: [
    [STEP_NAMES.DESIGN,       DesignStep],
    [STEP_NAMES.SPEC_REVIEW,  SpecReviewStep],
    [STEP_NAMES.SPEC_FIXER,   SpecFixerStep],
    [STEP_NAMES.TEST_CASE_GEN, TestCaseGenStep],
    [STEP_NAMES.IMPLEMENTER,  ImplementerStep],
    [STEP_NAMES.VERIFICATION, VerificationStep],
    [STEP_NAMES.BUILD_FIXER,  BuildFixerStep],
    [STEP_NAMES.CODE_REVIEW,  CodeReviewStep],
    [STEP_NAMES.CODE_FIXER,   CodeFixerStep],
    [STEP_NAMES.CONFORMANCE,  ConformanceStep],
    [STEP_NAMES.ADR_GEN,      AdrGenStep],
    [STEP_NAMES.PR_CREATE,    PrCreateStep],
  ],
  transitions: STANDARD_TRANSITIONS,
  loopName: STEP_NAMES.SPEC_REVIEW,
  loopNames: [
    STEP_NAMES.SPEC_REVIEW,
    STEP_NAMES.VERIFICATION,
    STEP_NAMES.CODE_REVIEW,
    STEP_NAMES.CONFORMANCE,
  ],
  loopFixerPairs: {
    [STEP_NAMES.CODE_REVIEW]:  STEP_NAMES.CODE_FIXER,
    [STEP_NAMES.SPEC_REVIEW]:  STEP_NAMES.SPEC_FIXER,
    [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  },
  startStep: STEP_NAMES.DESIGN,
  roles: {
    [STEP_NAMES.DESIGN]:       { role: "creator",  phase: "spec" },
    [STEP_NAMES.SPEC_REVIEW]:  { role: "reviewer", phase: "spec" },
    [STEP_NAMES.SPEC_FIXER]:   { role: "fixer",    phase: "spec" },
    [STEP_NAMES.TEST_CASE_GEN]:{ role: "gate",     phase: "impl" },
    [STEP_NAMES.IMPLEMENTER]:  { role: "creator",  phase: "impl" },
    [STEP_NAMES.VERIFICATION]: { role: "gate",     phase: "impl" },
    [STEP_NAMES.BUILD_FIXER]:  { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CODE_REVIEW]:  { role: "reviewer", phase: "impl" },
    [STEP_NAMES.CODE_FIXER]:   { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CONFORMANCE]:  { role: "gate",     phase: "impl" },
    [STEP_NAMES.ADR_GEN]:      { role: "gate",     phase: "impl" },
    [STEP_NAMES.PR_CREATE]:    { role: "gate",     phase: "impl" },
  },
  summaryStep: STEP_NAMES.SPEC_REVIEW,
};

/**
 * Design-only pipeline: runs only the design step and terminates.
 * Equivalent to the former runDesignPipeline inline configuration.
 */
export const DESIGN_ONLY_DESCRIPTOR: PipelineDescriptor = {
  id: PIPELINE_IDS.DESIGN_ONLY,
  steps: [
    [STEP_NAMES.DESIGN, DesignStep],
  ],
  transitions: [
    { step: STEP_NAMES.DESIGN, on: "success", to: "end" },
    { step: STEP_NAMES.DESIGN, on: "error",   to: "escalate" },
  ],
  loopName: STEP_NAMES.DESIGN,
  loopNames: [STEP_NAMES.DESIGN],
  loopFixerPairs: {},
  startStep: STEP_NAMES.DESIGN,
  maxIterations: 1,
  roles: {
    [STEP_NAMES.DESIGN]: { role: "creator", phase: "spec" },
  },
  // summaryStep intentionally omitted: design-only pipeline emits no summary
};

/**
 * Registry mapping pipeline ids to their descriptors.
 * Two entries: standard (12-step) and design-only (1-step).
 */
export const PIPELINE_REGISTRY: Record<string, PipelineDescriptor> = {
  [PIPELINE_IDS.STANDARD]:    STANDARD_DESCRIPTOR,
  [PIPELINE_IDS.DESIGN_ONLY]: DESIGN_ONLY_DESCRIPTOR,
};

/**
 * Look up a pipeline descriptor by id.
 * Throws with a list of known ids if the id is unregistered.
 */
export function getPipelineDescriptor(id: string): PipelineDescriptor {
  const descriptor = PIPELINE_REGISTRY[id];
  if (!descriptor) {
    const known = Object.keys(PIPELINE_REGISTRY).join(", ");
    throw new Error(`Unknown pipeline id: "${id}". Known ids: ${known}`);
  }
  return descriptor;
}

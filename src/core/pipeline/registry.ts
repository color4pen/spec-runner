/**
 * Pipeline registry: maps pipeline identifiers to their PipelineDescriptor.
 *
 * This module is the single source of truth for pipeline configurations.
 * Dependency direction: registry → step / types / kernel (no import from run.ts).
 */
import type { PipelineDescriptor } from "./types.js";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";
import { PIPELINE_IDS } from "../../kernel/pipeline-ids.js";

import { RequestReviewStep } from "../step/request-review.js";
import { DesignStep } from "../step/design.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { TestCaseGenStep } from "../step/test-case-gen.js";
import { TestMaterializeStep } from "../step/test-materialize.js";
import { ImplementerStep } from "../step/implementer.js";
import { VerificationStep } from "../step/verification.js";
import { BuildFixerStep } from "../step/build-fixer.js";
import { CodeReviewStep } from "../step/code-review.js";
import { CodeFixerStep } from "../step/code-fixer.js";
import { ConformanceStep } from "../step/conformance.js";
import { AdrGenStep } from "../step/adr-gen.js";
import { PrCreateStep } from "../step/pr-create.js";

/**
 * Standard 14-step pipeline descriptor.
 * All fields match the current createStandardPipeline / STANDARD_* constants exactly.
 *
 * Step order: request-review → design → spec-review → spec-fixer → test-case-gen →
 *   test-materialize → implementer → verification → build-fixer → code-review →
 *   code-fixer → conformance → adr-gen → pr-create
 */
export const STANDARD_DESCRIPTOR: PipelineDescriptor = {
  id: PIPELINE_IDS.STANDARD,
  steps: [
    [STEP_NAMES.REQUEST_REVIEW,   RequestReviewStep],
    [STEP_NAMES.DESIGN,           DesignStep],
    [STEP_NAMES.SPEC_REVIEW,      SpecReviewStep],
    [STEP_NAMES.SPEC_FIXER,       SpecFixerStep],
    [STEP_NAMES.TEST_CASE_GEN,    TestCaseGenStep],
    [STEP_NAMES.TEST_MATERIALIZE, TestMaterializeStep],
    [STEP_NAMES.IMPLEMENTER,      ImplementerStep],
    [STEP_NAMES.VERIFICATION,     VerificationStep],
    [STEP_NAMES.BUILD_FIXER,      BuildFixerStep],
    [STEP_NAMES.CODE_REVIEW,      CodeReviewStep],
    [STEP_NAMES.CODE_FIXER,       CodeFixerStep],
    [STEP_NAMES.CONFORMANCE,      ConformanceStep],
    [STEP_NAMES.ADR_GEN,          AdrGenStep],
    [STEP_NAMES.PR_CREATE,        PrCreateStep],
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
  startStep: STEP_NAMES.REQUEST_REVIEW,
  roles: {
    [STEP_NAMES.REQUEST_REVIEW]:   { role: "gate",     phase: "spec" },
    [STEP_NAMES.DESIGN]:           { role: "creator",  phase: "spec" },
    [STEP_NAMES.SPEC_REVIEW]:      { role: "reviewer", phase: "spec" },
    [STEP_NAMES.SPEC_FIXER]:       { role: "fixer",    phase: "spec" },
    [STEP_NAMES.TEST_CASE_GEN]:    { role: "gate",     phase: "impl" },
    [STEP_NAMES.TEST_MATERIALIZE]: { role: "gate",     phase: "impl" },
    [STEP_NAMES.IMPLEMENTER]:      { role: "creator",  phase: "impl" },
    [STEP_NAMES.VERIFICATION]:     { role: "gate",     phase: "impl" },
    [STEP_NAMES.BUILD_FIXER]:      { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CODE_REVIEW]:      { role: "reviewer", phase: "impl" },
    [STEP_NAMES.CODE_FIXER]:       { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CONFORMANCE]:      { role: "gate",     phase: "impl" },
    [STEP_NAMES.ADR_GEN]:          { role: "gate",     phase: "impl" },
    [STEP_NAMES.PR_CREATE]:        { role: "gate",     phase: "impl" },
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
 * Fast pipeline descriptor: 9-step slim profile with permissionScope.
 *
 * Removes spec-review / spec-fixer / test-case-gen / adr-gen from the standard pipeline.
 * design goes directly to implementer; conformance goes directly to pr-create (no adr-gen).
 * permissionScope (checkpoint=conformance) is declared so that:
 *   - #689 scope breach detection fires at the conformance checkpoint when forbidden
 *     surfaces are declared in repo config (pipeline.fast.forbiddenSurfaces).
 *   - #693 capability gate rejects this profile before bootstrapJob when the runtime
 *     cannot derive changed files (inherited automatically via permissionScope presence).
 *
 * forbidden is resolved from repo config via applyScopeConfig() at runtime.
 * Empty forbidden = no protected surfaces declared for this repo = no breach detection.
 * checkpoint remains "conformance" and is not config-driven (shape is code).
 */
export const FAST_DESCRIPTOR: PipelineDescriptor = {
  id: PIPELINE_IDS.FAST,
  steps: [
    [STEP_NAMES.REQUEST_REVIEW, RequestReviewStep],
    [STEP_NAMES.DESIGN,         DesignStep],
    [STEP_NAMES.IMPLEMENTER,    ImplementerStep],
    [STEP_NAMES.VERIFICATION,   VerificationStep],
    [STEP_NAMES.BUILD_FIXER,    BuildFixerStep],
    [STEP_NAMES.CODE_REVIEW,    CodeReviewStep],
    [STEP_NAMES.CODE_FIXER,     CodeFixerStep],
    [STEP_NAMES.CONFORMANCE,    ConformanceStep],
    [STEP_NAMES.PR_CREATE,      PrCreateStep],
  ],
  transitions: FAST_TRANSITIONS,
  loopName: STEP_NAMES.CODE_REVIEW,
  loopNames: [
    STEP_NAMES.VERIFICATION,
    STEP_NAMES.CODE_REVIEW,
    STEP_NAMES.CONFORMANCE,
  ],
  loopFixerPairs: {
    [STEP_NAMES.CODE_REVIEW]:  STEP_NAMES.CODE_FIXER,
    [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  },
  startStep: STEP_NAMES.REQUEST_REVIEW,
  roles: {
    [STEP_NAMES.REQUEST_REVIEW]: { role: "gate",     phase: "spec" },
    [STEP_NAMES.DESIGN]:         { role: "creator",  phase: "spec" },
    [STEP_NAMES.IMPLEMENTER]:    { role: "creator",  phase: "impl" },
    [STEP_NAMES.VERIFICATION]:   { role: "gate",     phase: "impl" },
    [STEP_NAMES.BUILD_FIXER]:    { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CODE_REVIEW]:    { role: "reviewer", phase: "impl" },
    [STEP_NAMES.CODE_FIXER]:     { role: "fixer",    phase: "impl" },
    [STEP_NAMES.CONFORMANCE]:    { role: "gate",     phase: "impl" },
    [STEP_NAMES.PR_CREATE]:      { role: "gate",     phase: "impl" },
  },
  summaryStep: STEP_NAMES.CODE_REVIEW,
  permissionScope: {
    checkpoint: STEP_NAMES.CONFORMANCE,
    // forbidden is intentionally empty here; it is populated at runtime by applyScopeConfig()
    // which reads pipeline.fast.forbiddenSurfaces from repo config.
    // Empty = no protected surfaces declared for this repo = no breach detection.
    forbidden: [],
  },
};

/**
 * Registry mapping pipeline ids to their descriptors.
 * Three entries: standard (14-step), design-only (1-step), fast (9-step slim with scope).
 */
export const PIPELINE_REGISTRY: Record<string, PipelineDescriptor> = {
  [PIPELINE_IDS.STANDARD]:    STANDARD_DESCRIPTOR,
  [PIPELINE_IDS.DESIGN_ONLY]: DESIGN_ONLY_DESCRIPTOR,
  [PIPELINE_IDS.FAST]:        FAST_DESCRIPTOR,
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

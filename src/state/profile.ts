/**
 * Effective profile resolution and digest helpers.
 *
 * Modelled after src/state/pipeline-id.ts.
 * No I/O or filesystem dependency — pure functions, testable in isolation.
 *
 * TC-PROF-001: STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)
 * TC-PROF-002: getProfile({}) → STANDARD_PROFILE (backward compat)
 * TC-PROF-003: getProfile({ profile: P }) → P
 * TC-PROF-004: computePolicyDigest ignores policyDigest field; sensitive to body fields
 */
import type { JobState, EffectiveProfile, ProfileAssurance } from "./schema.js";
import type { TestDerivationLevel, BiteEvidenceLevel, SpecReviewLevel } from "./schema/types.js";
import { hashObject } from "../util/hash.js";

/**
 * The schema version that this runtime understands.
 * Profiles with schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION are rejected at attach
 * with reason "profile-uninterpretable" (ADR-20260716 D6).
 */
export const SUPPORTED_PROFILE_SCHEMA_VERSION = 1;

/**
 * Compute the policy digest for a profile.
 * Inputs: id, schemaVersion, budget, assurance — the "body" fields.
 * policyDigest itself is excluded from the hash input to avoid circular dependency.
 * Returns a "sha256:..." hash string.
 */
export function computePolicyDigest(
  profile: Pick<EffectiveProfile, "id" | "schemaVersion" | "budget" | "assurance">,
): string {
  return hashObject({
    id: profile.id,
    schemaVersion: profile.schemaVersion,
    budget: profile.budget,
    assurance: profile.assurance,
  });
}

/**
 * Floor definition for assurance comparison.
 * Each field is optional — absent fields are unconstrained.
 * Used by satisfiesFloor to compare an effective assurance against a required minimum.
 */
export interface AssuranceFloor {
  testDerivation?: TestDerivationLevel;
  biteEvidence?: BiteEvidenceLevel;
  specReview?: SpecReviewLevel;
}

/**
 * Lattice rank maps for each assurance field.
 * Lower number = weaker assurance.
 */
const TEST_DERIVATION_RANK: Record<TestDerivationLevel, number> = {
  coupled: 0,
  frozen: 1,
};

const BITE_EVIDENCE_RANK: Record<BiteEvidenceLevel, number> = {
  optional: 0,
  required: 1,
};

const SPEC_REVIEW_RANK: Record<SpecReviewLevel, number> = {
  omitted: 0,
  required: 1,
};

/**
 * Determine whether an effective assurance satisfies a floor.
 *
 * Decision order (fail-closed):
 * - Floor fields that are undefined are unconstrained (always pass).
 * - If the assurance value for a constrained field is absent or not a recognized rank → false.
 * - If the assurance rank < floor rank → false.
 * - All fields pass → true.
 *
 * Empty floor {} is satisfied by any assurance (vacuously true).
 */
export function satisfiesFloor(assurance: ProfileAssurance, floor: AssuranceFloor): boolean {
  if (floor.testDerivation !== undefined) {
    const assuranceValue = assurance["testDerivation"];
    const assuranceRank = typeof assuranceValue === "string" ? TEST_DERIVATION_RANK[assuranceValue as TestDerivationLevel] : undefined;
    const floorRank = TEST_DERIVATION_RANK[floor.testDerivation];
    if (assuranceRank === undefined || assuranceRank < floorRank) {
      return false;
    }
  }

  if (floor.biteEvidence !== undefined) {
    const assuranceValue = assurance["biteEvidence"];
    const assuranceRank = typeof assuranceValue === "string" ? BITE_EVIDENCE_RANK[assuranceValue as BiteEvidenceLevel] : undefined;
    const floorRank = BITE_EVIDENCE_RANK[floor.biteEvidence];
    if (assuranceRank === undefined || assuranceRank < floorRank) {
      return false;
    }
  }

  if (floor.specReview !== undefined) {
    const assuranceValue = assurance["specReview"];
    const assuranceRank = typeof assuranceValue === "string" ? SPEC_REVIEW_RANK[assuranceValue as SpecReviewLevel] : undefined;
    const floorRank = SPEC_REVIEW_RANK[floor.specReview];
    if (assuranceRank === undefined || assuranceRank < floorRank) {
      return false;
    }
  }

  return true;
}

// Build STANDARD_PROFILE: define the body first, then compute its digest.
// This guarantees self-consistency at module load time.
const _standardBody = {
  id: "standard",
  schemaVersion: SUPPORTED_PROFILE_SCHEMA_VERSION,
  budget: {} as Readonly<Record<string, unknown>>,
  assurance: {
    testDerivation: "frozen",
    biteEvidence: "required",
    specReview: "required",
  } as ProfileAssurance,
};

/**
 * The standard effective profile.
 * Self-consistent: policyDigest === computePolicyDigest(STANDARD_PROFILE).
 * Frozen to prevent accidental mutation of the shared constant.
 */
export const STANDARD_PROFILE: EffectiveProfile = Object.freeze({
  ..._standardBody,
  policyDigest: computePolicyDigest(_standardBody),
});

/**
 * Resolve the effective profile for a job state.
 *
 * Fallback: if profile is absent (legacy state), returns STANDARD_PROFILE without
 * modifying the input state.
 * This is the single resolution entry-point — consumers must not define their own default.
 */
export function getProfile(state: Pick<JobState, "profile">): EffectiveProfile {
  return state.profile ?? STANDARD_PROFILE;
}

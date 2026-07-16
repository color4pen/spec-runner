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
import type { JobState, EffectiveProfile } from "./schema.js";
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

// Build STANDARD_PROFILE: define the body first, then compute its digest.
// This guarantees self-consistency at module load time.
const _standardBody = {
  id: "standard",
  schemaVersion: SUPPORTED_PROFILE_SCHEMA_VERSION,
  budget: {} as Readonly<Record<string, unknown>>,
  assurance: {} as Readonly<Record<string, unknown>>,
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

/**
 * Unit tests for src/state/profile.ts (T-03 / T-07).
 *
 * TC-PROF-001: STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE) (self-consistent)
 * TC-PROF-002: getProfile({}) → STANDARD_PROFILE, input non-destructive (backward compat)
 * TC-PROF-003: getProfile({ profile: P }) → P (recorded value returned)
 * TC-PROF-004: computePolicyDigest ignores policyDigest field; sensitive to body fields
 */
import { describe, it, expect } from "vitest";
import {
  STANDARD_PROFILE,
  computePolicyDigest,
  getProfile,
  SUPPORTED_PROFILE_SCHEMA_VERSION,
} from "../../../src/state/profile.js";
import type { EffectiveProfile } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// TC-PROF-001: STANDARD_PROFILE self-consistency
// ---------------------------------------------------------------------------
describe("TC-PROF-001: STANDARD_PROFILE is self-consistent", () => {
  it("policyDigest matches computePolicyDigest(STANDARD_PROFILE)", () => {
    expect(STANDARD_PROFILE.policyDigest).toBe(computePolicyDigest(STANDARD_PROFILE));
  });

  it("id is 'standard'", () => {
    expect(STANDARD_PROFILE.id).toBe("standard");
  });

  it("schemaVersion is SUPPORTED_PROFILE_SCHEMA_VERSION", () => {
    expect(STANDARD_PROFILE.schemaVersion).toBe(SUPPORTED_PROFILE_SCHEMA_VERSION);
  });

  it("policyDigest starts with 'sha256:'", () => {
    expect(STANDARD_PROFILE.policyDigest).toMatch(/^sha256:/);
  });
});

// ---------------------------------------------------------------------------
// TC-PROF-002: getProfile with absent profile → STANDARD_PROFILE
// ---------------------------------------------------------------------------
describe("TC-PROF-002: getProfile returns STANDARD_PROFILE when profile is absent", () => {
  it("returns STANDARD_PROFILE when profile field is undefined ({})", () => {
    const result = getProfile({});
    expect(result).toBe(STANDARD_PROFILE);
  });

  it("does not mutate the input state", () => {
    const input: { profile?: EffectiveProfile } = {};
    getProfile(input);
    expect(input.profile).toBeUndefined();
  });

  it("returns STANDARD_PROFILE for an explicit undefined profile", () => {
    const result = getProfile({ profile: undefined });
    expect(result).toBe(STANDARD_PROFILE);
  });
});

// ---------------------------------------------------------------------------
// TC-PROF-003: getProfile with present profile → recorded value
// ---------------------------------------------------------------------------
describe("TC-PROF-003: getProfile returns the recorded profile when present", () => {
  it("returns the profile object as-is", () => {
    const customProfile: EffectiveProfile = {
      id: "custom",
      schemaVersion: 1,
      policyDigest: "sha256:abc123",
      budget: {},
      assurance: {},
    };
    const result = getProfile({ profile: customProfile });
    expect(result).toBe(customProfile);
  });

  it("returns STANDARD_PROFILE when profile is STANDARD_PROFILE", () => {
    const result = getProfile({ profile: STANDARD_PROFILE });
    expect(result).toBe(STANDARD_PROFILE);
  });
});

// ---------------------------------------------------------------------------
// TC-PROF-004: computePolicyDigest ignores policyDigest; sensitive to body fields
// ---------------------------------------------------------------------------
describe("TC-PROF-004: computePolicyDigest sensitivity and invariance", () => {
  it("is invariant to changes in policyDigest field", () => {
    const original = computePolicyDigest(STANDARD_PROFILE);
    // Create a profile with a tampered policyDigest
    const tampered: EffectiveProfile = { ...STANDARD_PROFILE, policyDigest: "sha256:deadbeef" };
    // computePolicyDigest excludes policyDigest from the hash input
    expect(computePolicyDigest(tampered)).toBe(original);
  });

  it("changes when id changes", () => {
    const base = computePolicyDigest(STANDARD_PROFILE);
    const modified = computePolicyDigest({ ...STANDARD_PROFILE, id: "other" });
    expect(modified).not.toBe(base);
  });

  it("changes when schemaVersion changes", () => {
    const base = computePolicyDigest(STANDARD_PROFILE);
    const modified = computePolicyDigest({ ...STANDARD_PROFILE, schemaVersion: 99 });
    expect(modified).not.toBe(base);
  });

  it("changes when budget changes", () => {
    const base = computePolicyDigest(STANDARD_PROFILE);
    const modified = computePolicyDigest({ ...STANDARD_PROFILE, budget: { maxTokens: 1000 } });
    expect(modified).not.toBe(base);
  });

  it("changes when assurance changes", () => {
    const base = computePolicyDigest(STANDARD_PROFILE);
    const modified = computePolicyDigest({ ...STANDARD_PROFILE, assurance: { level: "high" } });
    expect(modified).not.toBe(base);
  });

  it("returns a sha256: prefixed string", () => {
    expect(computePolicyDigest(STANDARD_PROFILE)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

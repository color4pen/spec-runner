/**
 * Unit tests for satisfiesFloor, AssuranceFloor, and ProfileAssurance structure.
 *
 * TC-001: satisfiesFloor — 全制約フィールドが rank 以上のとき true を返す
 * TC-002: satisfiesFloor — 制約フィールドが rank 未満のとき false を返す
 * TC-003: satisfiesFloor — assurance にフィールドが欠落 / 未知値のとき fail-closed で false
 * TC-004: satisfiesFloor — 空 floor は任意の assurance に対して true (should)
 * TC-005: STANDARD_PROFILE — assurance 構造化後も policyDigest が自己整合する
 * TC-006: STANDARD_PROFILE — assurance が任意の floor を満たす
 * TC-015: assurance:{} が ProfileAssurance に代入可能（後方互換）
 * TC-016: assurance:{ level:"high" } が ProfileAssurance に代入可能（index signature 互換）(should)
 * TC-017: STANDARD_PROFILE.assurance が最強値と deep-equal
 */
import { describe, it, expect } from "vitest";
import {
  satisfiesFloor,
  STANDARD_PROFILE,
  computePolicyDigest,
} from "../../../src/state/profile.js";
import type { AssuranceFloor } from "../../../src/state/profile.js";
import type { ProfileAssurance } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// TC-001: satisfiesFloor — all constrained fields meet or exceed their rank
// ---------------------------------------------------------------------------
describe("TC-001: satisfiesFloor — 全制約フィールドが rank 以上のとき true を返す", () => {
  it("returns true when all constrained fields equal the floor rank", () => {
    // Spec scenario: assurance testDerivation=frozen, biteEvidence=required, specReview=required
    // floor: testDerivation=frozen, biteEvidence=required  (specReview unconstrained)
    const assurance: ProfileAssurance = {
      testDerivation: "frozen",
      biteEvidence: "required",
      specReview: "required",
    };
    const floor: AssuranceFloor = {
      testDerivation: "frozen",
      biteEvidence: "required",
    };
    expect(satisfiesFloor(assurance, floor)).toBe(true);
  });

  it("returns true when assurance rank exceeds the floor rank for a field", () => {
    // testDerivation frozen > coupled → satisfies floor that requires "coupled"
    const assurance: ProfileAssurance = { testDerivation: "frozen", biteEvidence: "required", specReview: "required" };
    const floor: AssuranceFloor = { testDerivation: "coupled", biteEvidence: "optional" };
    expect(satisfiesFloor(assurance, floor)).toBe(true);
  });

  it("returns true for a single constrained field that meets the rank", () => {
    const assurance: ProfileAssurance = { testDerivation: "frozen" };
    const floor: AssuranceFloor = { testDerivation: "frozen" };
    expect(satisfiesFloor(assurance, floor)).toBe(true);
  });

  it("returns true when specReview field is constrained and met", () => {
    const assurance: ProfileAssurance = { specReview: "required" };
    const floor: AssuranceFloor = { specReview: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: satisfiesFloor — a constrained field is below the floor rank
// ---------------------------------------------------------------------------
describe("TC-002: satisfiesFloor — 制約フィールドが rank 未満のとき false を返す", () => {
  it("returns false when testDerivation is coupled but floor requires frozen", () => {
    // Spec scenario: coupled < frozen in the lattice
    const assurance: ProfileAssurance = {
      testDerivation: "coupled",
      biteEvidence: "required",
      specReview: "required",
    };
    const floor: AssuranceFloor = { testDerivation: "frozen" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when biteEvidence is optional but floor requires required", () => {
    // optional < required
    const assurance: ProfileAssurance = { biteEvidence: "optional" };
    const floor: AssuranceFloor = { biteEvidence: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when specReview is omitted but floor requires required", () => {
    // omitted < required
    const assurance: ProfileAssurance = { specReview: "omitted" };
    const floor: AssuranceFloor = { specReview: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when one field satisfies the floor but another does not", () => {
    const assurance: ProfileAssurance = { testDerivation: "frozen", biteEvidence: "optional" };
    const floor: AssuranceFloor = { testDerivation: "frozen", biteEvidence: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003: satisfiesFloor — absent or unknown field fails closed
// ---------------------------------------------------------------------------
describe("TC-003: satisfiesFloor — assurance にフィールドが欠落 / 未知値のとき fail-closed で false", () => {
  it("returns false when constrained field is absent from assurance (empty assurance)", () => {
    // Spec scenario: assurance {} with floor { biteEvidence: "required" } → false (fail-closed)
    const assurance: ProfileAssurance = {};
    const floor: AssuranceFloor = { biteEvidence: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when constrained field is absent but other fields are present", () => {
    const assurance: ProfileAssurance = { testDerivation: "frozen" };
    const floor: AssuranceFloor = { testDerivation: "frozen", biteEvidence: "required" };
    // biteEvidence is absent from assurance
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when assurance value is not a recognized rank (unknown value)", () => {
    // An unknown/unrecognized value should fail-closed
    const assurance: ProfileAssurance = { testDerivation: "unknown-value" };
    const floor: AssuranceFloor = { testDerivation: "coupled" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });

  it("returns false when assurance is empty and floor constrains all fields", () => {
    const assurance: ProfileAssurance = {};
    const floor: AssuranceFloor = { testDerivation: "frozen", biteEvidence: "required", specReview: "required" };
    expect(satisfiesFloor(assurance, floor)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-004: satisfiesFloor — empty floor is satisfied by any assurance (should)
// ---------------------------------------------------------------------------
describe("TC-004: satisfiesFloor — 空 floor は任意の assurance に対して true", () => {
  it("returns true for empty floor and empty assurance", () => {
    expect(satisfiesFloor({}, {})).toBe(true);
  });

  it("returns true for empty floor and full assurance", () => {
    const assurance: ProfileAssurance = { testDerivation: "frozen", biteEvidence: "required", specReview: "required" };
    expect(satisfiesFloor(assurance, {})).toBe(true);
  });

  it("returns true for empty floor and sub-floor assurance", () => {
    const assurance: ProfileAssurance = { testDerivation: "coupled", biteEvidence: "optional", specReview: "omitted" };
    expect(satisfiesFloor(assurance, {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005: STANDARD_PROFILE — policyDigest は自己整合する
// ---------------------------------------------------------------------------
describe("TC-005: STANDARD_PROFILE — assurance 構造化後も policyDigest が自己整合する", () => {
  it("STANDARD_PROFILE.policyDigest equals computePolicyDigest(STANDARD_PROFILE)", () => {
    expect(STANDARD_PROFILE.policyDigest).toBe(computePolicyDigest(STANDARD_PROFILE));
  });

  it("policyDigest starts with sha256:", () => {
    expect(STANDARD_PROFILE.policyDigest).toMatch(/^sha256:/);
  });

  it("id is 'standard'", () => {
    expect(STANDARD_PROFILE.id).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// TC-006: STANDARD_PROFILE — assurance satisfies any floor
// ---------------------------------------------------------------------------
describe("TC-006: STANDARD_PROFILE — assurance が任意の floor を満たす", () => {
  it("satisfies floor { testDerivation: 'frozen' }", () => {
    const floor: AssuranceFloor = { testDerivation: "frozen" };
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, floor)).toBe(true);
  });

  it("satisfies floor { biteEvidence: 'required' }", () => {
    const floor: AssuranceFloor = { biteEvidence: "required" };
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, floor)).toBe(true);
  });

  it("satisfies floor { specReview: 'required' }", () => {
    const floor: AssuranceFloor = { specReview: "required" };
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, floor)).toBe(true);
  });

  it("satisfies the maximum floor (all fields at highest rank)", () => {
    const floor: AssuranceFloor = {
      testDerivation: "frozen",
      biteEvidence: "required",
      specReview: "required",
    };
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, floor)).toBe(true);
  });

  it("satisfies empty floor", () => {
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, {})).toBe(true);
  });

  it("satisfies floor { testDerivation: 'coupled' } (below maximum)", () => {
    const floor: AssuranceFloor = { testDerivation: "coupled" };
    expect(satisfiesFloor(STANDARD_PROFILE.assurance, floor)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015: assurance:{} が ProfileAssurance に代入可能（後方互換）
// ---------------------------------------------------------------------------
describe("TC-015: assurance:{} が ProfileAssurance に代入可能（後方互換）", () => {
  it("empty object literal is assignable to ProfileAssurance (no compile errors)", () => {
    // Type-level check: if this compiles, {} is assignable to ProfileAssurance.
    // Also verify runtime: computePolicyDigest accepts it without throwing.
    const assurance: ProfileAssurance = {};
    const digest = computePolicyDigest({ id: "test-r1", schemaVersion: 1, budget: {}, assurance });
    expect(digest).toMatch(/^sha256:/);
  });

  it("ProfileAssurance with {} is accepted by computePolicyDigest", () => {
    const profile = {
      id: "test",
      schemaVersion: 1,
      budget: {} as ProfileAssurance,
      assurance: {} as ProfileAssurance,
    };
    expect(() => computePolicyDigest(profile)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-016: assurance:{ level:"high" } が ProfileAssurance に代入可能（index signature 互換）(should)
// ---------------------------------------------------------------------------
describe("TC-016: assurance:{ level:'high' } が ProfileAssurance に代入可能（index signature 互換）", () => {
  it("object with unknown key 'level' is assignable to ProfileAssurance (no excess-property error)", () => {
    // The index signature [key: string]: unknown should allow this.
    const assurance: ProfileAssurance = { level: "high" };
    const digest = computePolicyDigest({ id: "test-legacy", schemaVersion: 1, budget: {}, assurance });
    expect(digest).toMatch(/^sha256:/);
  });
});

// ---------------------------------------------------------------------------
// TC-017: STANDARD_PROFILE.assurance が最強値と deep-equal
// ---------------------------------------------------------------------------
describe("TC-017: STANDARD_PROFILE.assurance が最強値と deep-equal", () => {
  it("STANDARD_PROFILE.assurance equals { testDerivation: 'frozen', biteEvidence: 'required', specReview: 'required' }", () => {
    expect(STANDARD_PROFILE.assurance).toEqual({
      testDerivation: "frozen",
      biteEvidence: "required",
      specReview: "required",
    });
  });

  it("STANDARD_PROFILE.assurance has testDerivation: 'frozen' (strongest)", () => {
    expect((STANDARD_PROFILE.assurance as Record<string, unknown>)["testDerivation"]).toBe("frozen");
  });

  it("STANDARD_PROFILE.assurance has biteEvidence: 'required' (strongest)", () => {
    expect((STANDARD_PROFILE.assurance as Record<string, unknown>)["biteEvidence"]).toBe("required");
  });

  it("STANDARD_PROFILE.assurance has specReview: 'required' (strongest)", () => {
    expect((STANDARD_PROFILE.assurance as Record<string, unknown>)["specReview"]).toBe("required");
  });
});

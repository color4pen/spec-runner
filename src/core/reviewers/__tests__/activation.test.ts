/**
 * Unit tests for evaluateActivation (T-02).
 */
import { describe, it, expect } from "vitest";
import { evaluateActivation } from "../activation.js";
import type { ActivationFacts } from "../activation.js";

const FACTS_BUG_FIX: ActivationFacts = {
  changedFiles: ["src/auth/login.ts", "src/util/helper.ts"],
  requestType: "bug-fix",
};

const FACTS_NEW_FEATURE: ActivationFacts = {
  changedFiles: ["src/feature/new.ts"],
  requestType: "new-feature",
};

// ---------------------------------------------------------------------------
// No conditions → always activate
// ---------------------------------------------------------------------------

describe("evaluateActivation — no conditions", () => {
  it("activated: true when cond is undefined", () => {
    const result = evaluateActivation(undefined, FACTS_BUG_FIX);
    expect(result.activated).toBe(true);
  });

  it("activated: true when cond is empty object ({})", () => {
    const result = evaluateActivation({}, FACTS_BUG_FIX);
    expect(result.activated).toBe(true);
  });

  it("activated: true when cond has no paths or requestTypes", () => {
    const result = evaluateActivation({ paths: undefined, requestTypes: undefined }, FACTS_BUG_FIX);
    expect(result.activated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requestTypes condition
// ---------------------------------------------------------------------------

describe("evaluateActivation — requestTypes", () => {
  it("activated: true when requestType is in the list", () => {
    const result = evaluateActivation(
      { requestTypes: ["bug-fix", "new-feature"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(true);
  });

  it("activated: false when requestType is NOT in the list", () => {
    const result = evaluateActivation(
      { requestTypes: ["spec-change", "new-feature"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toContain("bug-fix");
    expect(result.reason).toContain("spec-change");
  });

  it("reason includes requestType and allowed list when not matching", () => {
    const result = evaluateActivation(
      { requestTypes: ["spec-change"] },
      FACTS_NEW_FEATURE,
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toContain("new-feature");
  });
});

// ---------------------------------------------------------------------------
// paths condition
// ---------------------------------------------------------------------------

describe("evaluateActivation — paths", () => {
  it("activated: true when at least one changed file matches a pattern", () => {
    const result = evaluateActivation(
      { paths: ["src/auth/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(true);
  });

  it("activated: false when no changed files match any pattern", () => {
    const result = evaluateActivation(
      { paths: ["src/security/**", "db/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toContain("no changed files matched");
  });

  it("reason includes pattern list when not matching", () => {
    const result = evaluateActivation(
      { paths: ["db/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.reason).toContain("db/**");
  });
});

// ---------------------------------------------------------------------------
// AND semantics — both conditions
// ---------------------------------------------------------------------------

describe("evaluateActivation — AND semantics", () => {
  it("activated: true when BOTH requestTypes and paths match", () => {
    const result = evaluateActivation(
      { requestTypes: ["bug-fix"], paths: ["src/auth/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(true);
  });

  it("activated: false when requestTypes matches but paths does NOT", () => {
    const result = evaluateActivation(
      { requestTypes: ["bug-fix"], paths: ["src/security/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toContain("no changed files matched");
  });

  it("activated: false when paths match but requestTypes does NOT", () => {
    const result = evaluateActivation(
      { requestTypes: ["spec-change"], paths: ["src/auth/**"] },
      FACTS_BUG_FIX,
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toContain("bug-fix");
  });
});

// ---------------------------------------------------------------------------
// reason field on success
// ---------------------------------------------------------------------------

describe("evaluateActivation — reason on success", () => {
  it('reason is "activated" when conditions pass', () => {
    const result = evaluateActivation({ requestTypes: ["bug-fix"] }, FACTS_BUG_FIX);
    expect(result.reason).toBe("activated");
  });
});

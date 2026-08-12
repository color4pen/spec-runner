/**
 * Unit tests for src/config/type-config.ts
 *
 * TC: TYPE_CONFIG has exactly 5 types (new-feature, bug-fix, spec-change, refactoring, chore)
 * TC: getBranchPrefix returns correct prefix for each known type
 * TC: getBranchPrefix falls back to "feat/" for unknown types
 * TC: getSpecReviewMode returns correct mode for each known type
 * TC: getSpecReviewMode falls back to "full" for unknown types
 *
 * TC-001: chore is isTestGenRequired=false (test-gen exempt)
 * TC-002: 非免除 4 type は isTestGenRequired が true を返す
 * TC-003: 未知 type は fail-closed で isTestGenRequired が true を返す
 * TC-011: TYPE_CONFIG の全 5 entry に testGenRequired フィールドが存在し entry 数は 5 のまま
 */
import { describe, it, expect } from "vitest";
import {
  TYPE_CONFIG,
  getBranchPrefix,
  getSpecReviewMode,
  isTestGenRequired,
} from "../../src/config/type-config.js";

describe("TYPE_CONFIG — 5 canonical types defined", () => {
  const expectedTypes = ["new-feature", "bug-fix", "spec-change", "refactoring", "chore"];

  it("has exactly 5 types", () => {
    expect(Object.keys(TYPE_CONFIG)).toHaveLength(5);
  });

  for (const t of expectedTypes) {
    it(`defines type: ${t}`, () => {
      expect(TYPE_CONFIG[t]).toBeDefined();
    });

    it(`${t} has branchPrefix`, () => {
      expect(typeof TYPE_CONFIG[t]?.branchPrefix).toBe("string");
      expect(TYPE_CONFIG[t]?.branchPrefix.length).toBeGreaterThan(0);
    });

    it(`${t} has specReviewMode`, () => {
      const mode = TYPE_CONFIG[t]?.specReviewMode;
      expect(mode === "full" || mode === "lightweight").toBe(true);
    });
  }
});

describe("TYPE_CONFIG — specific values", () => {
  it("new-feature: branchPrefix=feat/, specReviewMode=full", () => {
    expect(TYPE_CONFIG["new-feature"]?.branchPrefix).toBe("feat/");
    expect(TYPE_CONFIG["new-feature"]?.specReviewMode).toBe("full");
  });

  it("spec-change: branchPrefix=change/, specReviewMode=full", () => {
    expect(TYPE_CONFIG["spec-change"]?.branchPrefix).toBe("change/");
    expect(TYPE_CONFIG["spec-change"]?.specReviewMode).toBe("full");
  });

  it("refactoring: branchPrefix=refactor/, specReviewMode=lightweight", () => {
    expect(TYPE_CONFIG["refactoring"]?.branchPrefix).toBe("refactor/");
    expect(TYPE_CONFIG["refactoring"]?.specReviewMode).toBe("lightweight");
  });

  it("bug-fix: branchPrefix=fix/, specReviewMode=full", () => {
    expect(TYPE_CONFIG["bug-fix"]?.branchPrefix).toBe("fix/");
    expect(TYPE_CONFIG["bug-fix"]?.specReviewMode).toBe("full");
  });

  it("chore: branchPrefix=chore/, specReviewMode=lightweight", () => {
    expect(TYPE_CONFIG["chore"]?.branchPrefix).toBe("chore/");
    expect(TYPE_CONFIG["chore"]?.specReviewMode).toBe("lightweight");
  });
});

describe("getBranchPrefix — known types", () => {
  it("new-feature → feat/", () => {
    expect(getBranchPrefix("new-feature")).toBe("feat/");
  });

  it("spec-change → change/", () => {
    expect(getBranchPrefix("spec-change")).toBe("change/");
  });

  it("refactoring → refactor/", () => {
    expect(getBranchPrefix("refactoring")).toBe("refactor/");
  });

  it("bug-fix → fix/", () => {
    expect(getBranchPrefix("bug-fix")).toBe("fix/");
  });

  it("chore → chore/", () => {
    expect(getBranchPrefix("chore")).toBe("chore/");
  });
});

describe("getBranchPrefix — unknown type fallback", () => {
  it("returns feat/ for unknown type", () => {
    expect(getBranchPrefix("unknown-type")).toBe("feat/");
  });

  it("returns feat/ for empty string", () => {
    expect(getBranchPrefix("")).toBe("feat/");
  });

  it("returns feat/ for legacy 'refactor' (old type name)", () => {
    // old type name 'refactor' is not in TYPE_CONFIG; falls back to feat/
    expect(getBranchPrefix("refactor")).toBe("feat/");
  });
});

describe("getSpecReviewMode — known types", () => {
  it("new-feature → full", () => {
    expect(getSpecReviewMode("new-feature")).toBe("full");
  });

  it("spec-change → full", () => {
    expect(getSpecReviewMode("spec-change")).toBe("full");
  });

  it("refactoring → lightweight", () => {
    expect(getSpecReviewMode("refactoring")).toBe("lightweight");
  });

  it("bug-fix → full", () => {
    expect(getSpecReviewMode("bug-fix")).toBe("full");
  });

  it("chore → lightweight", () => {
    expect(getSpecReviewMode("chore")).toBe("lightweight");
  });
});

describe("getSpecReviewMode — unknown type fallback", () => {
  it("returns full for unknown type", () => {
    expect(getSpecReviewMode("unknown-type")).toBe("full");
  });

  it("returns full for empty string", () => {
    expect(getSpecReviewMode("")).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// TC-001: chore は isTestGenRequired が false を返す
// Source: spec.md > Requirement: テスト生成要否は request type で宣言的に決まる
//         > Scenario: chore はテスト生成免除
// ---------------------------------------------------------------------------
describe("isTestGenRequired — TC-001: chore is test-gen exempt", () => {
  it("TC-001: isTestGenRequired('chore') returns false", () => {
    expect(isTestGenRequired("chore")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 非免除 4 type は isTestGenRequired が true を返す
// Source: spec.md > Scenario: 非免除 type はテスト生成必須
// ---------------------------------------------------------------------------
describe("isTestGenRequired — TC-002: non-exempt types return true", () => {
  const nonExemptTypes = ["new-feature", "spec-change", "refactoring", "bug-fix"] as const;

  for (const t of nonExemptTypes) {
    it(`TC-002: isTestGenRequired('${t}') returns true`, () => {
      expect(isTestGenRequired(t)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-003: 未知 type は fail-closed で isTestGenRequired が true を返す
// Source: spec.md > Scenario: 未知 type は fail-closed で免除されない
// ---------------------------------------------------------------------------
describe("isTestGenRequired — TC-003: unknown types are fail-closed (non-exempt)", () => {
  it("TC-003: isTestGenRequired('docs') returns true (fail-closed)", () => {
    expect(isTestGenRequired("docs")).toBe(true);
  });

  it("TC-003: isTestGenRequired('unknown-type') returns true (fail-closed)", () => {
    expect(isTestGenRequired("unknown-type")).toBe(true);
  });

  it("TC-003: isTestGenRequired('') returns true (fail-closed)", () => {
    expect(isTestGenRequired("")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-011: TYPE_CONFIG の全 5 entry に testGenRequired フィールドが存在し entry 数は 5 のまま
// Source: tasks.md > T-01
// ---------------------------------------------------------------------------
describe("TYPE_CONFIG — TC-011: all 5 entries have testGenRequired boolean", () => {
  it("TC-011: Object.keys(TYPE_CONFIG) has exactly 5 entries", () => {
    expect(Object.keys(TYPE_CONFIG)).toHaveLength(5);
  });

  it("TC-011: all 5 entries define testGenRequired as boolean", () => {
    for (const [key, entry] of Object.entries(TYPE_CONFIG)) {
      expect(
        typeof (entry as { testGenRequired?: unknown }).testGenRequired,
        `${key}.testGenRequired should be boolean`,
      ).toBe("boolean");
    }
  });

  it("TC-011: chore has testGenRequired=false, others have testGenRequired=true", () => {
    expect((TYPE_CONFIG["chore"] as { testGenRequired?: boolean }).testGenRequired).toBe(false);
    for (const type of ["new-feature", "spec-change", "refactoring", "bug-fix"] as const) {
      expect(
        (TYPE_CONFIG[type] as { testGenRequired?: boolean }).testGenRequired,
        `${type}.testGenRequired should be true`,
      ).toBe(true);
    }
  });
});

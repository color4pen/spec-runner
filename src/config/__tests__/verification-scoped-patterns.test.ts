/**
 * Unit tests for the scopedTestPatterns config field validation.
 *
 * Covers:
 *   TC-006: empty array is rejected with CONFIG_INVALID
 *   TC-007: non-string element is rejected with CONFIG_INVALID
 *   TC-008: valid patterns are preserved on the resolved config
 *   TC-023: field absent validates unchanged (no default injected at config layer)
 *   TC-024: empty-string element in the array is rejected with CONFIG_INVALID
 */

import { describe, it, expect } from "vitest";
import { validateConfig } from "../schema.js";

// ---------------------------------------------------------------------------
// TC-006: empty array is rejected with CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-006: empty array is rejected with CONFIG_INVALID", () => {
  it("TC-006: verification.scopedTestPatterns: [] throws with code CONFIG_INVALID", () => {
    // GIVEN a config with verification.scopedTestPatterns: []
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: [],
      },
    };

    // WHEN the config is validated
    // THEN validation throws an error with code CONFIG_INVALID
    let caught: unknown;
    try {
      validateConfig(raw);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });
});

// ---------------------------------------------------------------------------
// TC-007: non-string element is rejected with CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-007: non-string element is rejected with CONFIG_INVALID", () => {
  it("TC-007: verification.scopedTestPatterns: [\"**/*.test.ts\", 42] throws CONFIG_INVALID", () => {
    // GIVEN a config with verification.scopedTestPatterns: ["**/*.test.ts", 42]
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*.test.ts", 42],
      },
    };

    // WHEN the config is validated
    // THEN validation throws an error with code CONFIG_INVALID
    let caught: unknown;
    try {
      validateConfig(raw as never);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });

  it("TC-007: verification.scopedTestPatterns with boolean element throws CONFIG_INVALID", () => {
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: [true],
      },
    };

    let caught: unknown;
    try {
      validateConfig(raw as never);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });
});

// ---------------------------------------------------------------------------
// TC-008: valid patterns are preserved on the resolved config
// ---------------------------------------------------------------------------

describe("TC-008: valid patterns are preserved on the resolved config", () => {
  it("TC-008: verification.scopedTestPatterns: [\"**/*.test.ts\"] validates and is preserved", () => {
    // GIVEN a config with verification.scopedTestPatterns: ["**/*.test.ts"]
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*.test.ts"],
      },
    };

    // WHEN the config is validated
    const cfg = validateConfig(raw);

    // THEN validation succeeds and the field is preserved
    expect(cfg.verification?.scopedTestPatterns).toEqual(["**/*.test.ts"]);
  });

  it("TC-008: multiple patterns are all preserved", () => {
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*.test.ts", "**/*.spec.rb", "**/*_test.go"],
      },
    };

    const cfg = validateConfig(raw);

    expect(cfg.verification?.scopedTestPatterns).toEqual([
      "**/*.test.ts",
      "**/*.spec.rb",
      "**/*_test.go",
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-023: field absent validates unchanged (no default injected at config layer)
// ---------------------------------------------------------------------------

describe("TC-023: field absent validates unchanged (no default injected at config layer)", () => {
  it("TC-023: verification without scopedTestPatterns validates — field is absent, no default injected", () => {
    // GIVEN a config whose verification block does not include scopedTestPatterns
    const raw = {
      version: 1,
      agents: {},
      verification: {
        commands: ["bun run test"],
      },
    };

    // WHEN the config is validated
    const cfg = validateConfig(raw);

    // THEN validation succeeds and scopedTestPatterns is absent
    expect(cfg.verification?.scopedTestPatterns).toBeUndefined();
  });

  it("TC-023: verification absent entirely — scopedTestPatterns is absent", () => {
    const raw = {
      version: 1,
      agents: {},
    };

    const cfg = validateConfig(raw);

    // No default injected
    expect(cfg.verification?.scopedTestPatterns).toBeUndefined();
  });

  it("TC-023: empty verification block — scopedTestPatterns is absent", () => {
    const raw = {
      version: 1,
      agents: {},
      verification: {},
    };

    expect(() => validateConfig(raw)).not.toThrow();
    const cfg = validateConfig(raw);
    expect(cfg.verification?.scopedTestPatterns).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-024: empty-string element in the array is rejected with CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-024: empty-string element in the array is rejected with CONFIG_INVALID", () => {
  it("TC-024: verification.scopedTestPatterns: [\"\"] (empty string) throws CONFIG_INVALID", () => {
    // GIVEN a config with verification.scopedTestPatterns: [""] (one empty string)
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: [""],
      },
    };

    // WHEN the config is validated
    // THEN validation throws an error with code CONFIG_INVALID
    let caught: unknown;
    try {
      validateConfig(raw);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });

  it("TC-024: mixed valid and empty-string elements throws CONFIG_INVALID", () => {
    const raw = {
      version: 1,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*.test.ts", ""],
      },
    };

    let caught: unknown;
    try {
      validateConfig(raw);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("CONFIG_INVALID");
  });
});

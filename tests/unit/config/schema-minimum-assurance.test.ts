/**
 * Unit tests for minimumAssurance config validation.
 *
 * TC-008: well-formed な minimumAssurance config が検証を通過する
 * TC-009: 不正な level 値が config 検証で拒否される
 * TC-018: protectedPaths が配列でない場合に config 検証が拒否する (should)
 * TC-038: archive.minimumAssurance.biteEvidence は CONFIG_INVALID エラーを発生させる
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";

const baseConfig = { version: 1, agents: {} };

// ---------------------------------------------------------------------------
// TC-008: well-formed minimumAssurance config parses
// ---------------------------------------------------------------------------
describe("TC-008: well-formed な minimumAssurance config が検証を通過する", () => {
  it("accepts minimumAssurance with protectedPaths and active level fields (testDerivation, specReview)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: "frozen",
          specReview: "required",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.protectedPaths).toEqual(["architecture/**"]);
    expect(result.archive?.minimumAssurance?.testDerivation).toBe("frozen");
    expect(result.archive?.minimumAssurance?.specReview).toBe("required");
  });

  it("accepts minimumAssurance with only protectedPaths (all level fields optional)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.protectedPaths).toEqual(["architecture/**"]);
  });

  it("accepts minimumAssurance with partial level fields (testDerivation only)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: "frozen",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.testDerivation).toBe("frozen");
    expect(result.archive?.minimumAssurance?.specReview).toBeUndefined();
  });

  it("accepts minimumAssurance with multiple protected path patterns", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**", "src/state/schema/**"],
          testDerivation: "frozen",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.protectedPaths).toHaveLength(2);
  });

  it("accepts archive config with existing fields alongside minimumAssurance", () => {
    const raw = {
      ...baseConfig,
      archive: {
        mergeWaitTimeoutMs: 600_000,
        protectedPaths: [".github/workflows/**"],
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: "frozen",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts minimumAssurance with testDerivation: 'coupled' (lower rank value)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["src/state/**"],
          testDerivation: "coupled",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.testDerivation).toBe("coupled");
  });

  it("accepts minimumAssurance with specReview: 'omitted' (lower rank value)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          specReview: "omitted",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.minimumAssurance?.specReview).toBe("omitted");
  });
});

// ---------------------------------------------------------------------------
// TC-009: 不正な level 値が config 検証で拒否される
// ---------------------------------------------------------------------------
describe("TC-009: 不正な level 値が config 検証で拒否される", () => {
  it("rejects invalid testDerivation value 'locked'", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: "locked",
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("rejects invalid specReview value 'partial'", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          specReview: "partial",
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("rejects numeric value for testDerivation", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: 1,
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });
});

// ---------------------------------------------------------------------------
// TC-018: protectedPaths が配列でない場合に config 検証が拒否する (should)
// ---------------------------------------------------------------------------
describe("TC-018: protectedPaths が配列でない場合に config 検証が拒否する", () => {
  it("rejects minimumAssurance.protectedPaths when it is a string instead of array", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: "architecture/**",  // should be an array
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("protectedPaths");
  });

  it("rejects minimumAssurance.protectedPaths when it is null", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: null,
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("rejects minimumAssurance when protectedPaths is absent (required field)", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          testDerivation: "frozen",
          // protectedPaths is required but absent
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });
});

// ---------------------------------------------------------------------------
// TC-038: archive.minimumAssurance.biteEvidence は CONFIG_INVALID エラーを発生させる
// ---------------------------------------------------------------------------
describe("TC-038: archive.minimumAssurance.biteEvidence は CONFIG_INVALID エラーを発生させる", () => {
  it("rejects biteEvidence: 'required'", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          biteEvidence: "required",
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("archive.minimumAssurance.biteEvidence");
  });

  it("rejects biteEvidence: 'optional'", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          biteEvidence: "optional",
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("archive.minimumAssurance.biteEvidence");
  });

  it("rejects biteEvidence: null", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          biteEvidence: null,
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("archive.minimumAssurance.biteEvidence");
  });

  it("a config with only testDerivation and specReview (no biteEvidence) validates successfully", () => {
    const raw = {
      ...baseConfig,
      archive: {
        minimumAssurance: {
          protectedPaths: ["architecture/**"],
          testDerivation: "frozen",
          specReview: "required",
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

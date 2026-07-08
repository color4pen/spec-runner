/**
 * Unit tests for verification.coverage config validation (T-01).
 *
 * TC-COV-CFG-01: well-formed coverage config → passes validation
 * TC-COV-CFG-02: coverage with all optional fields → passes validation
 * TC-COV-CFG-03: coverage.include missing → CONFIG_INVALID
 * TC-COV-CFG-04: coverage.include empty array → CONFIG_INVALID
 * TC-COV-CFG-05: coverage.lcovPath missing → CONFIG_INVALID
 * TC-COV-CFG-06: coverage.lcovPath empty string → CONFIG_INVALID
 * TC-COV-CFG-07: coverage.command as object form → passes validation
 * TC-COV-CFG-08: coverage.minChangedLineCoverage=0 → rejected (degenerate: weaker than default)
 * TC-COV-CFG-09: coverage.minChangedLineCoverage=1 → passes (upper boundary)
 * TC-COV-CFG-10: coverage.minChangedLineCoverage=-0.1 → CONFIG_INVALID
 * TC-COV-CFG-11: coverage.minChangedLineCoverage=1.1 → CONFIG_INVALID
 * TC-COV-CFG-12: existing verification.commands still passes with coverage absent
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";

const baseConfig = { version: 1 as const, agents: {} };

describe("TC-COV-CFG-01: well-formed coverage config (string command) → passes", () => {
  it("minimal well-formed config passes validation", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "vitest run --coverage",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-02: coverage with all optional fields → passes", () => {
  it("full coverage config with exclude and minChangedLineCoverage", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "bun test --coverage",
          lcovPath: "coverage/lcov.info",
          include: ["src/**", "lib/**"],
          exclude: ["src/generated/**"],
          minChangedLineCoverage: 0.8,
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-03: coverage.include missing → CONFIG_INVALID", () => {
  it("include field absent → validation error", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          // include deliberately omitted
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    // zod will report missing required field
    expect(err!.message).toContain("coverage");
  });
});

describe("TC-COV-CFG-04: coverage.include empty array → CONFIG_INVALID", () => {
  it("include: [] → validation error (must be non-empty)", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: [],
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("coverage.include");
  });
});

describe("TC-COV-CFG-05: coverage.lcovPath missing → CONFIG_INVALID", () => {
  it("lcovPath field absent → validation error", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          include: ["src/**"],
          // lcovPath deliberately omitted
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("coverage");
  });
});

describe("TC-COV-CFG-06: coverage.lcovPath empty string → CONFIG_INVALID", () => {
  it("lcovPath: '' → validation error (must be non-empty)", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "",
          include: ["src/**"],
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("coverage.lcovPath");
  });
});

describe("TC-COV-CFG-07: coverage.command as object form → passes", () => {
  it("command: { run: 'bun test' } → valid", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: { run: "bun test --coverage" },
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("command: { name: 'cov', run: 'pytest --cov' } → valid", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: { name: "cov", run: "pytest --cov" },
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-08: coverage.minChangedLineCoverage=0 → rejected (degenerate: weaker than default)", () => {
  it("minChangedLineCoverage: 0 → invalid (ratio >= 0 is always true, weaker than the >0 default)", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          minChangedLineCoverage: 0,
        },
      },
    };
    expect(() => validateConfig(raw)).toThrow();
  });

  it("minChangedLineCoverage: 0.01 → valid (smallest meaningful strengthening)", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          minChangedLineCoverage: 0.01,
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-09: coverage.minChangedLineCoverage=1 → passes (upper boundary)", () => {
  it("minChangedLineCoverage: 1 → valid", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          minChangedLineCoverage: 1,
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-10: coverage.minChangedLineCoverage < 0 → CONFIG_INVALID", () => {
  it("minChangedLineCoverage: -0.1 → validation error", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          minChangedLineCoverage: -0.1,
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("coverage.minChangedLineCoverage");
  });
});

describe("TC-COV-CFG-11: coverage.minChangedLineCoverage > 1 → CONFIG_INVALID", () => {
  it("minChangedLineCoverage: 1.1 → validation error", () => {
    const raw = {
      ...baseConfig,
      verification: {
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
          minChangedLineCoverage: 1.1,
        },
      },
    };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("coverage.minChangedLineCoverage");
  });
});

describe("TC-COV-CFG-12: existing verification.commands still valid with coverage absent", () => {
  it("commands present, coverage absent → passes (backward compat)", () => {
    const raw = {
      ...baseConfig,
      verification: {
        commands: ["bun run build", { run: "bun test" }],
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-COV-CFG-13: both commands and coverage declared → passes", () => {
  it("commands + coverage → valid combined config", () => {
    const raw = {
      ...baseConfig,
      verification: {
        commands: ["bun run typecheck"],
        coverage: {
          command: "bun test --coverage",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

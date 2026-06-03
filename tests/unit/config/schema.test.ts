/**
 * Unit tests for config schema validation — jobs field backward compatibility
 * and verification section validation.
 *
 * TC-JOBS-01: jobs section absent → valid (backward compat)
 * TC-JOBS-02: jobs.location: "xdg" in old config → no error, treated as unknown field
 * TC-VERIF-01: valid commands array (string / object / mixed) → validation passes
 * TC-VERIF-02: verification section absent → validation passes
 * TC-VERIF-03: empty commands array → validation passes
 * TC-VERIF-04: commands is not an array → CONFIG_INVALID
 * TC-VERIF-05: commands element is empty string → CONFIG_INVALID
 * TC-VERIF-06: commands element run is empty string → CONFIG_INVALID
 * TC-VERIF-07: commands element is neither string nor object → CONFIG_INVALID
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";

const baseConfig = { version: 1, agents: {} };

describe("validateConfig: jobs field backward compatibility", () => {
  it("TC-JOBS-01: jobs section absent → valid", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
  });

  it("TC-JOBS-02: old config with jobs.location: 'xdg' → no error (unknown field ignored)", () => {
    // Old configs may have jobs: { location: "xdg" }. Validation must not reject them.
    const raw = { ...baseConfig, jobs: { location: "xdg" } };
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("validateConfig: verification section", () => {
  it("TC-VERIF-01: valid commands — string / object with name / object without name → passes", () => {
    const raw = {
      ...baseConfig,
      verification: {
        commands: [
          "bun run build",
          { run: "bun run test" },
          { name: "lint", run: "eslint ./src" },
        ],
      },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("TC-VERIF-02: verification section absent → validation passes", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
  });

  it("TC-VERIF-03: empty commands array → validation passes", () => {
    const raw = { ...baseConfig, verification: { commands: [] } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("TC-VERIF-04: commands is not an array → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, verification: { commands: "not-an-array" } };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID.*verification\.commands.*array/i);
  });

  it("TC-VERIF-05: commands element is empty string → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, verification: { commands: [""] } };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID.*verification\.commands\[0\]/);
  });

  it("TC-VERIF-06: commands element run is empty string → CONFIG_INVALID with key path", () => {
    const raw = { ...baseConfig, verification: { commands: [{ run: "" }] } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error; }
    })();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("verification.commands[0].run");
  });

  it("TC-VERIF-07: commands element is neither string nor object → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, verification: { commands: [42] } };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("TC-VERIF-08: verification is not an object → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, verification: "invalid" };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID.*verification/);
  });
});

// T-035 to T-040: logs.maxJobs validation
describe("validateConfig: logs section", () => {
  it("T-036: logs section absent → defaults to 20 (no error)", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
    const result = validateConfig(baseConfig);
    // When absent, logs field is not present (consumer uses ?? 20)
    expect(result.logs).toBeUndefined();
  });

  it("T-035: logs.maxJobs valid value → passes validation", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 5 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("T-040: logs.maxJobs=1 → valid (lower boundary)", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 1 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("T-040: logs.maxJobs=1000 → valid (upper boundary)", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 1000 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("T-037: logs.maxJobs=0 → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 0 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("logs.maxJobs");
  });

  it("T-038: logs.maxJobs=-1 → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, logs: { maxJobs: -1 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("T-039: logs.maxJobs=1001 → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 1001 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("logs.maxJobs non-integer → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, logs: { maxJobs: 3.5 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("logs is not an object → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, logs: "invalid" };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID.*logs/);
  });
});

// ---------------------------------------------------------------------------
// archive section validation
// ---------------------------------------------------------------------------
describe("validateConfig: archive section", () => {
  it("TC-ARCH-01: archive section absent → valid", () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
    const result = validateConfig(baseConfig);
    expect(result.archive).toBeUndefined();
  });

  it("TC-ARCH-02: archive.mergeWaitTimeoutMs valid number → passes", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: 600_000 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("TC-ARCH-03: archive.mergeWaitTimeoutMs null → passes (unlimited)", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: null } };
    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.archive?.mergeWaitTimeoutMs).toBeNull();
  });

  it("TC-ARCH-04: archive.mergeWaitTimeoutMs 0 → passes (0 = no wait)", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: 0 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("TC-ARCH-05: archive.mergeWaitTimeoutMs negative → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: -1 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("mergeWaitTimeoutMs");
  });

  it("TC-ARCH-06: archive.mergeWaitTimeoutMs non-integer → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: 1.5 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("TC-ARCH-07: archive.mergeWaitPollIntervalMs valid → passes", () => {
    const raw = { ...baseConfig, archive: { mergeWaitPollIntervalMs: 15_000 } };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("TC-ARCH-08: archive.mergeWaitPollIntervalMs 0 → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, archive: { mergeWaitPollIntervalMs: 0 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
    expect(err!.message).toContain("mergeWaitPollIntervalMs");
  });

  it("TC-ARCH-09: archive.mergeWaitPollIntervalMs negative → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, archive: { mergeWaitPollIntervalMs: -5 } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });

  it("TC-ARCH-10: archive is not an object → CONFIG_INVALID", () => {
    const raw = { ...baseConfig, archive: "invalid" };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID.*archive/);
  });

  it("TC-ARCH-11: no 'unlimited' string keyword accepted as mergeWaitTimeoutMs", () => {
    const raw = { ...baseConfig, archive: { mergeWaitTimeoutMs: "unlimited" } };
    const err = (() => {
      try { validateConfig(raw); return null; } catch (e) { return e as Error & { code?: string }; }
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe("CONFIG_INVALID");
  });
});

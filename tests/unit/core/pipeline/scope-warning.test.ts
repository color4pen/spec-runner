/**
 * Unit tests for scope-warning.ts pure functions.
 *
 * TC-SW-001: scopeConfigEmptyWarning — permissionScope absent → null
 * TC-SW-002: scopeConfigEmptyWarning — permissionScope present + forbidden ≥ 1 → null
 * TC-SW-003: scopeConfigEmptyWarning — permissionScope present + forbidden = 0 → warning string
 * TC-SW-004: scopeConfigEmptyWarning — warning contains pipeline id and config key
 * TC-SW-005: scopeConfigEmptyWarning — no stderr side effect
 * TC-SW-006: scopeConfigWarningForJob — fast + no surfaces config → non-null
 * TC-SW-007: scopeConfigWarningForJob — fast + surfaces config → null
 * TC-SW-008: scopeConfigWarningForJob — standard jobState → null (no scope)
 * TC-SW-009: scopeConfigWarningForJob — judgment on resolved descriptor (not static registry)
 * TC-SW-010: scopeConfigWarningForJob — no stderr side effect
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  scopeConfigEmptyWarning,
  scopeConfigWarningForJob,
} from "../../../../src/core/pipeline/scope-warning.js";
import {
  FAST_DESCRIPTOR,
  STANDARD_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../../src/core/pipeline/registry.js";
import { applyScopeConfig } from "../../../../src/core/pipeline/resolve-scope.js";
import type { PipelineDescriptor } from "../../../../src/core/pipeline/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SpecRunnerConfig>): SpecRunnerConfig {
  return { version: 1, agents: {}, ...overrides };
}

function makeConfigWithSurfaces(): SpecRunnerConfig {
  return makeConfig({
    pipeline: {
      fast: {
        forbiddenSurfaces: [
          { id: "public-types", paths: ["src/core/port/**"] },
          { id: "persisted-format", paths: ["src/state/schema.ts"] },
        ],
      },
    },
  });
}

function makeFastJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-fast-job",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-fast" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    pipelineId: "fast",
    ...overrides,
  };
}

function makeStandardJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-standard-job",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-standard" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    // pipelineId absent → defaults to "standard"
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// scopeConfigEmptyWarning
// ---------------------------------------------------------------------------

describe("TC-SW-001: scopeConfigEmptyWarning — permissionScope absent → null", () => {
  it("returns null for standard descriptor (no permissionScope)", () => {
    expect(scopeConfigEmptyWarning(STANDARD_DESCRIPTOR)).toBeNull();
  });

  it("returns null for design-only descriptor (no permissionScope)", () => {
    expect(scopeConfigEmptyWarning(DESIGN_ONLY_DESCRIPTOR)).toBeNull();
  });

  it("returns null for a custom descriptor without permissionScope", () => {
    const descriptor: PipelineDescriptor = {
      ...STANDARD_DESCRIPTOR,
      id: "custom-no-scope",
      // permissionScope intentionally absent
    };
    expect(scopeConfigEmptyWarning(descriptor)).toBeNull();
  });
});

describe("TC-SW-002: scopeConfigEmptyWarning — permissionScope present + forbidden ≥ 1 → null", () => {
  it("returns null for fast descriptor resolved with surfaces (forbidden ≥ 1)", () => {
    const config = makeConfigWithSurfaces();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    // Confirm test precondition: surfaces were applied
    expect(scoped.permissionScope?.forbidden.length).toBeGreaterThan(0);
    expect(scopeConfigEmptyWarning(scoped)).toBeNull();
  });

  it("returns null when descriptor has exactly 1 forbidden surface", () => {
    const descriptor: PipelineDescriptor = {
      ...FAST_DESCRIPTOR,
      permissionScope: {
        checkpoint: "conformance",
        forbidden: [{ id: "one-surface", paths: ["src/a/**"] }],
      },
    };
    expect(scopeConfigEmptyWarning(descriptor)).toBeNull();
  });

  it("returns null when descriptor has multiple forbidden surfaces", () => {
    const descriptor: PipelineDescriptor = {
      ...FAST_DESCRIPTOR,
      permissionScope: {
        checkpoint: "conformance",
        forbidden: [
          { id: "surface-a", paths: ["src/a/**"] },
          { id: "surface-b", paths: ["src/b/**"] },
        ],
      },
    };
    expect(scopeConfigEmptyWarning(descriptor)).toBeNull();
  });
});

describe("TC-SW-003: scopeConfigEmptyWarning — permissionScope present + forbidden = 0 → warning string", () => {
  it("returns a non-null string for static FAST_DESCRIPTOR (forbidden=[] before config resolution)", () => {
    // FAST_DESCRIPTOR has empty forbidden by design
    const result = scopeConfigEmptyWarning(FAST_DESCRIPTOR);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("returns a non-null string for fast descriptor resolved with no surfaces config", () => {
    const config = makeConfig(); // no pipeline.fast surfaces
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    expect(scoped.permissionScope?.forbidden).toHaveLength(0);
    const result = scopeConfigEmptyWarning(scoped);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });
});

describe("TC-SW-004: scopeConfigEmptyWarning — warning contains pipeline id and config key", () => {
  it("warning includes the pipeline id ('fast')", () => {
    const config = makeConfig();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    const warning = scopeConfigEmptyWarning(scoped);
    expect(warning).toContain("fast");
  });

  it("warning includes the config key 'pipeline.fast.forbiddenSurfaces'", () => {
    const config = makeConfig();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    const warning = scopeConfigEmptyWarning(scoped);
    expect(warning).toContain("pipeline.fast.forbiddenSurfaces");
  });

  it("warning indicates detection is disabled/ineffective", () => {
    const config = makeConfig();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);
    const warning = scopeConfigEmptyWarning(scoped);
    // Should convey that scope breach detection is not active
    expect(warning?.toLowerCase()).toMatch(/disabled|ineffective|effectively|no forbidden/);
  });

  it("warning for a hypothetical scoped 'custom-fast' pipeline contains its id and config key", () => {
    // Verifies the warning is general (not hardcoded to 'fast')
    const customDescriptor: PipelineDescriptor = {
      ...FAST_DESCRIPTOR,
      id: "custom-fast",
      permissionScope: {
        checkpoint: "conformance",
        forbidden: [],
      },
    };
    const warning = scopeConfigEmptyWarning(customDescriptor);
    expect(warning).toContain("custom-fast");
    expect(warning).toContain("pipeline.custom-fast.forbiddenSurfaces");
  });
});

describe("TC-SW-005: scopeConfigEmptyWarning — no stderr side effect", () => {
  it("does not write to stderr (pure function)", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = makeConfig();
    const scoped = applyScopeConfig(FAST_DESCRIPTOR, config);

    // Even when a warning is generated, no I/O should occur
    scopeConfigEmptyWarning(scoped);
    scopeConfigEmptyWarning(STANDARD_DESCRIPTOR);
    scopeConfigEmptyWarning(DESIGN_ONLY_DESCRIPTOR);

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// scopeConfigWarningForJob
// ---------------------------------------------------------------------------

describe("TC-SW-006: scopeConfigWarningForJob — fast + no surfaces config → non-null", () => {
  it("returns non-null for fast jobState with no forbidden surfaces config", () => {
    const jobState = makeFastJobState();
    const config = makeConfig(); // no pipeline.fast surfaces
    const result = scopeConfigWarningForJob(jobState, config);
    expect(result).not.toBeNull();
  });

  it("contains 'pipeline.fast.forbiddenSurfaces' in the warning", () => {
    const jobState = makeFastJobState();
    const config = makeConfig();
    const result = scopeConfigWarningForJob(jobState, config);
    expect(result).toContain("pipeline.fast.forbiddenSurfaces");
  });
});

describe("TC-SW-007: scopeConfigWarningForJob — fast + surfaces config → null", () => {
  it("returns null for fast jobState when forbidden surfaces are configured", () => {
    const jobState = makeFastJobState();
    const config = makeConfigWithSurfaces();
    const result = scopeConfigWarningForJob(jobState, config);
    expect(result).toBeNull();
  });
});

describe("TC-SW-008: scopeConfigWarningForJob — standard jobState → null", () => {
  it("returns null for standard jobState (pipelineId absent → 'standard')", () => {
    const jobState = makeStandardJobState(); // pipelineId absent → resolves to standard
    const config = makeConfig();
    expect(scopeConfigWarningForJob(jobState, config)).toBeNull();
  });

  it("returns null for explicit pipelineId='standard'", () => {
    const jobState = makeStandardJobState({ pipelineId: "standard" });
    const config = makeConfig();
    expect(scopeConfigWarningForJob(jobState, config)).toBeNull();
  });
});

describe("TC-SW-009: scopeConfigWarningForJob — judgment on config-resolved descriptor", () => {
  it("does NOT warn for fast+surfaces because resolution happens inside the function", () => {
    // Static FAST_DESCRIPTOR.permissionScope.forbidden is always []
    // but after applyScopeConfig with surfaces config, forbidden ≥ 1 → no warning
    const jobState = makeFastJobState();
    const config = makeConfigWithSurfaces();
    // If the function incorrectly judged on the static descriptor, it would return non-null
    // because FAST_DESCRIPTOR.forbidden is always [].
    // Correct behavior: returns null because resolved forbidden ≥ 1.
    expect(scopeConfigWarningForJob(jobState, config)).toBeNull();
  });
});

describe("TC-SW-010: scopeConfigWarningForJob — no stderr side effect", () => {
  it("does not write to stderr (pure function)", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fastJob = makeFastJobState();
    const standardJob = makeStandardJobState();
    const config = makeConfig();

    scopeConfigWarningForJob(fastJob, config); // would generate a warning
    scopeConfigWarningForJob(standardJob, config); // no warning

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

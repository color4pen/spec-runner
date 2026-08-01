/**
 * Unit tests for the staging config field validation.
 *
 * Covers:
 *   TC-007 (must): invalid `stagingExcludePatterns` and `maxStagedFiles` values rejected
 *                  with CONFIG_INVALID
 *   TC-008 (must): valid staging config is accepted; omitted fields validate without
 *                  defaults injected
 *
 * RED state: tests fail until T-08 adds stagingExcludePatterns / maxStagedFiles to the
 * pipeline validation schema in src/config/schema/validation.ts.
 */

import { describe, it, expect } from "vitest";
import { validateConfig } from "../schema.js";

// ---------------------------------------------------------------------------
// TC-007: invalid values rejected with CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-007: invalid stagingExcludePatterns values are rejected with CONFIG_INVALID", () => {
  it(
    // TC-007
    "TC-007: pipeline.stagingExcludePatterns: [] (empty array) throws CONFIG_INVALID",
    () => {
      // GIVEN a config with pipeline.stagingExcludePatterns: []
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: [],
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
    },
  );

  it(
    // TC-007
    'TC-007: pipeline.stagingExcludePatterns: [""] (empty string element) throws CONFIG_INVALID',
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: [""],
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.stagingExcludePatterns with non-string element (number) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: ["vendor/**", 42],
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.stagingExcludePatterns with non-string element (boolean) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: [true],
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.stagingExcludePatterns with mixed valid and empty-string elements throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: ["vendor/**", ""],
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
    },
  );
});

describe("TC-007: invalid maxStagedFiles values are rejected with CONFIG_INVALID", () => {
  it(
    // TC-007
    "TC-007: pipeline.maxStagedFiles: 0 throws CONFIG_INVALID",
    () => {
      // GIVEN a config with pipeline.maxStagedFiles: 0 (must be positive)
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 0,
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.maxStagedFiles: -1 (negative) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: -1,
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.maxStagedFiles: 1.5 (non-integer) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 1.5,
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
    },
  );

  it(
    // TC-007
    "TC-007: pipeline.maxStagedFiles: -100 (large negative) throws CONFIG_INVALID",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: -100,
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
    },
  );
});

// ---------------------------------------------------------------------------
// TC-008: valid staging config accepted; omitted fields validate without defaults injected
// ---------------------------------------------------------------------------

describe("TC-008: valid staging config is accepted and fields are preserved", () => {
  it(
    // TC-008
    "TC-008: valid pipeline.stagingExcludePatterns: [\"vendor/**\"] is accepted and preserved",
    () => {
      // GIVEN a config with a valid stagingExcludePatterns array
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: ["vendor/**"],
        },
      };

      // WHEN the config is validated
      const cfg = validateConfig(raw);

      // THEN validation succeeds and the field is preserved
      expect(cfg.pipeline?.stagingExcludePatterns).toEqual(["vendor/**"]);
    },
  );

  it(
    // TC-008
    "TC-008: valid pipeline.maxStagedFiles: 5000 is accepted and preserved",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 5000,
        },
      };

      const cfg = validateConfig(raw);

      expect(cfg.pipeline?.maxStagedFiles).toBe(5000);
    },
  );

  it(
    // TC-008
    "TC-008: both valid fields together are accepted and preserved",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          stagingExcludePatterns: ["vendor/**", ".cargo-tmp/**"],
          maxStagedFiles: 5000,
        },
      };

      const cfg = validateConfig(raw);

      expect(cfg.pipeline?.stagingExcludePatterns).toEqual(["vendor/**", ".cargo-tmp/**"]);
      expect(cfg.pipeline?.maxStagedFiles).toBe(5000);
    },
  );

  it(
    // TC-008
    "TC-008: pipeline.maxStagedFiles: 1 (minimum positive integer) is accepted",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxStagedFiles: 1,
        },
      };

      const cfg = validateConfig(raw);
      expect(cfg.pipeline?.maxStagedFiles).toBe(1);
    },
  );

  it(
    // TC-008
    "TC-008: config omitting both fields validates unchanged — no defaults injected at config layer",
    () => {
      // GIVEN a config that omits pipeline.stagingExcludePatterns and pipeline.maxStagedFiles
      const raw = {
        version: 1,
        agents: {},
      };

      // WHEN the config is validated
      const cfg = validateConfig(raw);

      // THEN validation succeeds and both fields are absent (no defaults injected)
      expect(cfg.pipeline?.stagingExcludePatterns).toBeUndefined();
      expect(cfg.pipeline?.maxStagedFiles).toBeUndefined();
    },
  );

  it(
    // TC-008
    "TC-008: empty pipeline block (no staging fields) validates unchanged",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {},
      };

      const cfg = validateConfig(raw);

      expect(cfg.pipeline?.stagingExcludePatterns).toBeUndefined();
      expect(cfg.pipeline?.maxStagedFiles).toBeUndefined();
    },
  );

  it(
    // TC-008
    "TC-008: existing pipeline.maxRetries field is unaffected by new staging fields",
    () => {
      const raw = {
        version: 1,
        agents: {},
        pipeline: {
          maxRetries: 3,
          stagingExcludePatterns: ["vendor/**"],
          maxStagedFiles: 2000,
        },
      };

      const cfg = validateConfig(raw);

      expect(cfg.pipeline?.maxRetries).toBe(3);
      expect(cfg.pipeline?.stagingExcludePatterns).toEqual(["vendor/**"]);
      expect(cfg.pipeline?.maxStagedFiles).toBe(2000);
    },
  );
});
